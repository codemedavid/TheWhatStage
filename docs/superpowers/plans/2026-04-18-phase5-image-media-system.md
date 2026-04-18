# Phase 5: Image & Media System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the AI chatbot to send relevant images alongside text responses in Messenger, with tenant-managed image CRUD, hybrid tag+semantic selection, and safety-net token stripping.

**Architecture:** Three new modules (Image CRUD API, Image Selector, Response Parser) plus integrations into the existing conversation engine and Messenger Send API. Images are uploaded to Cloudinary, descriptions are eagerly embedded for semantic search, and a hybrid tag-filter + semantic re-rank selects relevant images per conversation turn.

**Tech Stack:** Next.js App Router, Supabase (pgvector), Cloudinary Node SDK, HuggingFace embeddings, Vitest, Zod

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/0006_image_embedding_column.sql` | DB migration: embedding column, HNSW index, tenant config, RPC |
| `src/lib/cloudinary.ts` | Cloudinary client config + upload helper |
| `src/lib/ai/image-selector.ts` | Hybrid tag-filter + semantic re-rank image selection |
| `src/lib/ai/response-parser.ts` | Strip `[SEND_IMAGE:id]` tokens from LLM text |
| `src/app/api/knowledge/images/route.ts` | POST (create) + GET (list) image endpoints |
| `src/app/api/knowledge/images/[id]/route.ts` | PATCH (update) + DELETE image endpoints |
| `tests/unit/response-parser.test.ts` | Response parser unit tests |
| `tests/unit/image-selector.test.ts` | Image selector unit tests |
| `tests/unit/knowledge-images.test.ts` | Image CRUD API unit tests |
| `tests/unit/send-image.test.ts` | Messenger image send unit tests |
| `tests/integration/image-pipeline.test.ts` | End-to-end image upload -> select -> send integration |
| `tests/integration/image-conversation.test.ts` | Full conversation with images integration |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/fb/send.ts` | Add `ImageMessage` type + image attachment builder |
| `src/lib/ai/conversation-engine.ts` | Add image selection, response parsing, image sending steps |
| `src/types/database.ts` | Add `embedding` to `knowledge_images`, `max_images_per_response` to `tenants`, `match_knowledge_images` RPC type |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/0006_image_embedding_column.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0006_image_embedding_column.sql`:

```sql
-- Phase 5: Image embedding support + tenant image config

-- 1. Add embedding column to knowledge_images
alter table knowledge_images
  add column embedding vector(1536);

-- 2. HNSW index for fast cosine similarity search on image embeddings
create index knowledge_images_embedding_idx
  on knowledge_images
  using hnsw (embedding vector_cosine_ops)
  with (m = 24, ef_construction = 128);

-- 3. Tenant-level max images per response config
alter table tenants
  add column max_images_per_response integer not null default 2
  constraint max_images_per_response_check check (max_images_per_response between 1 and 5);

