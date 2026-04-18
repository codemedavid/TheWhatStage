# Phase 1: Foundation — Embedding & Vector Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the pgvector-backed knowledge store, embedding client, and vector search utility that all later AI phases depend on.

**Architecture:** A single Supabase migration creates all 5 new tables (bot_flow_phases, knowledge_docs, knowledge_chunks, knowledge_images, conversation_phases) with pgvector extension, HNSW index, and RLS policies. Two library modules — `embedding.ts` (HuggingFace wrapper) and `vector-search.ts` (cosine similarity search) — provide the TypeScript interface. All tables are tenant-scoped via `current_tenant_id()`.

**Tech Stack:** Supabase (pgvector), HuggingFace Inference API (Qwen/Qwen3-Embedding-8B, Scaleway provider), Vitest + MSW for testing.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/0004_ai_knowledge_tables.sql` | All 5 tables, pgvector extension, indexes, RLS |
| Modify | `src/types/database.ts` | Add type definitions for new tables |
| Create | `src/lib/ai/embedding.ts` | HuggingFace embedding client with batch support |
| Create | `src/lib/ai/vector-search.ts` | Cosine similarity search against knowledge_chunks |
| Modify | `tests/setup.ts` | Add `HUGGINGFACE_API_KEY` env var for tests |
| Create | `tests/unit/embedding.test.ts` | Unit tests for embedding client (mocked HF API) |
| Create | `tests/unit/vector-search.test.ts` | Unit tests for vector search (mocked Supabase) |
| Create | `tests/integration/embedding-pipeline.test.ts` | Integration test: embed -> store -> query -> retrieve |

---

## Task 1: Database Migration — Tables, Indexes, RLS

**Files:**
- Create: `supabase/migrations/0004_ai_knowledge_tables.sql`

### Step 1: Create the migration file

- [ ] **Step 1.1: Write the migration**

```sql
-- =============================================================
-- AI Knowledge & Conversation Phase Tables
-- =============================================================

-- Enable pgvector extension for embedding storage
create extension if not exists vector;

-- =============================================================
-- BOT FLOW PHASES
-- =============================================================

