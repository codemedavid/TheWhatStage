# Phase 3: RAG Retrieval Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the retrieval engine that classifies user queries, routes them to the correct knowledge base (General, Product, or both), performs vector search, re-ranks results, and handles low-confidence/no-result scenarios — all without an extra LLM call.

**Architecture:** A keyword-based query router classifies queries as `general`, `product`, or `both`. The retriever embeds the query, calls `searchKnowledge()` from Phase 1 against the target KB(s), re-ranks by similarity threshold, and if results are weak (< 0.3), reformulates the query by stripping filler words and retries once. Returns ranked chunks or a `no_results` / `low_confidence` signal for the conversation engine to handle.

**Tech Stack:** TypeScript, Vitest, existing `embedText()` and `searchKnowledge()` from Phase 1

---

## File Structure

```
src/lib/ai/
├── query-router.ts          # Keyword heuristic: query → "general" | "product" | "both"
├── query-reformulator.ts    # Strip filler words, simplify query for retry
├── retriever.ts             # Orchestrator: route → search → re-rank → reformulate → return

tests/unit/
├── query-router.test.ts
├── query-reformulator.test.ts
├── retriever.test.ts

tests/integration/
└── rag-retrieval.test.ts
```

---

## Task 1: Query Router

**Files:**
- Create: `src/lib/ai/query-router.ts`
- Create: `tests/unit/query-router.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/query-router.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { classifyQuery } from "@/lib/ai/query-router";

describe("classifyQuery", () => {
  it("routes price-related queries to product", () => {
    expect(classifyQuery("How much does it cost?")).toBe("product");
    expect(classifyQuery("What's the price of the widget?")).toBe("product");
    expect(classifyQuery("Do you have any deals?")).toBe("product");
    expect(classifyQuery("What products do you sell?")).toBe("product");
  });

  it("routes general info queries to general", () => {
    expect(classifyQuery("What are your business hours?")).toBe("general");
    expect(classifyQuery("Where is your office located?")).toBe("general");
    expect(classifyQuery("How do I contact support?")).toBe("general");
    expect(classifyQuery("Tell me about your company")).toBe("general");
  });

  it("routes ambiguous queries to both", () => {
    expect(classifyQuery("Can you help me?")).toBe("both");
    expect(classifyQuery("I need more information")).toBe("both");
    expect(classifyQuery("Hello")).toBe("both");
  });

  it("is case-insensitive", () => {
    expect(classifyQuery("WHAT IS THE PRICE")).toBe("product");
    expect(classifyQuery("WHERE ARE YOU LOCATED")).toBe("general");
  });

  it("handles empty or whitespace-only queries as both", () => {
    expect(classifyQuery("")).toBe("both");
    expect(classifyQuery("   ")).toBe("both");
  });

  it("routes product-specific terms to product", () => {
    expect(classifyQuery("Tell me about the blue widget")).toBe("product");
    expect(classifyQuery("Do you have this in stock?")).toBe("product");
    expect(classifyQuery("What colors are available?")).toBe("product");
    expect(classifyQuery("shipping options")).toBe("product");
  });

  it("routes FAQ-style queries to general", () => {
    expect(classifyQuery("What is your refund policy?")).toBe("general");
    expect(classifyQuery("Do you offer warranties?")).toBe("general");
    expect(classifyQuery("How does the process work?")).toBe("general");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/query-router.test.ts
```

Expected: FAIL — `classifyQuery` not found.

- [ ] **Step 3: Implement the query router**

Create `src/lib/ai/query-router.ts`:

```typescript
export type QueryTarget = "general" | "product" | "both";

const PRODUCT_KEYWORDS = [
  "price", "cost", "how much", "pricing", "deal", "discount",
  "product", "item", "catalog", "buy", "purchase", "order",
  "stock", "available", "inventory", "color", "size", "spec",
  "shipping", "deliver", "sell",
];

const GENERAL_KEYWORDS = [
  "hours", "hour", "open", "close", "location", "address", "where",
  "contact", "phone", "email", "support", "help",
  "about", "company", "who are", "what do you do",
  "policy", "refund", "return", "warranty", "guarantee",
  "process", "how does", "how do",
  "faq", "question",
];

/**
 * Classify a user query to determine which knowledge base(s) to search.
 * Uses keyword heuristics — no LLM call required.
 */
export function classifyQuery(query: string): QueryTarget {
  const lower = query.toLowerCase().trim();
  if (!lower) return "both";

  const productScore = PRODUCT_KEYWORDS.filter((kw) => lower.includes(kw)).length;
  const generalScore = GENERAL_KEYWORDS.filter((kw) => lower.includes(kw)).length;

  if (productScore > 0 && generalScore === 0) return "product";
  if (generalScore > 0 && productScore === 0) return "general";
  if (productScore > 0 && generalScore > 0) {
    return productScore >= generalScore ? "product" : "general";
  }

  return "both";
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/query-router.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/query-router.ts tests/unit/query-router.test.ts
git commit -m "feat: add keyword-based query router for KB classification"
```