-- 4. RPC function: semantic search over pre-filtered image candidates
create or replace function match_knowledge_images(
  query_embedding        vector(1536),
  p_tenant_id            uuid,
  p_candidate_ids        uuid[],
  p_top_k                integer default 3,
  p_similarity_threshold float default 0.3
)
returns table(
  id           uuid,
  url          text,
  description  text,
  context_hint text,
  similarity   float
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

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: Migration applied successfully. Verify by checking for the new column and function in the Supabase dashboard or via SQL: `SELECT column_name FROM information_schema.columns WHERE table_name = 'knowledge_images' AND column_name = 'embedding';`

- [ ] **Step 3: Update TypeScript database types**

Edit `src/types/database.ts`:

In the `knowledge_images` `TableRow`, add `embedding`:
```typescript
knowledge_images: TableRow<{
  id: string;
  tenant_id: string;
  url: string;
  description: string;
  tags: string[];
  context_hint: string | null;
  embedding: number[] | null;
  created_at: string;
}>;
```

In the `tenants` `TableRow`, add `max_images_per_response`:
```typescript
tenants: TableRow<{
  id: string;
  slug: string;
  name: string;
  business_type: "ecommerce" | "real_estate" | "digital_product" | "services";
  bot_goal: "qualify_leads" | "sell" | "understand_intent" | "collect_lead_info";
  fb_page_id: string | null;
  fb_page_token: string | null;
  fb_app_secret: string | null;
  fb_verify_token: string | null;
  max_images_per_response: number;
  created_at: string;
}>;
```

In the `Functions` section, add `match_knowledge_images`:
```typescript
match_knowledge_images: {
  Args: {
    query_embedding: number[];
    p_tenant_id: string;
    p_candidate_ids: string[];
    p_top_k?: number;
    p_similarity_threshold?: number;
  };
  Returns: {
    id: string;
    url: string;
    description: string;
    context_hint: string | null;
    similarity: number;
  }[];
};
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_image_embedding_column.sql src/types/database.ts
git commit -m "feat: add image embedding column, tenant config, and image search RPC"
```

---

## Task 2: Cloudinary Client Setup

**Files:**
- Create: `src/lib/cloudinary.ts`

- [ ] **Step 1: Install the Cloudinary SDK**

Run: `npm install cloudinary`
Expected: `cloudinary` added to `package.json` dependencies.

- [ ] **Step 2: Create the Cloudinary helper module**

Create `src/lib/cloudinary.ts`:

```typescript
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export interface UploadResult {
  url: string;
  publicId: string;
}

/**
 * Validate an image file's type and size before upload.
 * Throws a descriptive error if validation fails.
 */
export function validateImageFile(file: File): void {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new ValidationError(
      `Invalid file type: ${file.type}. Allowed: jpeg, png, webp, gif`
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new ValidationError(
      `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 10MB`
    );
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Upload an image buffer to Cloudinary.
 * Returns the secure URL and public ID.
 */
export async function uploadImage(
  buffer: Buffer,
  tenantId: string
): Promise<UploadResult> {
  const result = await new Promise<{ secure_url: string; public_id: string }>(
    (resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `whatstage/${tenantId}/knowledge`,
          resource_type: "image",
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error("Upload failed"));
          resolve(result);
        }
      );
      stream.end(buffer);
    }
  );

  return { url: result.secure_url, publicId: result.public_id };
}

/**
 * Delete an image from Cloudinary by its public ID.
 */
export async function deleteImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/cloudinary.ts package.json package-lock.json
git commit -m "feat: add Cloudinary client with upload/delete helpers"
```

---

## Task 3: Response Parser (TDD)

**Files:**
- Create: `src/lib/ai/response-parser.ts`
- Create: `tests/unit/response-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/response-parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseResponse } from "@/lib/ai/response-parser";

describe("parseResponse", () => {
  it("passes through a message with no SEND_IMAGE tokens", () => {
    const result = parseResponse("Here is our latest product!");
    expect(result.cleanMessage).toBe("Here is our latest product!");
    expect(result.extractedImageIds).toEqual([]);
  });

  it("extracts a single SEND_IMAGE token and removes it from text", () => {
    const result = parseResponse(
      "Check out this product! [SEND_IMAGE:550e8400-e29b-41d4-a716-446655440000]"
    );
    expect(result.cleanMessage).toBe("Check out this product!");
    expect(result.extractedImageIds).toEqual([
      "550e8400-e29b-41d4-a716-446655440000",
    ]);
  });

  it("extracts multiple SEND_IMAGE tokens", () => {
    const result = parseResponse(
      "Here are two options [SEND_IMAGE:aaa-bbb-ccc] and [SEND_IMAGE:ddd-eee-fff] for you."
    );
    expect(result.cleanMessage).toBe("Here are two options and for you.");
    expect(result.extractedImageIds).toEqual(["aaa-bbb-ccc", "ddd-eee-fff"]);
  });

  it("handles token at the start of the message", () => {
    const result = parseResponse(
      "[SEND_IMAGE:abc-123] Here is the item."
    );
    expect(result.cleanMessage).toBe("Here is the item.");
    expect(result.extractedImageIds).toEqual(["abc-123"]);
  });

  it("ignores malformed tokens (missing brackets, no ID)", () => {
    const result = parseResponse(
      "Check SEND_IMAGE:abc and [SEND_IMAGE:] too"
    );
    expect(result.cleanMessage).toBe("Check SEND_IMAGE:abc and [SEND_IMAGE:] too");
    expect(result.extractedImageIds).toEqual([]);
  });

  it("handles empty string input", () => {
    const result = parseResponse("");
    expect(result.cleanMessage).toBe("");
    expect(result.extractedImageIds).toEqual([]);
  });

  it("collapses extra whitespace after token removal", () => {
    const result = parseResponse(
      "Look at this  [SEND_IMAGE:img-1]  product"
    );
    expect(result.cleanMessage).toBe("Look at this product");
    expect(result.extractedImageIds).toEqual(["img-1"]);
  });

  it("deduplicates repeated image IDs", () => {
    const result = parseResponse(
      "[SEND_IMAGE:same-id] text [SEND_IMAGE:same-id]"
    );
    expect(result.cleanMessage).toBe("text");
    expect(result.extractedImageIds).toEqual(["same-id"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/response-parser.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ai/response-parser'`

- [ ] **Step 3: Implement the response parser**

Create `src/lib/ai/response-parser.ts`:

```typescript
export interface ParsedResponse {
  cleanMessage: string;
  extractedImageIds: string[];
}

const SEND_IMAGE_REGEX = /\[SEND_IMAGE:([^\]\s]+)\]/g;

/**
 * Strip [SEND_IMAGE:id] tokens from LLM text output.
 * Returns the cleaned message and any extracted image IDs (deduplicated).
 */
export function parseResponse(rawMessage: string): ParsedResponse {
  const ids: string[] = [];

  const cleaned = rawMessage.replace(SEND_IMAGE_REGEX, (_, id: string) => {
    if (id.length > 0) {
      ids.push(id);
    }
    return "";
  });

  // Collapse multiple spaces into one, trim
  const cleanMessage = cleaned.replace(/\s{2,}/g, " ").trim();

  // Deduplicate
  const extractedImageIds = [...new Set(ids)];

  return { cleanMessage, extractedImageIds };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/response-parser.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/response-parser.ts tests/unit/response-parser.test.ts
git commit -m "feat: add response parser to strip SEND_IMAGE tokens from LLM text"
```

---

## Task 4: Image Selector (TDD)

**Files:**
- Create: `src/lib/ai/image-selector.ts`
- Create: `tests/unit/image-selector.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/image-selector.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

const mockEmbedText = vi.fn();
vi.mock("@/lib/ai/embedding", () => ({
  embedText: mockEmbedText,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

import { selectImages, extractSearchTags } from "@/lib/ai/image-selector";

// --- extractSearchTags tests ---

describe("extractSearchTags", () => {
  it("extracts phase name as a tag", () => {
    const tags = extractSearchTags({
      currentPhaseName: "Product Discovery",
      leadMessage: "",
      retrievedChunks: [],
    });
    expect(tags).toContain("product discovery");
  });

  it("extracts keywords from lead message, filtering stopwords", () => {
    const tags = extractSearchTags({
      currentPhaseName: "",
      leadMessage: "Show me the red shoes please",
      retrievedChunks: [],
    });
    expect(tags).toContain("red");
    expect(tags).toContain("shoes");
    expect(tags).not.toContain("me");
    expect(tags).not.toContain("the");
    expect(tags).not.toContain("please");
  });

  it("extracts image_tags from chunk metadata", () => {
    const tags = extractSearchTags({
      currentPhaseName: "",
      leadMessage: "",
      retrievedChunks: [
        { id: "c1", content: "", similarity: 0.8, metadata: { image_tags: ["sneakers", "athletic"] } },
      ],
    });
    expect(tags).toContain("sneakers");
    expect(tags).toContain("athletic");
  });

  it("deduplicates and lowercases all tags", () => {
    const tags = extractSearchTags({
      currentPhaseName: "Shoes",
      leadMessage: "shoes SHOES",
      retrievedChunks: [],
    });
    const shoeCount = tags.filter((t) => t === "shoes").length;
    expect(shoeCount).toBe(1);
  });

  it("returns empty array when no meaningful tags found", () => {
    const tags = extractSearchTags({
      currentPhaseName: "",
      leadMessage: "the a is",
      retrievedChunks: [],
    });
    expect(tags).toEqual([]);
  });
});

// --- selectImages tests ---

describe("selectImages", () => {
  it("returns empty array when tag filter finds no matches", async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          overlaps: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const result = await selectImages({
      tenantId: "t-1",
      leadMessage: "hello",
      currentPhaseName: "Greeting",
      retrievedChunks: [],
      maxImages: 2,
    });

    expect(result).toEqual([]);
  });

  it("returns semantically ranked images when tag filter has matches", async () => {
    // Tag filter returns candidate IDs
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          overlaps: vi.fn().mockResolvedValue({
            data: [{ id: "img-1" }, { id: "img-2" }],
            error: null,
          }),
        }),
      }),
    });

    // Embedding
    mockEmbedText.mockResolvedValueOnce(new Array(1536).fill(0.1));

    // Semantic re-rank via RPC
    mockRpc.mockResolvedValueOnce({
      data: [
        { id: "img-2", url: "https://img2.jpg", description: "Red shoes", context_hint: null, similarity: 0.85 },
        { id: "img-1", url: "https://img1.jpg", description: "Blue shoes", context_hint: "show for footwear", similarity: 0.72 },
      ],
      error: null,
    });

    const result = await selectImages({
      tenantId: "t-1",
      leadMessage: "show me red shoes",
      currentPhaseName: "Product Discovery",
      retrievedChunks: [],
      maxImages: 2,
    });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("img-2");
    expect(result[0].similarity).toBe(0.85);
    expect(result[1].id).toBe("img-1");
  });

  it("respects maxImages limit", async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          overlaps: vi.fn().mockResolvedValue({
            data: [{ id: "img-1" }, { id: "img-2" }, { id: "img-3" }],
            error: null,
          }),
        }),
      }),
    });

    mockEmbedText.mockResolvedValueOnce(new Array(1536).fill(0.1));

    mockRpc.mockResolvedValueOnce({
      data: [
        { id: "img-1", url: "https://img1.jpg", description: "A", context_hint: null, similarity: 0.9 },
        { id: "img-2", url: "https://img2.jpg", description: "B", context_hint: null, similarity: 0.8 },
      ],
      error: null,
    });

    const result = await selectImages({
      tenantId: "t-1",
      leadMessage: "products",
      currentPhaseName: "Sales",
      retrievedChunks: [],
      maxImages: 1,
    });

    // RPC called with p_top_k = 1
    expect(mockRpc).toHaveBeenCalledWith("match_knowledge_images", expect.objectContaining({
      p_top_k: 1,
    }));
  });

  it("returns empty array on embedding failure (graceful degradation)", async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          overlaps: vi.fn().mockResolvedValue({
            data: [{ id: "img-1" }],
            error: null,
          }),
        }),
      }),
    });

    mockEmbedText.mockRejectedValueOnce(new Error("HF API down"));

    const result = await selectImages({
      tenantId: "t-1",
      leadMessage: "show products",
      currentPhaseName: "Sales",
      retrievedChunks: [],
      maxImages: 2,
    });

    expect(result).toEqual([]);
  });

  it("returns empty array when all extracted tags are empty", async () => {
    const result = await selectImages({
      tenantId: "t-1",
      leadMessage: "the a is",
      currentPhaseName: "",
      retrievedChunks: [],
      maxImages: 2,
    });

    expect(result).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/image-selector.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ai/image-selector'`

- [ ] **Step 3: Implement the image selector**

Create `src/lib/ai/image-selector.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/service";
import { embedText } from "@/lib/ai/embedding";
import type { ChunkResult } from "@/lib/ai/vector-search";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ImageSelectionContext {
  tenantId: string;
  leadMessage: string;
  currentPhaseName: string;
  retrievedChunks: ChunkResult[];
  maxImages: number;
}

export interface SelectedImage {
  id: string;
  url: string;
  description: string;
  contextHint: string | null;
  similarity: number;
}

// ---------------------------------------------------------------------------
// Stopwords — common English words to filter from keyword extraction
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
  "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "just", "because", "but", "and", "or", "if", "while", "about", "up",
  "what", "which", "who", "whom", "this", "that", "these", "those",
  "am", "i", "me", "my", "myself", "we", "our", "ours", "ourselves",
  "you", "your", "yours", "yourself", "yourselves", "he", "him", "his",
  "himself", "she", "her", "hers", "herself", "it", "its", "itself",
  "they", "them", "their", "theirs", "themselves", "show", "please",
  "tell", "give", "get", "let", "make", "know", "think", "want", "like",
]);

// ---------------------------------------------------------------------------
// Tag extraction
// ---------------------------------------------------------------------------

interface TagExtractionInput {
  currentPhaseName: string;
  leadMessage: string;
  retrievedChunks: ChunkResult[];
}

/**
 * Extract search tags from the current context.
 * Returns a deduplicated, lowercased array of meaningful keywords.
 */
export function extractSearchTags(input: TagExtractionInput): string[] {
  const tags = new Set<string>();

  // Phase name
  const phaseName = input.currentPhaseName.trim().toLowerCase();
  if (phaseName.length > 0) {
    tags.add(phaseName);
  }

  // Keywords from lead message
  const words = input.leadMessage
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));

  for (const word of words) {
    tags.add(word);
  }

  // Tags from chunk metadata
  for (const chunk of input.retrievedChunks) {
    const imageTags = chunk.metadata?.image_tags;
    if (Array.isArray(imageTags)) {
      for (const tag of imageTags) {
        if (typeof tag === "string" && tag.length > 0) {
          tags.add(tag.toLowerCase());
        }
      }
    }
  }

  return [...tags];
}

// ---------------------------------------------------------------------------
// Main selector
// ---------------------------------------------------------------------------

/**
 * Select relevant images for a conversation turn using hybrid
 * tag-filter + semantic re-rank.
 *
 * Returns up to `maxImages` images, sorted by semantic similarity.
 * Returns empty array on any failure (graceful degradation).
 */
export async function selectImages(
  ctx: ImageSelectionContext
): Promise<SelectedImage[]> {
  const searchTags = extractSearchTags({
    currentPhaseName: ctx.currentPhaseName,
    leadMessage: ctx.leadMessage,
    retrievedChunks: ctx.retrievedChunks,
  });

  // No meaningful tags → no images
  if (searchTags.length === 0) return [];

  const supabase = createServiceClient();

  // Step 1: Tag filter — find candidate images with overlapping tags
  const { data: candidates, error: tagError } = await supabase
    .from("knowledge_images")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .overlaps("tags", searchTags);

  if (tagError || !candidates || candidates.length === 0) return [];

  // Step 2: Semantic re-rank
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedText(ctx.leadMessage);
  } catch (err) {
    console.error("Image selector: embedding failed, skipping images", err);
    return [];
  }

  const candidateIds = candidates.map((c) => c.id);

  const { data: ranked, error: rpcError } = await supabase.rpc(
    "match_knowledge_images",
    {
      query_embedding: queryEmbedding,
      p_tenant_id: ctx.tenantId,
      p_candidate_ids: candidateIds,
      p_top_k: ctx.maxImages,
      p_similarity_threshold: 0.3,
    }
  );

  if (rpcError || !ranked) return [];

  return ranked.map((row) => ({
    id: row.id,
    url: row.url,
    description: row.description,
    contextHint: row.context_hint,
    similarity: row.similarity,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/image-selector.test.ts`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/image-selector.ts tests/unit/image-selector.test.ts
git commit -m "feat: add hybrid tag+semantic image selector"
```

---

## Task 5: Messenger Image Sending (TDD)

**Files:**
- Modify: `src/lib/fb/send.ts:4-26` (add `ImageMessage` to types)
- Modify: `src/lib/fb/send.ts:28-55` (add image case to `buildMessageBody`)
- Create: `tests/unit/send-image.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/send-image.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

import { sendMessage } from "@/lib/fb/send";
import type { OutboundMessage } from "@/lib/fb/send";

describe("sendMessage with ImageMessage", () => {
  it("sends an image attachment with the correct payload structure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message_id: "mid-img-1" }),
    });

    const imageMsg: OutboundMessage = {
      type: "image",
      url: "https://res.cloudinary.com/example/image/upload/v1/whatstage/t1/knowledge/photo.jpg",
    };

    const result = await sendMessage("psid-123", imageMsg, "page-token");

    expect(result.messageId).toBe("mid-img-1");

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.message).toEqual({
      attachment: {
        type: "image",
        payload: {
          url: "https://res.cloudinary.com/example/image/upload/v1/whatstage/t1/knowledge/photo.jpg",
          is_reusable: true,
        },
      },
    });
    expect(callBody.recipient).toEqual({ id: "psid-123" });
  });

  it("throws on FB API error for image send", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: "Invalid URL" } }),
    });

    const imageMsg: OutboundMessage = {
      type: "image",
      url: "https://bad-url.com/img.jpg",
    };

    await expect(
      sendMessage("psid-123", imageMsg, "page-token")
    ).rejects.toThrow("FB Send API error");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/send-image.test.ts`
Expected: FAIL — TypeScript error: `type: "image"` not assignable to `OutboundMessage`

- [ ] **Step 3: Add ImageMessage type and handler to send.ts**

Edit `src/lib/fb/send.ts`. Add the `ImageMessage` interface after `QuickRepliesMessage`:

```typescript
export interface ImageMessage {
  type: "image";
  url: string;
}
```

Update the `OutboundMessage` union type:

```typescript
export type OutboundMessage = TextMessage | ButtonMessage | QuickRepliesMessage | ImageMessage;
```

Add the `"image"` case to `buildMessageBody`:

```typescript
    case "image":
      return {
        attachment: {
          type: "image",
          payload: {
            url: message.url,
            is_reusable: true,
          },
        },
      };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/send-image.test.ts`
Expected: All 2 tests PASS

- [ ] **Step 5: Run existing send.ts tests to verify no regressions**

Run: `npx vitest run tests/unit/ --reporter=verbose`
Expected: All existing tests still PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/fb/send.ts tests/unit/send-image.test.ts
git commit -m "feat: add ImageMessage type to Messenger Send API"
```

