# Phase 5: Image & Media System — Design Spec

> Validated design for the WhatStage AI chatbot image and media subsystem.  
> Parent spec: `2026-04-18-ai-chatbot-rag-design.md`

---

## 1. Goal

Enable the AI chatbot to send relevant images (product photos, diagrams, promotional material) alongside text responses in Messenger conversations. Images are managed per-tenant, selected via a hybrid tag + semantic approach, and delivered after the text message.

---

## 2. Architecture Overview

Three new modules plus two integrations into existing code:

### New Modules

| Module | Path | Purpose |
|--------|------|---------|
| Image CRUD API | `src/app/api/knowledge/images/route.ts` | Create/read/update/delete knowledge images with Cloudinary upload and eager embedding |
| Image Selector | `src/lib/ai/image-selector.ts` | Hybrid tag-filter + semantic re-rank to pick relevant images per conversation turn |
| Response Parser | `src/lib/ai/response-parser.ts` | Strip leaked `[SEND_IMAGE:id]` tokens from LLM text output |

### Integrations

| Target | Change |
|--------|--------|
| `src/lib/ai/conversation-engine.ts` | Call image selector before prompt building; send images after text via Messenger |
| `src/lib/fb/send.ts` | Add `ImageMessage` type and image attachment sending |

---

## 3. Data Flow

```
Lead sends message
  -> Conversation Engine receives it
  -> Retriever fetches RAG chunks
  -> Image Selector: tag-filter by phase/query -> semantic re-rank -> top N images
  -> Prompt Builder includes selected images in Layer 6
  -> LLM returns JSON with message + image_ids
  -> Decision Parser extracts image_ids (already implemented)
  -> Response Parser strips any leaked [SEND_IMAGE:id] tokens from message text
  -> Send text message to Messenger
  -> Send each image as separate attachment message (text first, then images)
  -> Return EngineOutput with imageIds
```

---

## 4. Database Changes

### 4.1 Add embedding column to `knowledge_images`

```sql
alter table knowledge_images
  add column embedding vector(1536);

create index on knowledge_images
  using hnsw (embedding vector_cosine_ops)
  with (m = 24, ef_construction = 128);
```

### 4.2 Add tenant-level image limit

```sql
alter table tenants
  add column max_images_per_response integer not null default 2
  constraint max_images_check check (max_images_per_response between 1 and 5);
```

### 4.3 Add vector search RPC for images

```sql
create or replace function match_knowledge_images(
  query_embedding        vector(1536),
  p_tenant_id            uuid,
  p_candidate_ids        uuid[],
  p_top_k                integer default 3,
  p_similarity_threshold float default 0.3
)
returns table(
  id          uuid,
  url         text,
  description text,
  context_hint text,
  similarity  float
)
language sql stable
as $$
  select
    ki.id,
    ki.url,
    ki.description,
    ki.context_hint,
    1 - (ki.embedding <=> query_embedding) as similarity
  from knowledge_images ki
  where ki.tenant_id = p_tenant_id
    and ki.id = any(p_candidate_ids)
    and ki.embedding is not null
    and 1 - (ki.embedding <=> query_embedding) >= p_similarity_threshold
  order by ki.embedding <=> query_embedding
  limit p_top_k;
$$;
```

The `p_candidate_ids` parameter restricts the semantic search to the tag-filtered candidate set, keeping costs bounded.

### 4.4 RLS policies

The existing RLS policy on `knowledge_images` (tenant isolation via `tenant_id`) already covers the new column. No new policies needed — the embedding column is data, not an access vector.

---

## 5. Image CRUD API

### Endpoint: `POST /api/knowledge/images`

**Request**: `multipart/form-data`
- `file` — image file (required)
- `description` — text description (required, max 500 chars)
- `tags` — JSON array of strings (required, at least 1 tag)
- `context_hint` — optional hint for when to show this image

**Validation**:
- File types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- Max file size: 10MB
- Tenant isolation: extracted from auth session

**Flow**:
1. Validate file type and size
2. Upload to Cloudinary via server-side SDK (folder: `whatstage/{tenant_id}/knowledge`)
3. Embed the description text using `embedText()` from `src/lib/ai/embedding.ts`
4. Insert row into `knowledge_images` with Cloudinary URL, description, tags, context_hint, and embedding
5. Return the created image record

**Error responses**:
- 400: Invalid file type, missing fields, description too long
- 413: File too large
- 502: Cloudinary upload failure (with retry hint)
- 401/403: Auth/tenant mismatch

### Endpoint: `GET /api/knowledge/images`