---

## Task 2: Query Reformulator

**Files:**
- Create: `src/lib/ai/query-reformulator.ts`
- Create: `tests/unit/query-reformulator.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/query-reformulator.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { reformulateQuery } from "@/lib/ai/query-reformulator";

describe("reformulateQuery", () => {
  it("strips common filler words", () => {
    const result = reformulateQuery("Can you please tell me about the pricing?");
    expect(result).not.toContain("can");
    expect(result).not.toContain("you");
    expect(result).not.toContain("please");
    expect(result).toContain("pricing");
  });

  it("removes question marks and extra whitespace", () => {
    const result = reformulateQuery("What is the price???");
    expect(result).not.toContain("?");
    expect(result).not.toMatch(/\s{2,}/);
  });

  it("preserves key content words", () => {
    const result = reformulateQuery("How much does the premium widget cost?");
    expect(result).toContain("premium");
    expect(result).toContain("widget");
    expect(result).toContain("cost");
  });

  it("returns the original query trimmed if all words are filler", () => {
    const result = reformulateQuery("can you please do it?");
    // Should return something non-empty (at minimum the remaining content words)
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles empty input", () => {
    expect(reformulateQuery("")).toBe("");
    expect(reformulateQuery("   ")).toBe("");
  });

  it("lowercases the output", () => {
    const result = reformulateQuery("Tell Me About PRODUCTS");
    expect(result).toBe(result.toLowerCase());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/query-reformulator.test.ts
```

Expected: FAIL — `reformulateQuery` not found.

- [ ] **Step 3: Implement the query reformulator**

Create `src/lib/ai/query-reformulator.ts`:

```typescript
const FILLER_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been",
  "can", "could", "would", "should", "will", "shall", "may", "might",
  "do", "does", "did", "has", "have", "had",
  "i", "me", "my", "you", "your", "we", "our", "they", "their",
  "it", "its", "this", "that", "these", "those",
  "to", "of", "in", "on", "at", "for", "with", "by", "from",
  "and", "or", "but", "not", "no",
  "please", "just", "also", "very", "really", "actually",
  "tell", "know", "want", "need", "like", "get",
  "what", "where", "when", "how", "why", "who", "which",
  "about", "some", "any",
]);

/**
 * Simplify a query by removing filler words, punctuation, and extra whitespace.
 * Used as a retry strategy when initial vector search returns low-confidence results.
 */
export function reformulateQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return "";

  const cleaned = trimmed
    .toLowerCase()
    .replace(/[?!.,;:'"()[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const words = cleaned.split(" ");
  const contentWords = words.filter((w) => !FILLER_WORDS.has(w));

  // If all words were filler, return the cleaned original (minus punctuation)
  if (contentWords.length === 0) return cleaned;

  return contentWords.join(" ");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/query-reformulator.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/query-reformulator.ts tests/unit/query-reformulator.test.ts
git commit -m "feat: add query reformulator for low-confidence retry"
```

---

## Task 3: Retriever

**Files:**
- Create: `src/lib/ai/retriever.ts`
- Create: `tests/unit/retriever.test.ts`

This is the core orchestrator. It depends on:
- `classifyQuery()` from `src/lib/ai/query-router.ts` (Task 1)
- `reformulateQuery()` from `src/lib/ai/query-reformulator.ts` (Task 2)
- `embedText()` from `src/lib/ai/embedding.ts` (Phase 1)
- `searchKnowledge()` from `src/lib/ai/vector-search.ts` (Phase 1)

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/retriever.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { retrieveKnowledge } from "@/lib/ai/retriever";
import type { RetrievalResult } from "@/lib/ai/retriever";

vi.mock("@/lib/ai/query-router", () => ({
  classifyQuery: vi.fn(),
}));
vi.mock("@/lib/ai/query-reformulator", () => ({
  reformulateQuery: vi.fn(),
}));
vi.mock("@/lib/ai/embedding", () => ({
  embedText: vi.fn(),
}));
vi.mock("@/lib/ai/vector-search", () => ({
  searchKnowledge: vi.fn(),
}));

