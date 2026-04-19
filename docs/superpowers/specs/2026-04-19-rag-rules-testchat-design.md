# Design Spec: Rules & Persona, Test Chat, Advanced RAG Pipeline

**Date:** 2026-04-19
**Branch:** feature/phase8-human-handoff (continuing)
**Status:** Approved — ready for implementation planning

---

## 1. Overview

Three interconnected improvements to the WhatStage bot engine:

1. **Rules & Persona** — make the UI tab fully functional (CRUD wired to real API + DB)
2. **Test Chat** — connect to the real AI pipeline instead of returning a hardcoded mock
3. **Advanced RAG Pipeline** — upgrade LLM + add hybrid search + cross-encoder reranking + self-correcting retrieval + anti-hallucination hardening

---

## 2. Rules & Persona

### 2.1 Database Migration

New migration `0010_persona_fields.sql`:
- Add `persona_tone TEXT NOT NULL DEFAULT 'friendly'` to `tenants`
- Add `custom_instructions TEXT` to `tenants`
- Add `CHECK (char_length(rule_text) <= 500)` constraint to `bot_rules.rule_text`

### 2.2 API Endpoints

#### `GET /api/bot/rules`
- Auth-gated; derives `tenant_id` from session (never from request body)
- Returns all rules for the tenant ordered by `created_at ASC`
- Response: `{ rules: Array<{ id, rule_text, category, enabled, created_at }> }`

#### `POST /api/bot/rules`
- Body: `{ rule_text: string, category: "instruction" | "restriction" | "persona" }`
- Maps UI categories → DB categories: `instruction→behavior`, `restriction→boundary`, `persona→tone`
- Enforces `MAX_RULES = 20` per tenant (returns 422 if exceeded)
- Enforces `MAX_RULE_LENGTH = 500` chars on `rule_text`
- Returns created rule

#### `PATCH /api/bot/rules/[id]`
- Body: `{ enabled?: boolean, rule_text?: string }`
- Verifies rule belongs to the session tenant (`tenant_id = session_tenant_id`) before updating — defense-in-depth on top of RLS
- Returns updated rule

#### `DELETE /api/bot/rules/[id]`
- Verifies ownership before deletion
- Returns `{ success: true }`

#### Extend `PATCH /api/bot/settings`
- Add `persona_tone?: "friendly" | "professional" | "casual"` to schema
- Add `custom_instructions?: string` with max length 2000 chars
- Both fields update `tenants` table

### 2.3 UI Changes (`BotClient.tsx` — `RulesTab`)

- On mount: fetch `GET /api/bot/rules` + `GET /api/bot/settings` (or include persona in rules response)
- Render existing rules as a list with: rule text, category badge, enabled toggle, delete button
- `EmptyState` only shown when rules array is genuinely empty
- "Save Rule" button POSTs to API; optimistic update on success, rollback on error
- Category select in the add form maps to DB categories (instruction/restriction/persona labels preserved in UI)
- Persona section: tone `<select>` and custom instructions `<textarea>` debounced PATCH on blur (500ms)
- Loading skeleton while data is fetching

### 2.4 Prompt Builder Impact

`prompt-builder.ts` already reads from `bot_rules` — no changes needed there. The new `persona_tone` and `custom_instructions` fields need to be incorporated into **Layer 1 (Base Persona)**:

```
You are a helpful assistant for {businessName}. 
Tone: {persona_tone}. Sound like a real human. Keep messages short and conversational. Never use bullet lists or corporate speak.
{custom_instructions if set}
```

---

## 3. Test Chat

### 3.1 New Endpoint `POST /api/bot/test-chat`

**Request:**
```json
{ "message": "string (max 500 chars)" }
```

**Response:**
```json
{
  "reply": "string",
  "chunks": [
    { "content": "string", "similarity": 0.82, "source": "general | product", "retrievalPass": 1 }
  ],
  "confidence": 0.85,
  "queryTarget": "general | product | both",
  "retrievalPass": 1
}
```