---

## Task 6: Image CRUD API (TDD)

**Files:**
- Create: `src/app/api/knowledge/images/route.ts`
- Create: `src/app/api/knowledge/images/[id]/route.ts`
- Create: `tests/unit/knowledge-images.test.ts`

- [ ] **Step 1: Write the failing tests for POST and GET**

Create `tests/unit/knowledge-images.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "knowledge_images") {
        return {
          insert: mockInsert,
          select: mockSelect,
          update: mockUpdate,
          delete: mockDelete,
        };
      }
      return {};
    }),
  })),
}));

const mockUploadImage = vi.fn();
const mockValidateImageFile = vi.fn();
vi.mock("@/lib/cloudinary", () => ({
  uploadImage: mockUploadImage,
  validateImageFile: mockValidateImageFile,
  ValidationError: class ValidationError extends Error {
    constructor(message: string) { super(message); this.name = "ValidationError"; }
  },
}));

const mockEmbedText = vi.fn();
vi.mock("@/lib/ai/embedding", () => ({
  embedText: mockEmbedText,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

import { POST, GET } from "@/app/api/knowledge/images/route";

describe("POST /api/knowledge/images", () => {
  const authedUser = {
    data: { user: { id: "user-1", app_metadata: { tenant_id: "t-1" } } },
    error: null,
  };

  function makeRequest(formData: FormData): Request {
    return new Request("http://localhost/api/knowledge/images", {
      method: "POST",
      body: formData,
    });
  }

  it("returns 401 if user is not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const fd = new FormData();
    fd.append("file", new Blob(["fake"], { type: "image/png" }), "test.png");
    fd.append("description", "A test image");
    fd.append("tags", JSON.stringify(["test"]));

    const response = await POST(makeRequest(fd));
    expect(response.status).toBe(401);
  });

  it("returns 403 if user has no tenant", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "user-1", app_metadata: {} } },
      error: null,
    });

    const fd = new FormData();
    fd.append("file", new Blob(["fake"], { type: "image/png" }), "test.png");
    fd.append("description", "A test image");
    fd.append("tags", JSON.stringify(["test"]));

    const response = await POST(makeRequest(fd));
    expect(response.status).toBe(403);
  });

  it("returns 400 if description is missing", async () => {
    mockGetUser.mockResolvedValueOnce(authedUser);

    const fd = new FormData();
    fd.append("file", new Blob(["fake"], { type: "image/png" }), "test.png");
    fd.append("tags", JSON.stringify(["test"]));

    const response = await POST(makeRequest(fd));
    expect(response.status).toBe(400);
  });

  it("returns 400 if tags is empty array", async () => {
    mockGetUser.mockResolvedValueOnce(authedUser);

    const fd = new FormData();
    fd.append("file", new Blob(["fake"], { type: "image/png" }), "test.png");
    fd.append("description", "desc");
    fd.append("tags", JSON.stringify([]));

    const response = await POST(makeRequest(fd));
    expect(response.status).toBe(400);
  });

  it("returns 400 if file is missing", async () => {
    mockGetUser.mockResolvedValueOnce(authedUser);

    const fd = new FormData();
    fd.append("description", "desc");
    fd.append("tags", JSON.stringify(["test"]));

    const response = await POST(makeRequest(fd));
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid file type", async () => {
    mockGetUser.mockResolvedValueOnce(authedUser);
    mockValidateImageFile.mockImplementationOnce(() => {
      const err = new Error("Invalid file type: text/plain");
      err.name = "ValidationError";
      throw err;
    });

    const fd = new FormData();
    fd.append("file", new Blob(["fake"], { type: "text/plain" }), "test.txt");
    fd.append("description", "desc");
    fd.append("tags", JSON.stringify(["test"]));

    const response = await POST(makeRequest(fd));
    expect(response.status).toBe(400);
  });

  it("returns 201 with image record on success", async () => {
    mockGetUser.mockResolvedValueOnce(authedUser);
    mockValidateImageFile.mockImplementationOnce(() => {});
    mockUploadImage.mockResolvedValueOnce({
      url: "https://res.cloudinary.com/test/image/upload/v1/whatstage/t-1/knowledge/img.jpg",
      publicId: "whatstage/t-1/knowledge/img",
    });
    mockEmbedText.mockResolvedValueOnce(new Array(1536).fill(0.1));
    mockInsert.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "img-123",
            tenant_id: "t-1",
            url: "https://res.cloudinary.com/test/image/upload/v1/whatstage/t-1/knowledge/img.jpg",
            description: "A red shoe",
            tags: ["shoes", "red"],
            context_hint: null,
            created_at: "2026-04-18T00:00:00Z",
          },
          error: null,
        }),
      }),
    });

    const fd = new FormData();
    fd.append("file", new Blob(["fake-image"], { type: "image/jpeg" }), "shoe.jpg");
    fd.append("description", "A red shoe");
    fd.append("tags", JSON.stringify(["shoes", "red"]));

    const response = await POST(makeRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.id).toBe("img-123");
    expect(body.url).toContain("cloudinary.com");
  });
});

describe("GET /api/knowledge/images", () => {
  it("returns 401 if user is not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const request = new Request("http://localhost/api/knowledge/images");
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it("returns 200 with images list", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "user-1", app_metadata: { tenant_id: "t-1" } } },
      error: null,
    });

    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            { id: "img-1", url: "https://img1.jpg", description: "Shoe", tags: ["shoes"], context_hint: null, created_at: "2026-04-18" },
          ],
          error: null,
        }),
      }),
    });

    const request = new Request("http://localhost/api/knowledge/images");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.images).toHaveLength(1);
    expect(body.images[0].id).toBe("img-1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/knowledge-images.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/knowledge/images/route'`