import { classifyQuery } from "@/lib/ai/query-router";
import { reformulateQuery } from "@/lib/ai/query-reformulator";
import { embedText } from "@/lib/ai/embedding";
import { searchKnowledge } from "@/lib/ai/vector-search";

const mockClassify = vi.mocked(classifyQuery);
const mockReformulate = vi.mocked(reformulateQuery);
const mockEmbed = vi.mocked(embedText);
const mockSearch = vi.mocked(searchKnowledge);

const fakeEmbedding = Array(1536).fill(0.1);

beforeEach(() => {
  vi.clearAllMocks();
  mockEmbed.mockResolvedValue(fakeEmbedding);
});

describe("retrieveKnowledge", () => {
  const tenantId = "tenant-1";

  it("routes to general KB and returns ranked chunks", async () => {
    mockClassify.mockReturnValue("general");
    mockSearch.mockResolvedValueOnce([
      { id: "c1", content: "Our hours are 9-5.", similarity: 0.85, metadata: {} },
      { id: "c2", content: "We are in Springfield.", similarity: 0.72, metadata: {} },
    ]);

    const result = await retrieveKnowledge({ query: "What are your hours?", tenantId });

    expect(result.status).toBe("success");
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0].similarity).toBeGreaterThanOrEqual(result.chunks[1].similarity);
    expect(result.queryTarget).toBe("general");
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ kbType: "general", topK: 5 })
    );
  });

  it("routes to product KB with topK=3", async () => {
    mockClassify.mockReturnValue("product");
    mockSearch.mockResolvedValueOnce([
      { id: "p1", content: "Widget costs $25.", similarity: 0.90, metadata: {} },
    ]);

    const result = await retrieveKnowledge({ query: "How much is the widget?", tenantId });

    expect(result.status).toBe("success");
    expect(result.queryTarget).toBe("product");
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ kbType: "product", topK: 3 })
    );
  });

  it("queries both KBs when classification is 'both' and merges results", async () => {
    mockClassify.mockReturnValue("both");
    // First call: general KB
    mockSearch.mockResolvedValueOnce([
      { id: "g1", content: "General info.", similarity: 0.60, metadata: {} },
    ]);
    // Second call: product KB
    mockSearch.mockResolvedValueOnce([
      { id: "p1", content: "Product info.", similarity: 0.80, metadata: {} },
    ]);

    const result = await retrieveKnowledge({ query: "Tell me more", tenantId });

    expect(result.status).toBe("success");
    expect(result.chunks).toHaveLength(2);
    // Merged results should be sorted by similarity descending
    expect(result.chunks[0].id).toBe("p1");
    expect(result.chunks[1].id).toBe("g1");
    expect(result.queryTarget).toBe("both");
  });

  it("reformulates and retries when all results are below threshold", async () => {
    mockClassify.mockReturnValue("general");
    // First search: low similarity
    mockSearch.mockResolvedValueOnce([
      { id: "c1", content: "Vaguely related.", similarity: 0.25, metadata: {} },
    ]);
    // Reformulated query retry
    mockReformulate.mockReturnValue("hours open");
    // Need a new embedding for the reformulated query
    mockEmbed.mockResolvedValueOnce(fakeEmbedding);
    // Second search: better results
    mockSearch.mockResolvedValueOnce([
      { id: "c2", content: "We are open 9-5.", similarity: 0.75, metadata: {} },
    ]);

    const result = await retrieveKnowledge({ query: "Can you tell me when you're open?", tenantId });

    expect(result.status).toBe("success");
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].similarity).toBeGreaterThan(0.3);
    expect(mockReformulate).toHaveBeenCalledOnce();
    expect(mockEmbed).toHaveBeenCalledTimes(2);
  });

  it("returns low_confidence when reformulation also yields low results", async () => {
    mockClassify.mockReturnValue("general");
    // First search: low similarity
    mockSearch.mockResolvedValueOnce([
      { id: "c1", content: "Not relevant.", similarity: 0.20, metadata: {} },
    ]);
    // Reformulation retry: still low
    mockReformulate.mockReturnValue("something");
    mockEmbed.mockResolvedValueOnce(fakeEmbedding);
    mockSearch.mockResolvedValueOnce([
      { id: "c2", content: "Still not relevant.", similarity: 0.22, metadata: {} },
    ]);

    const result = await retrieveKnowledge({ query: "xyz abc 123", tenantId });

    expect(result.status).toBe("low_confidence");
    expect(result.chunks).toHaveLength(0);
  });

  it("returns no_results when search returns empty", async () => {
    mockClassify.mockReturnValue("general");
    mockSearch.mockResolvedValueOnce([]);
    // Reformulation retry: also empty
    mockReformulate.mockReturnValue("query");
    mockEmbed.mockResolvedValueOnce(fakeEmbedding);
    mockSearch.mockResolvedValueOnce([]);

    const result = await retrieveKnowledge({ query: "Something obscure", tenantId });

    expect(result.status).toBe("no_results");
    expect(result.chunks).toHaveLength(0);
  });

  it("filters out chunks below the similarity threshold", async () => {
    mockClassify.mockReturnValue("general");
    mockSearch.mockResolvedValueOnce([
      { id: "c1", content: "Good match.", similarity: 0.85, metadata: {} },
      { id: "c2", content: "Weak match.", similarity: 0.25, metadata: {} },
      { id: "c3", content: "Decent match.", similarity: 0.55, metadata: {} },
    ]);

    const result = await retrieveKnowledge({ query: "Tell me about services", tenantId });

    expect(result.status).toBe("success");
    // Only chunks >= 0.3 threshold
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks.every((c) => c.similarity >= 0.3)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/retriever.test.ts
```

Expected: FAIL — `retrieveKnowledge` not found.

- [ ] **Step 3: Implement the retriever**

Create `src/lib/ai/retriever.ts`:

```typescript
import { classifyQuery, type QueryTarget } from "@/lib/ai/query-router";
import { reformulateQuery } from "@/lib/ai/query-reformulator";
import { embedText } from "@/lib/ai/embedding";
import { searchKnowledge, type ChunkResult } from "@/lib/ai/vector-search";

const SIMILARITY_THRESHOLD = 0.3;
const GENERAL_TOP_K = 5;
const PRODUCT_TOP_K = 3;

export interface RetrievalParams {
  query: string;
  tenantId: string;
}

export interface RetrievalResult {
  status: "success" | "low_confidence" | "no_results";
  chunks: ChunkResult[];
  queryTarget: QueryTarget;
}

/**
 * Retrieve relevant knowledge chunks for a user query.
 *
 * 1. Classify query → target KB(s)
 * 2. Embed query → vector search
 * 3. Filter by similarity threshold
 * 4. If results are weak, reformulate and retry once
 * 5. Return ranked chunks or a status signal
 */
export async function retrieveKnowledge(
  params: RetrievalParams
): Promise<RetrievalResult> {
  const { query, tenantId } = params;
  const queryTarget = classifyQuery(query);

  const queryEmbedding = await embedText(query);
  let chunks = await searchTargets(queryEmbedding, tenantId, queryTarget);

  // Filter by threshold
  const strong = chunks.filter((c) => c.similarity >= SIMILARITY_THRESHOLD);

  // If we have good results, return them
  if (strong.length > 0) {
    return {
      status: "success",
      chunks: strong.sort((a, b) => b.similarity - a.similarity),
      queryTarget,
    };
  }

  // Reformulate and retry once
  const simplified = reformulateQuery(query);
  if (simplified && simplified !== query.toLowerCase().trim()) {
    const retryEmbedding = await embedText(simplified);
    chunks = await searchTargets(retryEmbedding, tenantId, queryTarget);
    const retryStrong = chunks.filter((c) => c.similarity >= SIMILARITY_THRESHOLD);

    if (retryStrong.length > 0) {
      return {
        status: "success",
        chunks: retryStrong.sort((a, b) => b.similarity - a.similarity),
        queryTarget,
      };
    }
  }

  // No useful results after retry
  return {
    status: chunks.length === 0 ? "no_results" : "low_confidence",
    chunks: [],
    queryTarget,
  };
}

async function searchTargets(
  queryEmbedding: number[],
  tenantId: string,
  target: QueryTarget
): Promise<ChunkResult[]> {
  if (target === "both") {
    const [general, product] = await Promise.all([
      searchKnowledge({
        queryEmbedding,
        tenantId,
        kbType: "general",
        topK: GENERAL_TOP_K,
      }),
      searchKnowledge({
        queryEmbedding,
        tenantId,
        kbType: "product",
        topK: PRODUCT_TOP_K,
      }),
    ]);
    return [...general, ...product];
  }

  return searchKnowledge({
    queryEmbedding,
    tenantId,
    kbType: target,
    topK: target === "general" ? GENERAL_TOP_K : PRODUCT_TOP_K,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/retriever.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/retriever.ts tests/unit/retriever.test.ts
git commit -m "feat: add RAG retriever with query routing, re-ranking, and reformulation"
```

---

## Task 4: Integration Test — End-to-End Query → Ranked Chunks

**Files:**
- Create: `tests/integration/rag-retrieval.test.ts`

- [ ] **Step 1: Write the integration test**

Create `tests/integration/rag-retrieval.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { retrieveKnowledge } from "@/lib/ai/retriever";

// Mock fetch for HuggingFace embedding API
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock Supabase service client for vector search
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    rpc: mockRpc,
  })),
}));