create table bot_flow_phases (
  id                uuid primary key default uuid_generate_v4(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  name              text not null,
  order_index       integer not null default 0,
  max_messages      integer not null default 3,
  system_prompt     text not null,
  tone              text default 'friendly and helpful',
  goals             text,
  transition_hint   text,
  action_button_ids uuid[],
  created_at        timestamptz not null default now()
);

create index on bot_flow_phases (tenant_id);

-- =============================================================
-- KNOWLEDGE DOCS
-- =============================================================

create table knowledge_docs (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  title       text not null,
  type        text not null check (type in ('pdf', 'docx', 'xlsx', 'faq', 'richtext', 'product')),
  content     text,
  file_url    text,
  status      text not null default 'processing' check (status in ('processing', 'ready', 'error')),
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index on knowledge_docs (tenant_id);

-- =============================================================
-- KNOWLEDGE CHUNKS
-- =============================================================

create table knowledge_chunks (
  id          uuid primary key default uuid_generate_v4(),
  doc_id      uuid not null references knowledge_docs(id) on delete cascade,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  content     text not null,
  kb_type     text not null check (kb_type in ('general', 'product')),
  embedding   vector(4096),
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- HNSW index for fast cosine similarity search
create index on knowledge_chunks using hnsw (embedding vector_cosine_ops);
create index on knowledge_chunks (tenant_id, kb_type);

-- =============================================================
-- KNOWLEDGE IMAGES
-- =============================================================

create table knowledge_images (
  id            uuid primary key default uuid_generate_v4(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  url           text not null,
  description   text not null,
  tags          text[] not null default '{}',
  context_hint  text,
  created_at    timestamptz not null default now()
);

create index on knowledge_images (tenant_id);

-- =============================================================
-- CONVERSATION PHASES
-- =============================================================

create table conversation_phases (
  id                uuid primary key default uuid_generate_v4(),
  conversation_id   uuid not null references conversations(id) on delete cascade,
  phase_id          uuid not null references bot_flow_phases(id) on delete cascade,
  entered_at        timestamptz not null default now(),
  message_count     integer not null default 0
);

create index on conversation_phases (conversation_id);

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

alter table bot_flow_phases enable row level security;
create policy "bot_flow_phases_all" on bot_flow_phases for all
  using (tenant_id = current_tenant_id());

alter table knowledge_docs enable row level security;
create policy "knowledge_docs_all" on knowledge_docs for all
  using (tenant_id = current_tenant_id());

alter table knowledge_chunks enable row level security;
create policy "knowledge_chunks_all" on knowledge_chunks for all
  using (tenant_id = current_tenant_id());

alter table knowledge_images enable row level security;
create policy "knowledge_images_all" on knowledge_images for all
  using (tenant_id = current_tenant_id());

alter table conversation_phases enable row level security;
create policy "conversation_phases_all" on conversation_phases for all
  using (
    conversation_id in (
      select id from conversations where tenant_id = current_tenant_id()
    )
  );
```

> **Note on vector dimension:** Qwen/Qwen3-Embedding-8B outputs 4096-dimensional vectors. If you find a different dimension at runtime, update the `vector(4096)` column definition before applying the migration. You can verify by calling the HF API with a test string and checking the response array length.

- [ ] **Step 1.2: Verify the migration is valid SQL**

Run: `cd /Users/codemedavid/Documents/WhatStage_V2 && npx supabase db lint --schema public`

Expected: No SQL errors. Warnings about missing RLS on unrelated tables are fine.

- [ ] **Step 1.3: Commit**

```bash
git add supabase/migrations/0004_ai_knowledge_tables.sql
git commit -m "feat: add AI knowledge tables migration (pgvector, bot_flow_phases, knowledge_docs/chunks/images, conversation_phases)"
```

---

## Task 2: Database Types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 2.1: Add new table types to the Database interface**

Add the following table definitions inside `Database.public.Tables` in `src/types/database.ts`, after the existing table definitions:

```typescript
      bot_flow_phases: TableRow<{
        id: string;
        tenant_id: string;
        name: string;
        order_index: number;
        max_messages: number;
        system_prompt: string;
        tone: string | null;
        goals: string | null;
        transition_hint: string | null;
        action_button_ids: string[] | null;
        created_at: string;
      }>;
      knowledge_docs: TableRow<{
        id: string;
        tenant_id: string;
        title: string;
        type: "pdf" | "docx" | "xlsx" | "faq" | "richtext" | "product";
        content: string | null;
        file_url: string | null;
        status: "processing" | "ready" | "error";
        metadata: Record<string, unknown>;
        created_at: string;
      }>;
      knowledge_chunks: TableRow<{
        id: string;
        doc_id: string;
        tenant_id: string;
        content: string;
        kb_type: "general" | "product";
        embedding: number[] | null;
        metadata: Record<string, unknown>;
        created_at: string;
      }>;
      knowledge_images: TableRow<{
        id: string;
        tenant_id: string;
        url: string;
        description: string;
        tags: string[];
        context_hint: string | null;
        created_at: string;
      }>;
      conversation_phases: TableRow<{
        id: string;
        conversation_id: string;
        phase_id: string;
        entered_at: string;
        message_count: number;
      }>;
```

- [ ] **Step 2.2: Verify types compile**

Run: `cd /Users/codemedavid/Documents/WhatStage_V2 && npx tsc --noEmit`

Expected: No type errors (or only pre-existing ones unrelated to your changes).

- [ ] **Step 2.3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add database types for AI knowledge tables"
```

---

## Task 3: HuggingFace Embedding Client

**Files:**
- Create: `src/lib/ai/embedding.ts`
- Modify: `tests/setup.ts`
- Create: `tests/unit/embedding.test.ts`

- [ ] **Step 3.1: Add HuggingFace API key to test setup**

In `tests/setup.ts`, add this line after the existing env vars:

```typescript
process.env.HUGGINGFACE_API_KEY = "test-hf-api-key";
```

- [ ] **Step 3.2: Write the failing tests for the embedding client**

Create `tests/unit/embedding.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { embedText, embedBatch } from "@/lib/ai/embedding";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("embedText", () => {
  it("returns an embedding vector for a single string", async () => {
    const fakeEmbedding = Array.from({ length: 4096 }, (_, i) => i * 0.001);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    const result = await embedText("Hello world");

    expect(result).toEqual(fakeEmbedding);
    expect(result).toHaveLength(4096);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("Qwen/Qwen3-Embedding-8B");
    expect(options.method).toBe("POST");
    expect(options.headers["Authorization"]).toBe("Bearer test-hf-api-key");

    const body = JSON.parse(options.body);
    expect(body.inputs).toBe("Hello world");
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => "Model is loading",
    });

    await expect(embedText("test")).rejects.toThrow(
      "HuggingFace embedding API error (503): Model is loading"
    );
  });
});

describe("embedBatch", () => {
  it("embeds multiple texts in a single API call", async () => {
    const fakeEmbeddings = [
      Array.from({ length: 4096 }, () => 0.1),
      Array.from({ length: 4096 }, () => 0.2),
      Array.from({ length: 4096 }, () => 0.3),
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => fakeEmbeddings,
    });

    const texts = ["one", "two", "three"];
    const result = await embedBatch(texts);

    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(4096);
    expect(result[1]).toHaveLength(4096);
    expect(result[2]).toHaveLength(4096);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.inputs).toEqual(["one", "two", "three"]);
  });

  it("chunks large batches into groups of 10", async () => {
    const fakeEmbedding = Array.from({ length: 4096 }, () => 0.1);

    // First batch of 10
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => Array(10).fill(fakeEmbedding),
    });
    // Second batch of 2
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => Array(2).fill(fakeEmbedding),
    });

    const texts = Array.from({ length: 12 }, (_, i) => `text ${i}`);
    const result = await embedBatch(texts);

    expect(result).toHaveLength(12);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const firstBatchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(firstBatchBody.inputs).toHaveLength(10);

    const secondBatchBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(secondBatchBody.inputs).toHaveLength(2);
  });

  it("returns empty array for empty input", async () => {
    const result = await embedBatch([]);
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3.3: Run tests to verify they fail**

Run: `cd /Users/codemedavid/Documents/WhatStage_V2 && npx vitest run tests/unit/embedding.test.ts`

Expected: FAIL — `Cannot find module '@/lib/ai/embedding'`

- [ ] **Step 3.4: Implement the embedding client**

Create `src/lib/ai/embedding.ts`:

```typescript
const HF_API_URL =
  "https://router.huggingface.co/hf-inference/models/Qwen/Qwen3-Embedding-8B/pipeline/feature-extraction";

const BATCH_SIZE = 10;

function getApiKey(): string {
  const key = process.env.HUGGINGFACE_API_KEY;
  if (!key) throw new Error("HUGGINGFACE_API_KEY is not set");
  return key;
}

async function callEmbeddingApi(inputs: string | string[]): Promise<number[][]> {
  const response = await fetch(HF_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `HuggingFace embedding API error (${response.status}): ${errorText}`
    );
  }

  return response.json();
}

/**
 * Embed a single text string. Returns a float vector.
 */
export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await callEmbeddingApi(text);
  return embedding;
}

/**
 * Embed multiple texts in batches of up to 10.
 * Returns one embedding per input text, in order.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await callEmbeddingApi(batch);
    results.push(...embeddings);
  }

  return results;
}
```

- [ ] **Step 3.5: Run tests to verify they pass**

Run: `cd /Users/codemedavid/Documents/WhatStage_V2 && npx vitest run tests/unit/embedding.test.ts`

Expected: All 5 tests PASS.

- [ ] **Step 3.6: Commit**

```bash
git add src/lib/ai/embedding.ts tests/unit/embedding.test.ts tests/setup.ts
git commit -m "feat: add HuggingFace embedding client with batch support"
```

---

## Task 4: Vector Search Utility

**Files:**
- Create: `src/lib/ai/vector-search.ts`
- Create: `tests/unit/vector-search.test.ts`

- [ ] **Step 4.1: Write the failing tests for vector search**

Create `tests/unit/vector-search.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchKnowledge } from "@/lib/ai/vector-search";

const mockRpc = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    rpc: mockRpc,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchKnowledge", () => {
  it("calls the match_knowledge_chunks RPC with correct params", async () => {
    const fakeResults = [
      { id: "chunk-1", content: "Answer about pricing", similarity: 0.92, metadata: {} },
      { id: "chunk-2", content: "Another answer", similarity: 0.85, metadata: {} },
    ];
    mockRpc.mockReturnValue({
      data: fakeResults,
      error: null,
    });

    const queryEmbedding = Array.from({ length: 4096 }, () => 0.5);
    const result = await searchKnowledge({
      queryEmbedding,
      tenantId: "tenant-abc",
      kbType: "general",
      topK: 5,
      similarityThreshold: 0.3,
    });

    expect(result).toEqual(fakeResults);
    expect(mockRpc).toHaveBeenCalledWith("match_knowledge_chunks", {
      query_embedding: queryEmbedding,
      p_tenant_id: "tenant-abc",
      p_kb_type: "general",
      p_top_k: 5,
      p_similarity_threshold: 0.3,
    });
  });

  it("uses default topK=5 and threshold=0.3", async () => {
    mockRpc.mockReturnValue({ data: [], error: null });

    const queryEmbedding = Array.from({ length: 4096 }, () => 0.1);
    await searchKnowledge({
      queryEmbedding,
      tenantId: "tenant-abc",
      kbType: "product",
    });

    expect(mockRpc).toHaveBeenCalledWith("match_knowledge_chunks", {
      query_embedding: queryEmbedding,
      p_tenant_id: "tenant-abc",
      p_kb_type: "product",
      p_top_k: 5,
      p_similarity_threshold: 0.3,
    });
  });

  it("throws on Supabase RPC error", async () => {
    mockRpc.mockReturnValue({
      data: null,
      error: { message: "function not found" },
    });

    const queryEmbedding = Array.from({ length: 4096 }, () => 0.1);

    await expect(
      searchKnowledge({
        queryEmbedding,
        tenantId: "tenant-abc",
        kbType: "general",
      })
    ).rejects.toThrow("Vector search failed: function not found");
  });

  it("returns empty array when no results match threshold", async () => {
    mockRpc.mockReturnValue({ data: [], error: null });

    const queryEmbedding = Array.from({ length: 4096 }, () => 0.1);
    const result = await searchKnowledge({
      queryEmbedding,
      tenantId: "tenant-abc",
      kbType: "general",
    });

    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `cd /Users/codemedavid/Documents/WhatStage_V2 && npx vitest run tests/unit/vector-search.test.ts`

Expected: FAIL — `Cannot find module '@/lib/ai/vector-search'`

- [ ] **Step 4.3: Implement the vector search utility**

Create `src/lib/ai/vector-search.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/service";

export interface ChunkResult {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface SearchParams {
  queryEmbedding: number[];
  tenantId: string;
  kbType: "general" | "product";
  topK?: number;
  similarityThreshold?: number;
}

/**
 * Search knowledge_chunks by cosine similarity using the
 * match_knowledge_chunks Supabase RPC function.
 */
export async function searchKnowledge({
  queryEmbedding,
  tenantId,
  kbType,
  topK = 5,
  similarityThreshold = 0.3,
}: SearchParams): Promise<ChunkResult[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    query_embedding: queryEmbedding,
    p_tenant_id: tenantId,
    p_kb_type: kbType,
    p_top_k: topK,
    p_similarity_threshold: similarityThreshold,
  });

  if (error) {
    throw new Error(`Vector search failed: ${error.message}`);
  }

  return data ?? [];
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `cd /Users/codemedavid/Documents/WhatStage_V2 && npx vitest run tests/unit/vector-search.test.ts`

Expected: All 4 tests PASS.

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/ai/vector-search.ts tests/unit/vector-search.test.ts
git commit -m "feat: add vector search utility for knowledge chunks"
```

---

## Task 5: Supabase RPC Function for Vector Search

**Files:**
- Modify: `supabase/migrations/0004_ai_knowledge_tables.sql`

The vector search utility (Task 4) calls `match_knowledge_chunks` RPC. This function must exist in the database.

- [ ] **Step 5.1: Add the RPC function to the migration**

Append the following to the end of `supabase/migrations/0004_ai_knowledge_tables.sql`:

```sql
-- =============================================================
-- VECTOR SEARCH RPC
-- =============================================================

create or replace function match_knowledge_chunks(
  query_embedding     vector(4096),
  p_tenant_id         uuid,
  p_kb_type           text,
  p_top_k             integer default 5,
  p_similarity_threshold float default 0.3
)
returns table(
  id          uuid,
  content     text,
  similarity  float,
  metadata    jsonb
)
language sql
stable
security definer
as $$
  select
    kc.id,
    kc.content,
    1 - (kc.embedding <=> query_embedding) as similarity,
    kc.metadata
  from knowledge_chunks kc
  where kc.tenant_id = p_tenant_id
    and kc.kb_type = p_kb_type
    and kc.embedding is not null
    and 1 - (kc.embedding <=> query_embedding) >= p_similarity_threshold
  order by kc.embedding <=> query_embedding
  limit p_top_k;
$$;
```

> **How it works:** `<=>` is pgvector's cosine distance operator. Cosine similarity = `1 - cosine_distance`. We filter by `>= threshold` and sort ascending by distance (most similar first).

- [ ] **Step 5.2: Add the RPC function type to database types**

In `src/types/database.ts`, add to the `Functions` section inside `Database.public`:

```typescript
      match_knowledge_chunks: {
        Args: {
          query_embedding: number[];
          p_tenant_id: string;
          p_kb_type: string;
          p_top_k?: number;
          p_similarity_threshold?: number;
        };
        Returns: {
          id: string;
          content: string;
          similarity: number;
          metadata: Record<string, unknown>;
        }[];
      };
```

- [ ] **Step 5.3: Verify types compile**

Run: `cd /Users/codemedavid/Documents/WhatStage_V2 && npx tsc --noEmit`

Expected: No new type errors.

- [ ] **Step 5.4: Commit**

```bash
git add supabase/migrations/0004_ai_knowledge_tables.sql src/types/database.ts
git commit -m "feat: add match_knowledge_chunks RPC function for vector search"
```

---

## Task 6: Integration Test — Embed, Store, Query, Retrieve

**Files:**
- Create: `tests/integration/embedding-pipeline.test.ts`

This test validates the full pipeline end-to-end using mocked external services (HuggingFace API) but real module interactions.

- [ ] **Step 6.1: Write the integration test**

Create `tests/integration/embedding-pipeline.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { embedText, embedBatch } from "@/lib/ai/embedding";
import { searchKnowledge } from "@/lib/ai/vector-search";

// Mock fetch for HuggingFace API
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock Supabase service client for vector search
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    rpc: mockRpc,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Embedding Pipeline Integration", () => {
  const DIMENSION = 4096;
  const tenantId = "tenant-integration-test";

  it("embeds a text, then retrieves it via vector search", async () => {
    // Step 1: Embed a document chunk
    const fakeEmbedding = Array.from({ length: DIMENSION }, (_, i) => Math.sin(i) * 0.01);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    const embedding = await embedText("Our office is located at 123 Main St, Springfield");
    expect(embedding).toHaveLength(DIMENSION);

    // Step 2: Embed a query
    const fakeQueryEmbedding = Array.from({ length: DIMENSION }, (_, i) => Math.sin(i) * 0.01 + 0.001);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeQueryEmbedding],
    });

    const queryEmbedding = await embedText("Where is your office?");
    expect(queryEmbedding).toHaveLength(DIMENSION);

    // Step 3: Search for matching chunks
    mockRpc.mockReturnValue({
      data: [
        {
          id: "chunk-1",
          content: "Our office is located at 123 Main St, Springfield",
          similarity: 0.95,
          metadata: {},
        },
      ],
      error: null,
    });

    const results = await searchKnowledge({
      queryEmbedding,
      tenantId,
      kbType: "general",
      topK: 5,
      similarityThreshold: 0.3,
    });

    expect(results).toHaveLength(1);
    expect(results[0].content).toContain("123 Main St");
    expect(results[0].similarity).toBeGreaterThan(0.3);
  });

  it("embeds a batch of documents and searches across them", async () => {
    // Step 1: Batch embed 3 chunks
    const fakeEmbeddings = [
      Array.from({ length: DIMENSION }, () => 0.1),
      Array.from({ length: DIMENSION }, () => 0.2),
      Array.from({ length: DIMENSION }, () => 0.3),
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => fakeEmbeddings,
    });

    const chunks = [
      "We offer web development services",
      "Our pricing starts at $500/month",
      "Contact us at hello@example.com",
    ];
    const embeddings = await embedBatch(chunks);

    expect(embeddings).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(1); // All fit in one batch

    // Step 2: Query for pricing
    const fakeQueryEmbedding = Array.from({ length: DIMENSION }, () => 0.2);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeQueryEmbedding],
    });

    const queryEmbedding = await embedText("How much does it cost?");

    // Step 3: Search returns the pricing chunk as top result
    mockRpc.mockReturnValue({
      data: [
        {
          id: "chunk-pricing",
          content: "Our pricing starts at $500/month",
          similarity: 0.91,
          metadata: {},
        },
        {
          id: "chunk-services",
          content: "We offer web development services",
          similarity: 0.72,
          metadata: {},
        },
      ],
      error: null,
    });

    const results = await searchKnowledge({
      queryEmbedding,
      tenantId,
      kbType: "general",
      topK: 3,
    });

    expect(results).toHaveLength(2);
    expect(results[0].content).toContain("pricing");
    expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
  });

  it("handles the full pipeline error gracefully when HF API is down", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => "Service Unavailable",
    });

    await expect(embedText("test query")).rejects.toThrow(
      "HuggingFace embedding API error (503)"
    );
  });

  it("handles vector search error when RPC fails", async () => {
    const queryEmbedding = Array.from({ length: DIMENSION }, () => 0.1);
    mockRpc.mockReturnValue({
      data: null,
      error: { message: "connection refused" },
    });

    await expect(
      searchKnowledge({
        queryEmbedding,
        tenantId,
        kbType: "general",
      })
    ).rejects.toThrow("Vector search failed: connection refused");
  });
});
```

- [ ] **Step 6.2: Run the integration test**

Run: `cd /Users/codemedavid/Documents/WhatStage_V2 && npx vitest run tests/integration/embedding-pipeline.test.ts`

Expected: All 4 tests PASS.

- [ ] **Step 6.3: Run all tests to make sure nothing is broken**

Run: `cd /Users/codemedavid/Documents/WhatStage_V2 && npm test`

Expected: All existing tests + new tests PASS.

- [ ] **Step 6.4: Commit**

```bash
git add tests/integration/embedding-pipeline.test.ts
git commit -m "test: add integration tests for embedding pipeline"
```

---

## Task 7: Update AI_PLAN.md Checklist

**Files:**
- Modify: `AI_PLAN.md`

- [ ] **Step 7.1: Mark all Phase 1 items as complete**

In `AI_PLAN.md`, replace each `- [ ]` in the Phase 1 section with `- [x]`.

- [ ] **Step 7.2: Commit**

```bash
git add AI_PLAN.md
git commit -m "docs: mark Phase 1 tasks as complete in AI_PLAN.md"
```