- [ ] **Step 3: Implement POST and GET routes**

Create `src/app/api/knowledge/images/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { uploadImage, validateImageFile, ValidationError } from "@/lib/cloudinary";
import { embedText } from "@/lib/ai/embedding";
import { z } from "zod";

const createSchema = z.object({
  description: z.string().min(1).max(500),
  tags: z.array(z.string().min(1)).min(1),
  context_hint: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  // 1. Authenticate
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 });
  }

  // 2. Parse form data
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const description = formData.get("description") as string | null;
  const tagsRaw = formData.get("tags") as string | null;
  const contextHint = formData.get("context_hint") as string | null;

  // Parse tags JSON
  let tags: unknown;
  try {
    tags = tagsRaw ? JSON.parse(tagsRaw) : undefined;
  } catch {
    return NextResponse.json({ error: "tags must be valid JSON array" }, { status: 400 });
  }

  const parsed = createSchema.safeParse({
    description,
    tags,
    context_hint: contextHint ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  // 3. Validate file type and size
  try {
    validateImageFile(file);
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  // 4. Upload to Cloudinary
  let uploadResult;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    uploadResult = await uploadImage(buffer, tenantId);
  } catch {
    return NextResponse.json(
      { error: "Image upload failed. Please try again." },
      { status: 502 }
    );
  }

  // 5. Embed description
  let embedding: number[];
  try {
    embedding = await embedText(parsed.data.description);
  } catch {
    // Upload succeeded but embedding failed — still save, just without embedding
    console.error("Failed to embed image description, saving without embedding");
    embedding = [];
  }

  // 6. Insert into database
  const service = createServiceClient();
  const insertData: Record<string, unknown> = {
    tenant_id: tenantId,
    url: uploadResult.url,
    description: parsed.data.description,
    tags: parsed.data.tags,
    context_hint: parsed.data.context_hint ?? null,
  };

  if (embedding.length > 0) {
    insertData.embedding = embedding;
  }

  const { data: image, error: insertError } = await service
    .from("knowledge_images")
    .insert(insertData)
    .select("id, tenant_id, url, description, tags, context_hint, created_at")
    .single();

  if (insertError || !image) {
    return NextResponse.json(
      { error: "Failed to save image record" },
      { status: 500 }
    );
  }

  return NextResponse.json(image, { status: 201 });
}

export async function GET(request: Request) {
  // 1. Authenticate
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 });
  }

  // 2. Fetch images
  const service = createServiceClient();
  const { data: images, error } = await service
    .from("knowledge_images")
    .select("id, url, description, tags, context_hint, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch images" }, { status: 500 });
  }

  return NextResponse.json({ images: images ?? [] });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/knowledge-images.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Implement PATCH and DELETE routes**

Create `src/app/api/knowledge/images/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { deleteImage as deleteCloudinaryImage } from "@/lib/cloudinary";
import { embedText } from "@/lib/ai/embedding";
import { z } from "zod";