**Implementation:**
- Auth-gated; `tenant_id` derived from session only
- Rate limited: 30 requests/minute per tenant (tracked via Supabase counter or in-memory Map with TTL)
- Calls `retrieveKnowledge` (the new advanced pipeline) with no `conversationId`
- Calls `buildSystemPrompt` in test mode: no conversation history, minimal phase context ("Test Mode — no active phase")
- Calls `generateResponse` with Qwen3-8B-Instruct
- Returns reply + raw chunk metadata for the reasoning panel
- Chunks hard-filtered by `tenant_id` from session — never trust client

**Not stored:** Test chat messages are ephemeral. Nothing written to `messages`, `conversations`, or `leads` tables.

### 3.2 UI Changes (`TestChatTab`)

- `handleSend` calls `POST /api/bot/test-chat` instead of mock
- Shows typing indicator (animated dots) while awaiting response
- Reasoning panel populates after each response:
  - Retrieved chunk previews (truncated to 120 chars) with similarity scores
  - Confidence bar (color: green ≥ 0.7, yellow 0.4–0.7, red < 0.4)
  - Query target badge (General / Product / Both)
  - Retrieval pass indicator ("Reformulated query" label if pass 2 was used)
- Error state shown if API call fails

---

## 4. Advanced RAG Pipeline

### 4.1 LLM Upgrade

**File:** `src/lib/ai/llm-client.ts`

- `MODEL`: `meta-llama/Llama-3.1-8B-Instruct` → `Qwen/Qwen3-8B-Instruct`
- Add `response_format: { type: "json_object" }` to request body — enforces valid JSON output, eliminates malformed JSON parse failures
- Keep same HF Novita router URL and retry logic
- Reduce `temperature` from 0.7 → 0.4 for more deterministic structured output

### 4.2 Hybrid Search

**New migration `0011_hybrid_search.sql`:**
```sql
-- Enable trigram extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add tsvector generated column for full-text search
ALTER TABLE knowledge_chunks
  ADD COLUMN fts tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- GIN index for full-text search
CREATE INDEX knowledge_chunks_fts_idx ON knowledge_chunks USING GIN (fts);

-- New RPC for hybrid search with Reciprocal Rank Fusion
CREATE OR REPLACE FUNCTION match_knowledge_chunks_hybrid(...)
```

**New RPC `match_knowledge_chunks_hybrid`:**
```sql
-- Runs vector search (top 15) + full-text search (top 15) in parallel
-- Merges results via RRF: score = 1/(60 + rank)
-- Returns top K by combined RRF score
-- Parameters: query_embedding, fts_query (plainto_tsquery), p_tenant_id, p_kb_type, p_top_k
```

**Updated `vector-search.ts`:**
- `searchKnowledge` updated to call `match_knowledge_chunks_hybrid`
- Accepts both `queryEmbedding` and `ftsQuery` (stemmed plain text query)
- Initial candidate threshold raised from `0.3` → `0.45` to reduce noise fed to reranker

### 4.3 Cross-Encoder Reranking

**New file `src/lib/ai/reranker.ts`:**

```ts
// Model: BAAI/bge-reranker-v2-m3 via HF textClassification
// Input: query string + array of candidate chunks
// Output: chunks sorted by reranker score, top 5 returned
// Fallback: if HF returns 503 or times out, return input chunks sorted by original similarity score
```

- Batches all (query, chunk) pairs in a single HF API call
- Wrapped in try/catch — on any error, gracefully falls back to vector similarity ordering
- Reranker timeout: 8 seconds (separate from LLM timeout)

### 4.4 Self-Correcting Retrieval

**Rewritten `src/lib/ai/retriever.ts`:**