const API_DIM = 4096;
const fakeEmbedding = Array.from({ length: API_DIM }, (_, i) => Math.sin(i) * 0.01);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RAG Retrieval Integration", () => {
  const tenantId = "tenant-integration";

  it("routes a pricing query to product KB and returns ranked results", async () => {
    // Embed the query
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    // Vector search returns product results
    mockRpc.mockReturnValueOnce({
      data: [
        { id: "p1", content: "Widget costs $25.", similarity: 0.90, metadata: {} },
        { id: "p2", content: "Gadget costs $50.", similarity: 0.72, metadata: {} },
      ],
      error: null,
    });

    const result = await retrieveKnowledge({
      query: "How much does the widget cost?",
      tenantId,
    });

    expect(result.status).toBe("success");
    expect(result.queryTarget).toBe("product");
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0].similarity).toBeGreaterThanOrEqual(result.chunks[1].similarity);
  });

  it("queries both KBs for ambiguous queries and merges results", async () => {
    // Embed the query
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    // General KB results
    mockRpc.mockReturnValueOnce({
      data: [
        { id: "g1", content: "We are a software company.", similarity: 0.65, metadata: {} },
      ],
      error: null,
    });
    // Product KB results
    mockRpc.mockReturnValueOnce({
      data: [
        { id: "p1", content: "Our main product is a CRM.", similarity: 0.78, metadata: {} },
      ],
      error: null,
    });

    const result = await retrieveKnowledge({
      query: "Tell me more about what you do",
      tenantId,
    });

    expect(result.status).toBe("success");
    expect(result.queryTarget).toBe("both");
    expect(result.chunks).toHaveLength(2);
    // Sorted by similarity: product result first
    expect(result.chunks[0].id).toBe("p1");
  });

  it("reformulates and retries when initial results are weak", async () => {
    // First embed
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    // First search: weak results
    mockRpc.mockReturnValueOnce({
      data: [
        { id: "c1", content: "Vague match.", similarity: 0.20, metadata: {} },
      ],
      error: null,
    });

    // Second embed (reformulated query)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    // Second search: strong results
    mockRpc.mockReturnValueOnce({
      data: [
        { id: "c2", content: "Business hours are 9-5.", similarity: 0.82, metadata: {} },
      ],
      error: null,
    });

    const result = await retrieveKnowledge({
      query: "Can you please tell me what time you open?",
      tenantId,
    });

    expect(result.status).toBe("success");
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].content).toContain("9-5");
    // Two embedding calls: original + reformulated
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns no_results when KB is empty", async () => {
    // First embed
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    // First search: empty
    mockRpc.mockReturnValueOnce({ data: [], error: null });

    // Second embed (reformulated)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    // Second search: still empty
    mockRpc.mockReturnValueOnce({ data: [], error: null });

    const result = await retrieveKnowledge({
      query: "Something nobody has asked before",
      tenantId,
    });

    expect(result.status).toBe("no_results");
    expect(result.chunks).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the integration test**

```bash
npm test -- tests/integration/rag-retrieval.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/rag-retrieval.test.ts
git commit -m "test: add end-to-end integration tests for RAG retrieval pipeline"
```

---

## Task 5: Final Verification

- [ ] **Step 1: Run all Phase 3 tests together**

```bash
npm test -- tests/unit/query-router.test.ts tests/unit/query-reformulator.test.ts tests/unit/retriever.test.ts tests/integration/rag-retrieval.test.ts
```

Expected: All tests PASS.

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: All existing Phase 1/2 tests + new Phase 3 tests PASS.

- [ ] **Step 3: Run type checking**

```bash
npm run typecheck
```

Expected: No type errors.

- [ ] **Step 4: Run linting**

```bash
npm run lint
```

Expected: No lint errors.

- [ ] **Step 5: Update AI_PLAN.md — mark Phase 3 tasks as complete**

In `AI_PLAN.md`, change all Phase 3 checkboxes from `- [ ]` to `- [x]`.

- [ ] **Step 6: Commit**

```bash
git add AI_PLAN.md
git commit -m "docs: mark Phase 3 RAG retrieval tasks as complete"
```