const updateSchema = z.object({
  description: z.string().min(1).max(500).optional(),
  tags: z.array(z.string().min(1)).min(1).optional(),
  context_hint: z.string().max(300).nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  // 1. Authenticate
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 });
  }

  // 2. Parse and validate body
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.tags !== undefined) updates.tags = parsed.data.tags;
  if (parsed.data.context_hint !== undefined) updates.context_hint = parsed.data.context_hint;

  // 3. Re-embed if description changed
  if (parsed.data.description !== undefined) {
    try {
      updates.embedding = await embedText(parsed.data.description);
    } catch {
      console.error("Failed to re-embed image description during update");
    }
  }

  // 4. Update in database (scoped to tenant)
  const service = createServiceClient();
  const { data: image, error: updateError } = await service
    .from("knowledge_images")
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id, url, description, tags, context_hint, created_at")
    .single();

  if (updateError || !image) {
    return NextResponse.json({ error: "Image not found or update failed" }, { status: 404 });
  }

  return NextResponse.json(image);
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;

  // 1. Authenticate
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 });
  }

  // 2. Fetch the image to get the Cloudinary URL for cleanup
  const service = createServiceClient();
  const { data: image, error: fetchError } = await service
    .from("knowledge_images")
    .select("id, url")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (fetchError || !image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  // 3. Delete from database
  const { error: deleteError } = await service
    .from("knowledge_images")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (deleteError) {
    return NextResponse.json({ error: "Failed to delete image" }, { status: 500 });
  }

  // 4. Delete from Cloudinary (best-effort, don't fail if this errors)
  try {
    // Extract public ID from Cloudinary URL
    const urlParts = image.url.split("/upload/");
    if (urlParts[1]) {
      const publicId = urlParts[1].replace(/^v\d+\//, "").replace(/\.[^/.]+$/, "");
      await deleteCloudinaryImage(publicId);
    }
  } catch (err) {
    console.error("Failed to delete image from Cloudinary:", err);
  }

  return NextResponse.json({ deleted: true });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/knowledge/images/route.ts src/app/api/knowledge/images/\[id\]/route.ts tests/unit/knowledge-images.test.ts
git commit -m "feat: add image CRUD API with Cloudinary upload and eager embedding"
```

---

## Task 7: Conversation Engine Integration (TDD)

**Files:**
- Modify: `src/lib/ai/conversation-engine.ts`
- Create: `tests/unit/conversation-engine-images.test.ts`

- [ ] **Step 1: Write the failing tests for image integration**

Create `tests/unit/conversation-engine-images.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockGetCurrentPhase = vi.fn();
const mockAdvancePhase = vi.fn();
const mockIncrementMessageCount = vi.fn();
vi.mock("@/lib/ai/phase-machine", () => ({
  getCurrentPhase: (...args: unknown[]) => mockGetCurrentPhase(...args),
  advancePhase: (...args: unknown[]) => mockAdvancePhase(...args),
  incrementMessageCount: (...args: unknown[]) => mockIncrementMessageCount(...args),
}));

const mockRetrieveKnowledge = vi.fn();
vi.mock("@/lib/ai/retriever", () => ({
  retrieveKnowledge: (...args: unknown[]) => mockRetrieveKnowledge(...args),
}));

const mockBuildSystemPrompt = vi.fn();
vi.mock("@/lib/ai/prompt-builder", () => ({
  buildSystemPrompt: (...args: unknown[]) => mockBuildSystemPrompt(...args),
}));

const mockGenerateResponse = vi.fn();
vi.mock("@/lib/ai/llm-client", () => ({
  generateResponse: (...args: unknown[]) => mockGenerateResponse(...args),
}));

const mockParseDecision = vi.fn();
vi.mock("@/lib/ai/decision-parser", () => ({
  parseDecision: (...args: unknown[]) => mockParseDecision(...args),
}));

const mockSelectImages = vi.fn();
vi.mock("@/lib/ai/image-selector", () => ({
  selectImages: (...args: unknown[]) => mockSelectImages(...args),
}));

const mockParseResponse = vi.fn();
vi.mock("@/lib/ai/response-parser", () => ({
  parseResponse: (...args: unknown[]) => mockParseResponse(...args),
}));

const mockSupabaseFrom = vi.fn();
const mockSupabaseRpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockSupabaseFrom,
    rpc: mockSupabaseRpc,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();

  // Default mocks for a basic flow
  mockGetCurrentPhase.mockResolvedValue({
    conversationPhaseId: "cp-1",
    phaseId: "p-1",
    name: "Greeting",
    orderIndex: 0,
    maxMessages: 10,
    systemPrompt: "Greet the user",
    tone: "friendly",
    goals: null,
    transitionHint: null,
    actionButtonIds: null,
    messageCount: 0,
  });

  mockRetrieveKnowledge.mockResolvedValue({
    status: "success",
    chunks: [],
    queryTarget: "general",
  });

  // Tenant config query for max_images_per_response
  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table === "tenants") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { max_images_per_response: 2 },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "conversations") {
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    }
    if (table === "knowledge_images") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      };
    }
    return {};
  });

  mockSelectImages.mockResolvedValue([]);
  mockBuildSystemPrompt.mockResolvedValue("system prompt");
  mockGenerateResponse.mockResolvedValue({ content: '{"message":"Hi!","phase_action":"stay","confidence":0.9,"image_ids":[]}' });
  mockParseDecision.mockReturnValue({
    message: "Hi!",
    phaseAction: "stay",
    confidence: 0.9,
    imageIds: [],
  });
  mockParseResponse.mockReturnValue({
    cleanMessage: "Hi!",
    extractedImageIds: [],
  });
  mockIncrementMessageCount.mockResolvedValue(undefined);
});