Returns all images for the authenticated tenant. Supports optional `?tag=` query parameter to filter by tag.

### Endpoint: `PATCH /api/knowledge/images/[id]`

Update description, tags, or context_hint. If description changes, re-embed it automatically.

### Endpoint: `DELETE /api/knowledge/images/[id]`

Delete the image record and remove from Cloudinary. Validates tenant ownership before deletion.

---

## 6. Image Selector

### Module: `src/lib/ai/image-selector.ts`

**Input**:
```typescript
interface ImageSelectionContext {
  tenantId: string;
  leadMessage: string;
  currentPhaseName: string;
  retrievedChunks: ChunkResult[];
  maxImages: number; // from tenant config
}
```

**Output**:
```typescript
interface SelectedImage {
  id: string;
  url: string;
  description: string;
  contextHint: string | null;
  similarity: number;
}
```

### Selection Algorithm (Hybrid: Tag Filter + Semantic Re-rank)

**Step 1 — Extract search tags**:
- Current phase name (lowercased, trimmed)
- Keywords from lead message (split on whitespace, filter stopwords, lowercase)
- Tags from retrieved chunk metadata (if chunks have `image_tags` in metadata)
- Deduplicate the combined tag set

**Step 2 — Tag filter**:
```sql
SELECT id FROM knowledge_images
WHERE tenant_id = $1
AND tags && $2::text[]  -- array overlap operator
```
This returns all images where at least one tag matches. If zero results, return empty array (no images for this turn).

**Step 3 — Semantic re-rank**:
- Embed the lead message using `embedText()`
- Call `match_knowledge_images()` RPC with the candidate IDs from step 2
- Returns images sorted by semantic similarity, filtered by threshold (0.3)

**Step 4 — Return top N**:
- N = `maxImages` from tenant config
- Return the top N images from step 3

### Edge Cases

- **No tag matches**: Return empty array. Conversation proceeds text-only.
- **Tag matches but all below similarity threshold**: Return empty array.
- **Fewer matches than maxImages**: Return whatever matches exist.
- **Embedding failure**: Log error, return empty array (graceful degradation).

---

## 7. Response Parser

### Module: `src/lib/ai/response-parser.ts`

Safety-net parser that strips `[SEND_IMAGE:id]` tokens from LLM text output. The primary image flow uses the `image_ids` JSON array from the decision parser, but LLMs sometimes leak instructed tokens into their text.

**Function**:
```typescript
interface ParsedResponse {
  cleanMessage: string;
  extractedImageIds: string[];
}

function parseResponse(rawMessage: string): ParsedResponse
```

**Logic**:
1. Regex scan for `[SEND_IMAGE:<uuid>]` pattern in the message text
2. Extract all matched UUIDs into `extractedImageIds`
3. Remove all matched tokens from the text to produce `cleanMessage`
4. Trim any resulting double-spaces or leading/trailing whitespace

**Integration point**: Called in the conversation engine after decision parsing, before sending to Messenger. The `extractedImageIds` are merged with the decision parser's `imageIds` (deduplicated).

---

## 8. Messenger Send API Integration

### New message type in `src/lib/fb/send.ts`

```typescript
interface ImageMessage {
  type: "image";
  url: string;
}
```

### Facebook Graph API payload for images

```json
{
  "recipient": { "id": "<PSID>" },
  "message": {
    "attachment": {
      "type": "image",
      "payload": {
        "url": "<CLOUDINARY_URL>",
        "is_reusable": true
      }
    }
  }
}
```

### Sending flow in conversation engine

After the text message is sent successfully:
1. Collect final image IDs (union of decision parser + response parser, deduplicated)
2. Validate each ID exists in tenant's `knowledge_images` table
3. Fetch URLs for valid IDs
4. Send each image as a separate `ImageMessage` (sequentially, to preserve order)
5. Errors on individual image sends are logged but do not fail the overall response

### Delivery order

Text message first, then images in the order the LLM specified them. This gives the user context before visuals.

---

## 9. Conversation Engine Changes

### In `src/lib/ai/conversation-engine.ts`

The `handleMessage()` function gains these steps (inserted into the existing flow):

```
[existing] Retrieve RAG chunks
[NEW]      Fetch tenant's max_images_per_response setting
[NEW]      Call imageSelector.selectImages({ tenantId, leadMessage, currentPhaseName, chunks, maxImages })
[existing] Build system prompt (pass selected images to Layer 6)
[existing] Call LLM
[existing] Parse decision (image_ids already extracted)
[NEW]      Call responseParser.parseResponse(decision.message)
[NEW]      Merge & deduplicate image IDs (decision + response parser)
[NEW]      Validate image IDs against tenant's knowledge_images
[existing] Send text message
[NEW]      Send validated images via Messenger (text first, then images)
[existing] Return EngineOutput
```