```
Pass 1:
  1. Classify query target (keyword router — kept as-is for speed)
  2. Embed query (BGE-Large)
  3. Hybrid search → up to 15 candidates
  4. Cross-encoder rerank → top 5
  5. If top reranker score ≥ 0.6 → return (status: "success", pass: 1)

Pass 2 (triggered when top score < 0.6):
  1. Call LLM with constrained expansion prompt:
     "Extract 3-5 search keywords from this message. Output only a comma-separated list of keywords, nothing else."
     (max 50 tokens, temperature 0.0)
  2. Embed expanded query
  3. Hybrid search on expanded query → up to 15 candidates
  4. Cross-encoder rerank → top 5
  5. Merge Pass 1 + Pass 2 results, deduplicate by chunk ID, re-sort by reranker score
  6. Return top 5 (status: "success" | "low_confidence", pass: 2)
```

**Query expansion security constraints:**
- Expansion prompt uses a strict template — user message only provides input, never instructions
- LLM output truncated to 200 chars before use as search query
- `[^\w\s,]` stripped from expansion output (keywords only, no special chars)

### 4.5 Anti-Hallucination Prompt Hardening

**Updated `prompt-builder.ts` Layer 5:**
```
--- RETRIEVED KNOWLEDGE ---
[1] {chunk_1_content} (source: general)
[2] {chunk_2_content} (source: product)

IMPORTANT: Answer ONLY using information from the retrieved knowledge above.
If the answer is not present in the knowledge base, honestly say you don't know
and set confidence below 0.4. Do not invent facts.
```

**Updated Layer 7 (response format) adds `cited_chunks` field:**
```json
{
  "message": "...",
  "phase_action": "stay | advance | escalate",
  "confidence": 0.0-1.0,
  "image_ids": [],
  "cited_chunks": [1, 2]
}
```

**Prompt injection mitigation in Layer 4 (conversation history):**
- Strip `---` section delimiters from user message text before injecting
- Strip sequences that match system prompt headers: `/^---\s+[A-Z\s]+---/gm`
- Truncate individual message text to 2000 chars max
- This is applied at the `buildConversationHistory` layer

---

## 5. Security Constraints Summary

| Constraint | Value | Enforced At |
|---|---|---|
| Max rules per tenant | 20 | API (`POST /api/bot/rules`) |
| Max rule text length | 500 chars | API + DB CHECK |
| Max custom instructions | 2000 chars | API + DB column constraint |
| Test chat rate limit | 30 req/min per tenant | API middleware |
| Test chat message max | 500 chars | API validation |
| Tenant isolation (rules) | session-derived tenant_id | API + RLS |
| Chunk tenant isolation (test chat) | session-derived tenant_id | API |
| Prompt injection mitigation | strip `---` headers, 2000 char cap per message | prompt-builder.ts |
| Query expansion output | strip non-word chars, 200 char cap | retriever.ts |
| Reranker fallback | graceful degrade to vector scores on 503/timeout | reranker.ts |
| Initial similarity threshold | 0.45 (raised from 0.3) | vector-search.ts |

---

## 6. Files Changed

### New files
- `supabase/migrations/0010_persona_fields.sql`
- `supabase/migrations/0011_hybrid_search.sql`
- `src/app/api/bot/rules/route.ts`
- `src/app/api/bot/rules/[id]/route.ts`
- `src/app/api/bot/test-chat/route.ts`
- `src/lib/ai/reranker.ts`

### Modified files
- `src/lib/ai/llm-client.ts` — model upgrade + JSON mode + lower temperature
- `src/lib/ai/retriever.ts` — self-correcting two-pass retrieval
- `src/lib/ai/vector-search.ts` — hybrid search RPC + raised threshold
- `src/lib/ai/prompt-builder.ts` — persona fields + anti-hallucination instructions + injection mitigation
- `src/app/api/bot/settings/route.ts` — add persona_tone + custom_instructions fields
- `src/app/(tenant)/app/bot/BotClient.tsx` — wire up Rules tab + Test Chat tab

---

## 7. Out of Scope (Phase 2)

- Agentic tool-calling RAG loop (LLM issues multiple retrieval calls per response)
- Groq/Together.ai provider switch
- Reranker self-hosting
- Knowledge chunk quality scoring / chunk-level feedback