import { handleMessage } from "@/lib/ai/conversation-engine";

describe("handleMessage — image integration", () => {
  it("passes selected images to prompt builder", async () => {
    const selectedImages = [
      { id: "img-1", url: "https://img1.jpg", description: "Red shoe", contextHint: null, similarity: 0.85 },
    ];
    mockSelectImages.mockResolvedValueOnce(selectedImages);

    await handleMessage({
      tenantId: "t-1",
      businessName: "ShoeStore",
      conversationId: "conv-1",
      leadMessage: "show me shoes",
    });

    expect(mockBuildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [
          { id: "img-1", url: "https://img1.jpg", description: "Red shoe", context_hint: null },
        ],
      })
    );
  });

  it("merges image IDs from decision parser and response parser (deduplicated)", async () => {
    mockSelectImages.mockResolvedValueOnce([]);
    mockParseDecision.mockReturnValueOnce({
      message: "Check this [SEND_IMAGE:img-1]",
      phaseAction: "stay",
      confidence: 0.9,
      imageIds: ["img-1", "img-2"],
    });
    mockParseResponse.mockReturnValueOnce({
      cleanMessage: "Check this",
      extractedImageIds: ["img-1", "img-3"],
    });

    // Mock image validation query
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "tenants") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { max_images_per_response: 3 },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "knowledge_images") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: "img-1", url: "https://img1.jpg" },
                  { id: "img-2", url: "https://img2.jpg" },
                  { id: "img-3", url: "https://img3.jpg" },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const result = await handleMessage({
      tenantId: "t-1",
      businessName: "ShoeStore",
      conversationId: "conv-1",
      leadMessage: "show me products",
    });

    // Should be deduplicated: img-1, img-2, img-3
    expect(result.imageIds).toEqual(expect.arrayContaining(["img-1", "img-2", "img-3"]));
    expect(result.imageIds).toHaveLength(3);
  });

  it("uses cleaned message from response parser", async () => {
    mockParseDecision.mockReturnValueOnce({
      message: "Here you go [SEND_IMAGE:img-1]",
      phaseAction: "stay",
      confidence: 0.85,
      imageIds: ["img-1"],
    });
    mockParseResponse.mockReturnValueOnce({
      cleanMessage: "Here you go",
      extractedImageIds: ["img-1"],
    });

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "tenants") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { max_images_per_response: 2 },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "knowledge_images") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: "img-1", url: "https://img1.jpg" }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const result = await handleMessage({
      tenantId: "t-1",
      businessName: "Test",
      conversationId: "conv-1",
      leadMessage: "products",
    });

    expect(result.message).toBe("Here you go");
  });

  it("filters out invalid image IDs not belonging to tenant", async () => {
    mockParseDecision.mockReturnValueOnce({
      message: "Look at this",
      phaseAction: "stay",
      confidence: 0.9,
      imageIds: ["img-valid", "img-fake"],
    });
    mockParseResponse.mockReturnValueOnce({
      cleanMessage: "Look at this",
      extractedImageIds: [],
    });

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "tenants") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { max_images_per_response: 2 },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "knowledge_images") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                // Only img-valid exists for this tenant
                data: [{ id: "img-valid", url: "https://valid.jpg" }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const result = await handleMessage({
      tenantId: "t-1",
      businessName: "Test",
      conversationId: "conv-1",
      leadMessage: "show me",
    });

    expect(result.imageIds).toEqual(["img-valid"]);
  });

  it("returns empty imageIds when no images are relevant", async () => {
    const result = await handleMessage({
      tenantId: "t-1",
      businessName: "Test",
      conversationId: "conv-1",
      leadMessage: "hello",
    });

    expect(result.imageIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/conversation-engine-images.test.ts`
Expected: FAIL — tests fail because `conversation-engine.ts` doesn't import or call `selectImages`, `parseResponse`, or validate image IDs yet.

- [ ] **Step 3: Update the conversation engine**

Edit `src/lib/ai/conversation-engine.ts` to the following complete implementation:

```typescript
import { getCurrentPhase, advancePhase, incrementMessageCount } from "@/lib/ai/phase-machine";
import { retrieveKnowledge } from "@/lib/ai/retriever";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import type { KnowledgeImage } from "@/lib/ai/prompt-builder";
import { generateResponse } from "@/lib/ai/llm-client";
import { parseDecision } from "@/lib/ai/decision-parser";
import { selectImages } from "@/lib/ai/image-selector";
import { parseResponse } from "@/lib/ai/response-parser";
import { createServiceClient } from "@/lib/supabase/service";

export interface EngineInput {
  tenantId: string;
  businessName: string;
  conversationId: string;
  leadMessage: string;
}

export interface EngineOutput {
  message: string;
  phaseAction: "stay" | "advance" | "escalate";
  confidence: number;
  imageIds: string[];
  currentPhase: string;
  escalated: boolean;
}

const HEDGING_PHRASES = [
  "I believe",
  "If I'm not mistaken,",
  "From what I understand,",
  "I think",
  "As far as I know,",
];

function applyHedging(message: string, confidence: number): string {
  if (confidence >= 0.7 || confidence < 0.4) return message;
  const phrase = HEDGING_PHRASES[Math.floor(Math.random() * HEDGING_PHRASES.length)];
  const lowerFirst = message.charAt(0).toLowerCase() + message.slice(1);
  return `${phrase} ${lowerFirst}`;
}

export async function handleMessage(input: EngineInput): Promise<EngineOutput> {
  const { tenantId, businessName, conversationId, leadMessage } = input;
  const supabase = createServiceClient();

  // Step 1: Get/initialize current phase
  const currentPhase = await getCurrentPhase(conversationId, tenantId);

  // Step 2: Retrieve relevant knowledge
  const retrieval = await retrieveKnowledge({ query: leadMessage, tenantId });

  // Step 3: Fetch tenant image config
  const { data: tenantConfig } = await supabase
    .from("tenants")
    .select("max_images_per_response")
    .eq("id", tenantId)
    .single();

  const maxImages = tenantConfig?.max_images_per_response ?? 2;

  // Step 4: Select relevant images
  const selectedImages = await selectImages({
    tenantId,
    leadMessage,
    currentPhaseName: currentPhase.name,
    retrievedChunks: retrieval.chunks,
    maxImages,
  });

  // Convert to prompt builder format
  const promptImages: KnowledgeImage[] = selectedImages.map((img) => ({
    id: img.id,
    url: img.url,
    description: img.description,
    context_hint: img.contextHint,
  }));

  // Step 5: Build system prompt (with images in Layer 6)
  const systemPrompt = await buildSystemPrompt({
    tenantId,
    businessName,
    currentPhase,
    conversationId,
    ragChunks: retrieval.chunks,
    images: promptImages.length > 0 ? promptImages : undefined,
  });

  // Step 6: Call LLM
  const llmResponse = await generateResponse(systemPrompt, leadMessage);

  // Step 7: Parse decision
  const decision = parseDecision(llmResponse.content);

  // Step 8: Strip leaked SEND_IMAGE tokens from message
  const parsed = parseResponse(decision.message);

  // Step 9: Merge and deduplicate image IDs from decision + response parser
  const mergedImageIds = [...new Set([...decision.imageIds, ...parsed.extractedImageIds])];

  // Step 10: Validate image IDs against tenant's actual images
  let validatedImageIds: string[] = [];
  if (mergedImageIds.length > 0) {
    const { data: validImages } = await supabase
      .from("knowledge_images")
      .select("id, url")
      .eq("tenant_id", tenantId)
      .in("id", mergedImageIds);

    if (validImages) {
      const validIdSet = new Set(validImages.map((img) => img.id));
      validatedImageIds = mergedImageIds.filter((id) => validIdSet.has(id));
    }
  }

  // Step 11: Apply side effects
  let escalated = false;

  if (decision.phaseAction === "advance") {
    await advancePhase(conversationId, tenantId);
  } else if (decision.phaseAction === "escalate") {
    escalated = true;
    await supabase
      .from("conversations")
      .update({ needs_human: true })
      .eq("id", conversationId);
  }
  // "stay" is a no-op

  // Step 12: Increment message count
  await incrementMessageCount(currentPhase.conversationPhaseId);

  // Step 13: Apply confidence hedging to cleaned message
  const finalMessage = applyHedging(parsed.cleanMessage, decision.confidence);

  // Step 14: Return EngineOutput
  return {
    message: finalMessage,
    phaseAction: decision.phaseAction,
    confidence: decision.confidence,
    imageIds: validatedImageIds,
    currentPhase: currentPhase.name,
    escalated,
  };
}
```

- [ ] **Step 4: Run the new image integration tests**

Run: `npx vitest run tests/unit/conversation-engine-images.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Run the existing conversation engine tests to check for regressions**

Run: `npx vitest run tests/unit/conversation-engine.test.ts`
Expected: All existing tests PASS (may need minor mock updates for the new `selectImages` and `parseResponse` imports — if tests fail, add the missing mocks following the same pattern)

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/conversation-engine.ts tests/unit/conversation-engine-images.test.ts
git commit -m "feat: integrate image selection and response parsing into conversation engine"
```

---

## Task 8: Integration Tests

**Files:**
- Create: `tests/integration/image-pipeline.test.ts`
- Create: `tests/integration/image-conversation.test.ts`

- [ ] **Step 1: Write the image pipeline integration test**

Create `tests/integration/image-pipeline.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock Cloudinary ---
const mockUploadImage = vi.fn();
vi.mock("@/lib/cloudinary", () => ({
  uploadImage: mockUploadImage,
  validateImageFile: vi.fn(),
  ValidationError: class ValidationError extends Error {
    constructor(message: string) { super(message); this.name = "ValidationError"; }
  },
}));

// --- Mock HuggingFace embedding API ---
const mockEmbedText = vi.fn();
vi.mock("@/lib/ai/embedding", () => ({
  embedText: mockEmbedText,
}));

// --- Mock Supabase ---
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockRpc = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "knowledge_images") {
        return {
          insert: mockInsert,
          select: mockSelect,
        };
      }
      return {};
    }),
    rpc: mockRpc,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