### Updated EngineInput (no changes needed)

The existing `EngineInput` interface is sufficient.

### Updated EngineOutput (no changes needed)

The existing `imageIds: string[]` field already carries the information downstream.

---

## 10. Security

| Concern | Mitigation |
|---------|------------|
| Tenant isolation | RLS on `knowledge_images` + explicit `tenant_id` checks in API routes |
| Upload abuse | File type whitelist (`jpeg`, `png`, `webp`, `gif`), 10MB size limit |
| Cloudinary security | Server-side SDK only, no unsigned client uploads |
| LLM image ID injection | Validate all `image_ids` against tenant's actual `knowledge_images` rows before sending |
| Token leakage | Response parser strips `[SEND_IMAGE:id]` tokens so users never see raw tokens |
| Rate limiting | Upload endpoint rate-limited (10 uploads per minute per tenant) |
| Messenger API abuse | Images only sent from validated Cloudinary URLs owned by the tenant |

---

## 11. Testing Plan

### Unit Tests

| Test | File |
|------|------|
| Image selector: tag extraction from message/phase/chunks | `tests/unit/ai/image-selector.test.ts` |
| Image selector: empty results when no tags match | `tests/unit/ai/image-selector.test.ts` |
| Image selector: respects maxImages limit | `tests/unit/ai/image-selector.test.ts` |
| Image selector: graceful degradation on embedding failure | `tests/unit/ai/image-selector.test.ts` |
| Response parser: strips `[SEND_IMAGE:uuid]` tokens | `tests/unit/ai/response-parser.test.ts` |
| Response parser: handles no tokens (passthrough) | `tests/unit/ai/response-parser.test.ts` |
| Response parser: handles malformed tokens | `tests/unit/ai/response-parser.test.ts` |
| Image CRUD: validates file types | `tests/unit/api/knowledge-images.test.ts` |
| Image CRUD: validates file size | `tests/unit/api/knowledge-images.test.ts` |
| Image CRUD: re-embeds on description update | `tests/unit/api/knowledge-images.test.ts` |
| Messenger send: ImageMessage payload format | `tests/unit/fb/send-image.test.ts` |

### Integration Tests

| Test | File |
|------|------|
| Upload image -> embedding stored -> selector finds it | `tests/integration/ai/image-pipeline.test.ts` |
| Full conversation: lead asks about product -> LLM returns image_ids -> images validated and "sent" | `tests/integration/ai/image-conversation.test.ts` |
| Image selector with real vector search (seeded images) | `tests/integration/ai/image-selector.test.ts` |
| CRUD lifecycle: create -> read -> update (re-embed) -> delete | `tests/integration/api/knowledge-images.test.ts` |

---

## 12. Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/0006_image_embedding_column.sql` | Add embedding column, HNSW index, tenant config, RPC |
| `src/app/api/knowledge/images/route.ts` | Image CRUD API (POST, GET) |
| `src/app/api/knowledge/images/[id]/route.ts` | Image CRUD API (PATCH, DELETE) |
| `src/lib/ai/image-selector.ts` | Hybrid tag + semantic image selection |
| `src/lib/ai/response-parser.ts` | Strip `[SEND_IMAGE:id]` tokens from LLM text |
| `tests/unit/ai/image-selector.test.ts` | Image selector unit tests |
| `tests/unit/ai/response-parser.test.ts` | Response parser unit tests |
| `tests/unit/api/knowledge-images.test.ts` | CRUD validation unit tests |
| `tests/unit/fb/send-image.test.ts` | Messenger image send unit tests |
| `tests/integration/ai/image-pipeline.test.ts` | Upload -> embed -> select integration |
| `tests/integration/ai/image-conversation.test.ts` | Full conversation with images integration |
| `tests/integration/ai/image-selector.test.ts` | Selector with real vector search |
| `tests/integration/api/knowledge-images.test.ts` | CRUD lifecycle integration |

## 13. Files to Modify

| File | Change |
|------|--------|
| `src/lib/fb/send.ts` | Add `ImageMessage` type to `OutboundMessage` union, add image attachment payload builder |
| `src/lib/ai/conversation-engine.ts` | Add image selection step, response parsing step, image sending step |
| `src/types/database.ts` | Add `embedding` field to `knowledge_images` type, add `max_images_per_response` to `tenants` type |