import { POST } from "@/app/api/knowledge/images/route";
import { selectImages } from "@/lib/ai/image-selector";

describe("Image pipeline integration: upload -> embed -> select", () => {
  it("uploaded image with embedding can be found by image selector", async () => {
    const fakeEmbedding = new Array(1536).fill(0.5);

    // Step 1: Upload an image via API
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u-1", app_metadata: { tenant_id: "t-1" } } },
      error: null,
    });
    mockUploadImage.mockResolvedValueOnce({
      url: "https://res.cloudinary.com/test/whatstage/t-1/knowledge/shoe.jpg",
      publicId: "whatstage/t-1/knowledge/shoe",
    });
    mockEmbedText.mockResolvedValueOnce(fakeEmbedding);
    mockInsert.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "img-uploaded",
            tenant_id: "t-1",
            url: "https://res.cloudinary.com/test/whatstage/t-1/knowledge/shoe.jpg",
            description: "Red running shoe",
            tags: ["shoes", "red", "running"],
            context_hint: "Show when discussing footwear",
            created_at: "2026-04-18T00:00:00Z",
          },
          error: null,
        }),
      }),
    });

    const fd = new FormData();
    fd.append("file", new Blob(["fake-img"], { type: "image/jpeg" }), "shoe.jpg");
    fd.append("description", "Red running shoe");
    fd.append("tags", JSON.stringify(["shoes", "red", "running"]));
    fd.append("context_hint", "Show when discussing footwear");

    const uploadResponse = await POST(
      new Request("http://localhost/api/knowledge/images", { method: "POST", body: fd })
    );
    expect(uploadResponse.status).toBe(201);

    const uploadBody = await uploadResponse.json();
    expect(uploadBody.id).toBe("img-uploaded");

    // Step 2: Verify embedding was generated
    expect(mockEmbedText).toHaveBeenCalledWith("Red running shoe");

    // Step 3: Verify the insert included the embedding
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        embedding: fakeEmbedding,
        description: "Red running shoe",
        tags: ["shoes", "red", "running"],
      })
    );
  });
});
```

- [ ] **Step 2: Write the image conversation integration test**

Create `tests/integration/image-conversation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockGetCurrentPhase = vi.fn();
const mockAdvancePhase = vi.fn();
const mockIncrementMessageCount = vi.fn();
vi.mock("@/lib/ai/phase-machine", () => ({
  getCurrentPhase: (...args: unknown[]) => mockGetCurrentPhase(...args),
  advancePhase: (...args: unknown[]) => mockAdvancePhase(...args),
  incrementMessageCount: (...args: unknown[]) => mockIncrementMessageCount(...args),
}));

const mockRetrieveKnowledge = vi.fn();
vi.mock("@/lib/ai/retriever", () => ({
  retrieveKnowledge: (...args: unknown[]) => mockRetrieveKnowledge(...args),
}));

const mockBuildSystemPrompt = vi.fn();
vi.mock("@/lib/ai/prompt-builder", () => ({
  buildSystemPrompt: (...args: unknown[]) => mockBuildSystemPrompt(...args),
}));

const mockGenerateResponse = vi.fn();
vi.mock("@/lib/ai/llm-client", () => ({
  generateResponse: (...args: unknown[]) => mockGenerateResponse(...args),
}));

const mockSelectImages = vi.fn();
vi.mock("@/lib/ai/image-selector", () => ({
  selectImages: (...args: unknown[]) => mockSelectImages(...args),
}));

const mockSupabaseFrom = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockSupabaseFrom,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();

  mockGetCurrentPhase.mockResolvedValue({
    conversationPhaseId: "cp-1",
    phaseId: "p-1",
    name: "Product Discovery",
    orderIndex: 1,
    maxMessages: 10,
    systemPrompt: "Help the user find products",
    tone: "helpful",
    goals: "Qualify interest",
    transitionHint: null,
    actionButtonIds: null,
    messageCount: 3,
  });

  mockRetrieveKnowledge.mockResolvedValue({
    status: "success",
    chunks: [
      { id: "chunk-1", content: "We have red and blue running shoes.", similarity: 0.82, metadata: { image_tags: ["shoes"] } },
    ],
    queryTarget: "product",
  });

  mockIncrementMessageCount.mockResolvedValue(undefined);
});

import { handleMessage } from "@/lib/ai/conversation-engine";

describe("Full conversation with images", () => {
  it("lead asks about product -> images selected -> LLM references images -> images validated in output", async () => {
    // Image selector finds relevant product images
    mockSelectImages.mockResolvedValueOnce([
      { id: "img-red", url: "https://cdn/red-shoe.jpg", description: "Red running shoe", contextHint: "footwear queries", similarity: 0.88 },
      { id: "img-blue", url: "https://cdn/blue-shoe.jpg", description: "Blue running shoe", contextHint: "footwear queries", similarity: 0.79 },
    ]);

    // Prompt builder called with images
    mockBuildSystemPrompt.mockResolvedValueOnce("system prompt with images");

    // LLM responds with text + image IDs
    mockGenerateResponse.mockResolvedValueOnce({
      content: JSON.stringify({
        message: "We have great running shoes! Check these out:",
        phase_action: "stay",
        confidence: 0.92,
        image_ids: ["img-red", "img-blue"],
      }),
    });

    // Tenant config
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "tenants") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { max_images_per_response: 3 },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "knowledge_images") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: "img-red", url: "https://cdn/red-shoe.jpg" },
                  { id: "img-blue", url: "https://cdn/blue-shoe.jpg" },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const result = await handleMessage({
      tenantId: "t-1",
      businessName: "RunShop",
      conversationId: "conv-1",
      leadMessage: "Do you have running shoes?",
    });

    // Verify images were passed to prompt builder
    expect(mockBuildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        images: expect.arrayContaining([
          expect.objectContaining({ id: "img-red" }),
          expect.objectContaining({ id: "img-blue" }),
        ]),
      })
    );

    // Verify final output
    expect(result.message).toBe("We have great running shoes! Check these out:");
    expect(result.imageIds).toEqual(["img-red", "img-blue"]);
    expect(result.phaseAction).toBe("stay");
    expect(result.confidence).toBe(0.92);
    expect(result.escalated).toBe(false);
  });

  it("conversation with leaked SEND_IMAGE token gets cleaned", async () => {
    mockSelectImages.mockResolvedValueOnce([]);

    mockBuildSystemPrompt.mockResolvedValueOnce("system prompt");

    // LLM leaks a SEND_IMAGE token in its text
    mockGenerateResponse.mockResolvedValueOnce({
      content: JSON.stringify({
        message: "Here is our best product [SEND_IMAGE:img-leaked] for you!",
        phase_action: "stay",
        confidence: 0.85,
        image_ids: ["img-leaked"],
      }),
    });

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "tenants") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { max_images_per_response: 2 },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "knowledge_images") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: "img-leaked", url: "https://cdn/product.jpg" }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const result = await handleMessage({
      tenantId: "t-1",
      businessName: "Shop",
      conversationId: "conv-1",
      leadMessage: "what do you recommend?",
    });

    // Token should be stripped from message
    expect(result.message).not.toContain("[SEND_IMAGE");
    expect(result.message).toBe("Here is our best product for you!");

    // Image ID should still be in the output
    expect(result.imageIds).toEqual(["img-leaked"]);
  });
});
```

- [ ] **Step 3: Run the integration tests**

Run: `npx vitest run tests/integration/image-pipeline.test.ts tests/integration/image-conversation.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Run the full test suite to verify no regressions**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add tests/integration/image-pipeline.test.ts tests/integration/image-conversation.test.ts
git commit -m "test: add integration tests for image pipeline and image conversation flow"
```

---

## Task 9: Update AI_PLAN.md

**Files:**
- Modify: `AI_PLAN.md`

- [ ] **Step 1: Mark Phase 5 items as complete**

Edit `AI_PLAN.md` — change all Phase 5 checkboxes from `- [ ]` to `- [x]`:

```markdown
## Phase 5: Image & Media System

- [x] Build `src/app/api/knowledge/images/route.ts` — knowledge images CRUD
- [x] Build `src/lib/ai/image-selector.ts` — select relevant images for LLM prompt
- [x] Build `src/lib/ai/response-parser.ts` — parse `[SEND_IMAGE:id]` from LLM response
- [x] Integrate image list into prompt builder (Layer 6)
- [x] Integrate image sending into Messenger Send API
- [x] Unit tests: image selector logic
- [x] Unit tests: response parser
- [x] Integration tests: conversation about product → correct image included
```

- [ ] **Step 2: Commit**

```bash
git add AI_PLAN.md
git commit -m "docs: mark Phase 5 complete in AI_PLAN.md"
```

---

## Summary

| Task | What it builds | Tests |
|------|---------------|-------|
| 1 | Database migration (embedding column, RPC, tenant config) | Manual verification |
| 2 | Cloudinary client setup | — |
| 3 | Response parser (`[SEND_IMAGE:id]` stripping) | 8 unit tests |
| 4 | Image selector (hybrid tag + semantic) | 10 unit tests |
| 5 | Messenger `ImageMessage` type | 2 unit tests |
| 6 | Image CRUD API (POST/GET/PATCH/DELETE) | 8 unit tests |
| 7 | Conversation engine integration | 5 unit tests |
| 8 | Integration tests | 3 integration tests |
| 9 | AI_PLAN.md update | — |

**Total: 9 tasks, ~36 tests, 12 new files, 3 modified files**
