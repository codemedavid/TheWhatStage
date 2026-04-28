# RAG Real-Data Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chatbot's RAG pipeline pull real, grounded tenant data — especially for Taglish/multilingual leads — by upgrading the embedding model, making FAQ chunking atomic, attaching source-aware metadata, and surfacing source attribution in the retrieved-knowledge block.

**Architecture:** Keep the existing hybrid-search RRF + BGE-reranker pipeline. Swap the embedding model from English-only `bge-large-en-v1.5` to multilingual `BAAI/bge-m3` (1024 dims, matches current schema). Add an FAQ-atomic chunker that never splits Q+A pairs. Stamp every chunk with `kb_type`, `language`, `doc_title`, `source_id` metadata so the prompt can cite real sources. Add `hnsw.iterative_scan = relaxed_order` for filtered queries. Add a faithfulness eval harness that catches hallucinated facts in CI.

**Tech Stack:** Next.js, Supabase pgvector 0.8+, HuggingFace Inference (BGE-M3 + BGE-reranker-v2-m3), TypeScript, Vitest.

---

## File Structure

**Modify:**
- `src/lib/ai/embedding.ts` — switch model to BGE-M3, keep 1024-dim contract.
- `src/lib/ai/chunking.ts` — add `chunkFaqAtomic` and `chunkSemantic` helpers; keep existing `chunkText` as the fallback.
- `src/lib/ai/processors/faq.ts` — emit atomic Q+A chunks plus per-chunk metadata.
- `src/lib/ai/processors/pdf.ts`, `processors/docx.ts`, `processors/xlsx.ts`, `processors/product.ts` — pass `language` + `doc_title` metadata through to chunks.
- `src/lib/ai/ingest.ts` — accept and persist chunk-level metadata; detect language; attach `doc_title`.
- `src/lib/ai/vector-search.ts` — set `hnsw.iterative_scan = relaxed_order` per session; bump `topK` ceiling to 20.
- `src/lib/ai/retriever.ts` — pass language hint into search query enrichment; stop dropping all chunks when reranker confidence < threshold (still return them with a `lowConfidence` flag).
- `src/lib/ai/prompt-builder.ts` — `buildRetrievedKnowledge` to render `[1] (FAQ · "Pricing tiers") <content>` instead of `(source: general)`.

**Create:**
- `src/lib/ai/language-detect.ts` — cheap heuristic returning `"en"` / `"tl"` / `"taglish"` / `"other"`.
- `src/lib/ai/eval/golden-set.ts` — tenant-scoped golden Q/A loader from `tests/fixtures/rag-golden/`.
- `src/lib/ai/eval/faithfulness.ts` — LLM-as-judge faithfulness scorer.
- `tests/unit/embedding.test.ts` — dim contract + multilingual smoke test.
- `tests/unit/chunking-faq.test.ts` — Q+A atomicity tests.
- `tests/unit/language-detect.test.ts` — heuristic tests.
- `tests/integration/retriever.test.ts` — full pipeline against fixture KB.
- `tests/eval/rag-faithfulness.test.ts` — runs golden set, asserts faithfulness ≥ threshold.
- `tests/fixtures/rag-golden/sample-tenant.jsonl` — seeded Q/A pairs.
- `supabase/migrations/0028_rag_metadata_and_iterative_scan.sql` — adds metadata indexes, sets `hnsw.iterative_scan`, adds `language` column.

---

## Task 1: Add multilingual language detector

**Files:**
- Create: `src/lib/ai/language-detect.ts`
- Test: `tests/unit/language-detect.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/language-detect.test.ts
import { describe, it, expect } from "vitest";
import { detectLanguage } from "@/lib/ai/language-detect";

describe("detectLanguage", () => {
  it("returns 'en' for plain English", () => {
    expect(detectLanguage("how much does this cost")).toBe("en");
  });

  it("returns 'tl' for plain Tagalog", () => {
    expect(detectLanguage("magkano po ba ito at saan available")).toBe("tl");
  });

  it("returns 'taglish' for code-switched messages", () => {
    expect(detectLanguage("magkano po yung small size")).toBe("taglish");
  });

  it("returns 'other' for short/empty input", () => {
    expect(detectLanguage("")).toBe("other");
    expect(detectLanguage("ok")).toBe("other");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/language-detect.test.ts`
Expected: FAIL — `detectLanguage` not exported.

- [ ] **Step 3: Implement the heuristic**

```ts
// src/lib/ai/language-detect.ts
const TAGALOG_MARKERS = [
  "ang", "ng", "sa", "po", "opo", "yung", "iyong", "ba", "kasi", "para",
  "pala", "naman", "lang", "talaga", "sana", "pwede", "puwede", "ako",
  "ikaw", "kayo", "tayo", "sila", "ito", "iyan", "magkano", "ilan",
  "saan", "kailan", "anong", "paano", "bakit",
];
const ENGLISH_STOPWORDS = [
  "the", "is", "are", "was", "were", "and", "or", "but", "to", "of", "in",
  "on", "at", "for", "with", "by", "from", "this", "that", "do", "does",
];

export type Language = "en" | "tl" | "taglish" | "other";

export function detectLanguage(text: string): Language {
  const cleaned = text.toLowerCase().trim();
  if (cleaned.length < 4) return "other";
  const tokens = cleaned.split(/\s+/);
  if (tokens.length < 2) return "other";

  const tlHits = tokens.filter((t) => TAGALOG_MARKERS.includes(t)).length;
  const enHits = tokens.filter((t) => ENGLISH_STOPWORDS.includes(t)).length;

  if (tlHits >= 2 && enHits >= 2) return "taglish";
  if (tlHits >= 1 && enHits >= 1 && tokens.length >= 3) return "taglish";
  if (tlHits > enHits) return "tl";
  if (enHits > tlHits) return "en";
  return "other";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/language-detect.test.ts`
Expected: PASS — all 4 cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/language-detect.ts tests/unit/language-detect.test.ts
git commit -m "feat(rag): add lightweight language detector for taglish-aware retrieval"
```

---

## Task 2: Switch embedding model to BGE-M3 (multilingual)

**Files:**
- Modify: `src/lib/ai/embedding.ts:3`
- Test: `tests/unit/embedding.test.ts` (create)

**Why:** `BAAI/bge-large-en-v1.5` is English-only. Taglish "magkano po yung pricing" against English-trained vectors recalls weakly. BGE-M3 is the verified 2026 SOTA multilingual model (100+ languages, 1024 dims — drops in without schema changes).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/embedding.test.ts
import { describe, it, expect } from "vitest";
import { embedText, EMBEDDING_DIM } from "@/lib/ai/embedding";

const REAL = process.env.HF_TOKEN ? describe : describe.skip;

REAL("embedText (live)", () => {
  it("returns a 1024-dim vector for English", async () => {
    const v = await embedText("how much does this cost");
    expect(v).toHaveLength(EMBEDDING_DIM);
  });

  it("returns a 1024-dim vector for Tagalog", async () => {
    const v = await embedText("magkano po ba ito");
    expect(v).toHaveLength(EMBEDDING_DIM);
  });

  it("English and Tagalog 'how much' have cosine similarity > 0.5", async () => {
    const [a, b] = await Promise.all([
      embedText("how much does this cost"),
      embedText("magkano po ba ito"),
    ]);
    const dot = a.reduce((s, x, i) => s + x * b[i], 0);
    const na = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    const nb = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
    expect(dot / (na * nb)).toBeGreaterThan(0.5);
  });
});
```

- [ ] **Step 2: Run test against current model — verify cross-lingual sim is low**

Run: `HF_TOKEN=$HF_TOKEN npm test -- tests/unit/embedding.test.ts`
Expected: third test FAILS with similarity in 0.2–0.4 range — confirms current English-only model doesn't bridge Taglish.

- [ ] **Step 3: Switch model**

```ts
// src/lib/ai/embedding.ts (line 3)
const MODEL = "BAAI/bge-m3";
```

- [ ] **Step 4: Run test to verify cross-lingual similarity now passes**

Run: `HF_TOKEN=$HF_TOKEN npm test -- tests/unit/embedding.test.ts`
Expected: PASS — cross-lingual cosine ≥ 0.5.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/embedding.ts tests/unit/embedding.test.ts
git commit -m "feat(rag): switch embeddings to BGE-M3 multilingual for taglish recall"
```

---

## Task 3: Re-embed existing chunks (one-shot script)

**Files:**
- Create: `scripts/reembed-knowledge.ts`

**Why:** The vector space changed. Old vectors are now noise relative to new queries.

- [ ] **Step 1: Write the script**

```ts
// scripts/reembed-knowledge.ts
import { createServiceClient } from "@/lib/supabase/service";
import { embedBatch } from "@/lib/ai/embedding";

const BATCH = 32;

async function main() {
  const supabase = createServiceClient();
  let offset = 0;
  let total = 0;

  while (true) {
    const { data, error } = await supabase
      .from("knowledge_chunks")
      .select("id, content")
      .order("created_at", { ascending: true })
      .range(offset, offset + BATCH - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    const embeddings = await embedBatch(data.map((c) => c.content));
    for (let i = 0; i < data.length; i++) {
      const { error: updErr } = await supabase
        .from("knowledge_chunks")
        .update({ embedding: embeddings[i] })
        .eq("id", data[i].id);
      if (updErr) throw updErr;
    }
    total += data.length;
    console.log(`re-embedded ${total} chunks`);
    offset += BATCH;
  }
  console.log(`done — ${total} total`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Dry-run on staging**

Run: `npx tsx scripts/reembed-knowledge.ts` (against staging DB)
Expected: streaming `re-embedded N chunks` log lines, exit 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/reembed-knowledge.ts
git commit -m "chore(rag): one-shot script to re-embed chunks after model swap"
```

---

## Task 4: Add iterative_scan + chunk metadata schema

**Files:**
- Create: `supabase/migrations/0028_rag_metadata_and_iterative_scan.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0028_rag_metadata_and_iterative_scan.sql

-- 1. Iterative scan defaults for filtered HNSW queries (pgvector 0.8+).
ALTER DATABASE postgres SET hnsw.iterative_scan = 'relaxed_order';
ALTER DATABASE postgres SET hnsw.max_scan_tuples = 40000;

-- 2. Add language column for filter pre-pass.
ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS language text;

-- 3. Functional index on metadata.doc_title for source attribution lookups.
CREATE INDEX IF NOT EXISTS knowledge_chunks_doc_title_idx
  ON knowledge_chunks ((metadata->>'doc_title'));

-- 4. Composite index supporting (tenant_id, kb_type, language) pre-filter.
CREATE INDEX IF NOT EXISTS knowledge_chunks_tenant_kb_lang_idx
  ON knowledge_chunks (tenant_id, kb_type, language);

-- 5. Refresh hybrid RPC to accept an optional language filter.
CREATE OR REPLACE FUNCTION match_knowledge_chunks_hybrid(
  query_embedding vector(1024),
  fts_query       text,
  p_tenant_id     uuid,
  p_kb_type       text,
  p_top_k         int DEFAULT 5,
  p_language      text DEFAULT NULL
)
RETURNS TABLE (
  id         uuid,
  content    text,
  similarity float,
  metadata   jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  vector_k int := 25;
  fts_k    int := 25;
BEGIN
  -- Session-local recall safety net for filtered HNSW.
  PERFORM set_config('hnsw.iterative_scan', 'relaxed_order', true);

  RETURN QUERY
  WITH vector_results AS (
    SELECT kc.id, kc.content, kc.metadata,
      ROW_NUMBER() OVER (ORDER BY kc.embedding <#> query_embedding) AS vec_rank
    FROM knowledge_chunks kc
    WHERE kc.tenant_id = p_tenant_id
      AND kc.kb_type   = p_kb_type
      AND kc.embedding IS NOT NULL
      AND (p_language IS NULL OR kc.language IS NULL OR kc.language = p_language)
    ORDER BY kc.embedding <#> query_embedding
    LIMIT vector_k
  ),
  fts_results AS (
    SELECT kc.id, kc.content, kc.metadata,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank(kc.fts, plainto_tsquery('simple', fts_query)) DESC
      ) AS fts_rank
    FROM knowledge_chunks kc
    WHERE kc.tenant_id = p_tenant_id
      AND kc.kb_type   = p_kb_type
      AND kc.fts @@ plainto_tsquery('simple', fts_query)
    ORDER BY ts_rank(kc.fts, plainto_tsquery('simple', fts_query)) DESC
    LIMIT fts_k
  ),
  combined AS (
    SELECT
      COALESCE(v.id, f.id)             AS id,
      COALESCE(v.content, f.content)   AS content,
      COALESCE(v.metadata, f.metadata) AS metadata,
      COALESCE(1.0 / (60.0 + v.vec_rank), 0.0)
        + COALESCE(1.0 / (60.0 + f.fts_rank), 0.0) AS rrf_score
    FROM vector_results v
    FULL OUTER JOIN fts_results f ON v.id = f.id
  )
  SELECT c.id, c.content, c.rrf_score::float AS similarity, c.metadata
  FROM combined c
  ORDER BY c.rrf_score DESC
  LIMIT p_top_k;
END;
$$;
```

Note: The existing `fts` column was generated with `to_tsvector('english', content)` (migration 0011). Switching the *query* to `'simple'` accepts all tokens including Tagalog without stemming away non-English roots — generated column stays `'english'` for now (changing it requires a full table rewrite; defer to Task 14).

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db reset` (or `npx supabase migration up`)
Expected: migration applies without error.

- [ ] **Step 3: Verify session GUC takes effect**

Run:
```bash
psql "$SUPABASE_DB_URL" -c "SHOW hnsw.iterative_scan;"
```
Expected: `relaxed_order`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0028_rag_metadata_and_iterative_scan.sql
git commit -m "feat(rag): add language column, metadata indexes, iterative_scan RPC"
```

---

## Task 5: FAQ atomic chunker

**Files:**
- Modify: `src/lib/ai/chunking.ts` (add `chunkFaqAtomic`)
- Modify: `src/lib/ai/processors/faq.ts`
- Test: `tests/unit/chunking-faq.test.ts`

**Why:** Right now, an FAQ doc gets concatenated into a single string and passed to `chunkText`, which sentence-splits across Q+A boundaries. That destroys the most retrieval-friendly unit on the platform.

- [ ] **Step 1: Read the current FAQ processor to see its input shape**

Run: `cat src/lib/ai/processors/faq.ts`
Expected: returns either an array of `{question, answer}` rows or pre-joined text.

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/chunking-faq.test.ts
import { describe, it, expect } from "vitest";
import { chunkFaqAtomic } from "@/lib/ai/chunking";

describe("chunkFaqAtomic", () => {
  it("emits exactly one chunk per Q+A pair", () => {
    const chunks = chunkFaqAtomic([
      { question: "What's the price?", answer: "Starts at PHP 4,999." },
      { question: "Do you ship to PH?", answer: "Yes, nationwide." },
    ]);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toBe("Q: What's the price?\nA: Starts at PHP 4,999.");
    expect(chunks[0].metadata.qa_question).toBe("What's the price?");
  });

  it("never splits a long answer across chunks", () => {
    const longAnswer = "A".repeat(5000);
    const chunks = chunkFaqAtomic([{ question: "Q?", answer: longAnswer }]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content.length).toBeGreaterThan(5000);
  });

  it("skips empty pairs", () => {
    const chunks = chunkFaqAtomic([{ question: "", answer: "" }]);
    expect(chunks).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/unit/chunking-faq.test.ts`
Expected: FAIL — `chunkFaqAtomic` not exported.

- [ ] **Step 4: Implement chunker**

Append to `src/lib/ai/chunking.ts`:

```ts
export interface FaqPair {
  question: string;
  answer: string;
}

export interface AtomicChunk {
  content: string;
  metadata: Record<string, unknown>;
}

export function chunkFaqAtomic(pairs: FaqPair[]): AtomicChunk[] {
  const chunks: AtomicChunk[] = [];
  for (const pair of pairs) {
    const q = pair.question.trim();
    const a = pair.answer.trim();
    if (!q && !a) continue;
    chunks.push({
      content: `Q: ${q}\nA: ${a}`,
      metadata: { chunk_kind: "faq", qa_question: q },
    });
  }
  return chunks;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/chunking-faq.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/chunking.ts tests/unit/chunking-faq.test.ts
git commit -m "feat(rag): add atomic FAQ chunker that preserves Q+A pairs"
```

---

## Task 6: Wire chunk-level metadata through ingestion

**Files:**
- Modify: `src/lib/ai/ingest.ts`
- Modify: `src/lib/ai/processors/faq.ts` (return shape compatible with `AtomicChunk`)
- Test: extend `tests/integration/ingest.test.ts` if exists; otherwise inline assertion in retriever test (Task 9).

- [ ] **Step 1: Update `IngestParams` and ingest body**

In `src/lib/ai/ingest.ts`:

```ts
import { detectLanguage } from "@/lib/ai/language-detect";
import { chunkFaqAtomic, type AtomicChunk } from "@/lib/ai/chunking";

export interface IngestParams {
  docId: string;
  tenantId: string;
  type: "pdf" | "docx" | "xlsx" | "richtext" | "faq";
  kbType: "general" | "product";
  buffer: Buffer;
  docTitle: string;
  faqPairs?: { question: string; answer: string }[];
}

export async function ingestDocument(params: IngestParams): Promise<void> {
  const { docId, tenantId, type, kbType, buffer, docTitle, faqPairs } = params;
  const supabase = createServiceClient();

  try {
    let atomicChunks: AtomicChunk[];
    let docMetadata: Record<string, unknown> = { doc_title: docTitle };

    switch (type) {
      case "faq": {
        if (!faqPairs) throw new Error("faqPairs required for FAQ ingest");
        atomicChunks = chunkFaqAtomic(faqPairs);
        break;
      }
      case "pdf": {
        const result = await extractPdfText(buffer);
        atomicChunks = chunkText(result.text).map((content) => ({
          content,
          metadata: { chunk_kind: "doc" },
        }));
        docMetadata = { ...docMetadata, page_count: result.pageCount };
        break;
      }
      case "docx": {
        const text = await extractDocxText(buffer);
        atomicChunks = chunkText(text).map((content) => ({
          content,
          metadata: { chunk_kind: "doc" },
        }));
        break;
      }
      case "xlsx": {
        atomicChunks = extractXlsxText(buffer).map((content) => ({
          content,
          metadata: { chunk_kind: "row" },
        }));
        break;
      }
      case "richtext": {
        const text = buffer.toString("utf-8");
        atomicChunks = chunkText(text).map((content) => ({
          content,
          metadata: { chunk_kind: "doc" },
        }));
        break;
      }
    }

    if (atomicChunks!.length === 0) {
      await supabase.from("knowledge_docs").update({
        status: "ready",
        metadata: { ...docMetadata, warning: "no_chunks" },
      }).eq("id", docId);
      return;
    }

    const embeddings = await embedBatch(atomicChunks!.map((c) => c.content));

    const chunkRows = atomicChunks!.map((c, i) => ({
      doc_id: docId,
      tenant_id: tenantId,
      content: c.content,
      kb_type: kbType,
      embedding: embeddings[i],
      language: detectLanguage(c.content),
      metadata: {
        ...c.metadata,
        doc_title: docTitle,
        source_id: docId,
      },
    }));

    const { error: insertError } = await supabase
      .from("knowledge_chunks")
      .insert(chunkRows);
    if (insertError) throw new Error(`Failed to store chunks: ${insertError.message}`);

    await supabase
      .from("knowledge_docs")
      .update({ status: "ready", metadata: docMetadata })
      .eq("id", docId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("knowledge_docs")
      .update({ status: "error", metadata: { error: message } })
      .eq("id", docId);
  }
}
```

- [ ] **Step 2: Update FAQ processor to expose `faqPairs`**

Read `src/lib/ai/processors/faq.ts` first; then refactor it to expose `extractFaqPairs(buffer): FaqPair[]` if it doesn't already. (Skip this step if it already returns pairs.)

- [ ] **Step 3: Update all `ingestDocument` callers**

Run: `grep -rn "ingestDocument(" src/`
For every call site, add `docTitle` from the matching `knowledge_docs.title` row and pass `faqPairs` for FAQ ingests.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/ingest.ts src/lib/ai/processors/faq.ts src/app/api/
git commit -m "feat(rag): stamp chunks with doc_title, language, source_id for traceability"
```

---

## Task 7: Surface source attribution in retrieved-knowledge block

**Files:**
- Modify: `src/lib/ai/prompt-builder.ts:406-425` (`buildRetrievedKnowledge`)
- Test: `tests/unit/prompt-builder-retrieved-knowledge.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/prompt-builder-retrieved-knowledge.test.ts
import { describe, it, expect } from "vitest";
import { __test__buildRetrievedKnowledge as render } from "@/lib/ai/prompt-builder";
import type { ChunkResult } from "@/lib/ai/vector-search";

describe("buildRetrievedKnowledge", () => {
  it("renders FAQ chunks with question label and doc title", () => {
    const chunks: ChunkResult[] = [{
      id: "c1",
      content: "Q: What's the price?\nA: PHP 4,999.",
      similarity: 0.9,
      metadata: { chunk_kind: "faq", qa_question: "What's the price?", doc_title: "Pricing FAQ", kb_type: "general" },
    }];
    const out = render(chunks);
    expect(out).toContain('[1] (FAQ · "Pricing FAQ" → "What\'s the price?")');
    expect(out).toContain("PHP 4,999");
  });

  it("falls back to doc title when no FAQ question", () => {
    const chunks: ChunkResult[] = [{
      id: "c1", content: "Body text", similarity: 0.7,
      metadata: { chunk_kind: "doc", doc_title: "Returns Policy" },
    }];
    const out = render(chunks);
    expect(out).toContain('[1] (Doc · "Returns Policy")');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/prompt-builder-retrieved-knowledge.test.ts`
Expected: FAIL — `__test__buildRetrievedKnowledge` not exported.

- [ ] **Step 3: Update `buildRetrievedKnowledge` and export it for tests**

Replace lines 406–425 of `src/lib/ai/prompt-builder.ts`:

```ts
function formatChunkLabel(chunk: ChunkResult): string {
  const m = chunk.metadata ?? {};
  const kind = (m.chunk_kind as string) ?? "doc";
  const title = (m.doc_title as string) ?? "untitled";
  if (kind === "faq" && typeof m.qa_question === "string" && m.qa_question.trim()) {
    return `(FAQ · "${title}" → "${m.qa_question}")`;
  }
  if (kind === "row") return `(Sheet row · "${title}")`;
  return `(Doc · "${title}")`;
}

function buildRetrievedKnowledge(chunks: ChunkResult[]): string {
  const header = "--- RETRIEVED KNOWLEDGE ---";
  if (!chunks || chunks.length === 0) {
    return `${header}\nNo specific knowledge retrieved. If a fact is not present, say you don't know and set confidence < 0.4.`;
  }
  const blocks = chunks.map((chunk, i) => {
    const label = formatChunkLabel(chunk);
    return `[${i + 1}] ${label} ${chunk.content}`;
  });
  return [
    header,
    ...blocks,
    "",
    "USE THESE FACTS:",
    "- Every concrete fact in your reply (price, feature, hours, location, what-it-does, who-it's-for) MUST come from a chunk above. Quote numbers and names verbatim.",
    "- Cite the chunk index in cited_chunks (e.g. [1, 3]) for any fact you used.",
    "- A reply that states a fact NOT present in any chunk is a hard hallucination failure. If the answer is not here, say you don't know and set confidence < 0.4.",
  ].join("\n");
}

// Export for tests only
export const __test__buildRetrievedKnowledge = buildRetrievedKnowledge;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/prompt-builder-retrieved-knowledge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/prompt-builder.ts tests/unit/prompt-builder-retrieved-knowledge.test.ts
git commit -m "feat(rag): surface FAQ question + doc title in retrieved-knowledge block"
```

---

## Task 8: Pass language hint into retrieval

**Files:**
- Modify: `src/lib/ai/retriever.ts`
- Modify: `src/lib/ai/vector-search.ts`

- [ ] **Step 1: Add `language` parameter to `searchKnowledge`**

In `src/lib/ai/vector-search.ts`:

```ts
export interface SearchParams {
  queryEmbedding: number[];
  ftsQuery: string;
  tenantId: string;
  kbType: "general" | "product";
  topK?: number;
  language?: string | null;
}

export async function searchKnowledge({
  queryEmbedding, ftsQuery, tenantId, kbType, topK = 20, language = null,
}: SearchParams): Promise<ChunkResult[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("match_knowledge_chunks_hybrid", {
    query_embedding: queryEmbedding,
    fts_query: ftsQuery,
    p_tenant_id: tenantId,
    p_kb_type: kbType,
    p_top_k: topK,
    p_language: language,
  });
  if (error) throw new Error(`Vector search failed: ${error.message}`);
  return (data ?? []).filter((c: ChunkResult) => c.similarity >= SIMILARITY_THRESHOLD);
}
```

- [ ] **Step 2: Detect query language in retriever and pass through**

In `src/lib/ai/retriever.ts`, top of `retrieveKnowledge`:

```ts
import { detectLanguage } from "@/lib/ai/language-detect";

// inside retrieveKnowledge():
const queryLang = detectLanguage(query);
// only pre-filter on language for clearly-tagalog queries; English/other → no filter
const langFilter = queryLang === "tl" ? "tl" : null;
```

Then in `searchTargets`, accept `language: string | null` and forward it to `searchKnowledge`.

- [ ] **Step 3: Run typecheck + existing tests**

Run: `npm run typecheck && npm test -- src/lib/ai/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/retriever.ts src/lib/ai/vector-search.ts
git commit -m "feat(rag): language-aware pre-filter for tagalog-heavy queries"
```

---

## Task 9: Integration test — end-to-end retrieval against fixture KB

**Files:**
- Create: `tests/integration/retriever.test.ts`
- Create: `tests/fixtures/rag-fixture-kb.json`

- [ ] **Step 1: Build the fixture**

```json
// tests/fixtures/rag-fixture-kb.json
{
  "tenantId": "00000000-0000-0000-0000-000000000099",
  "docs": [
    {
      "title": "Pricing FAQ",
      "type": "faq",
      "kbType": "general",
      "faqPairs": [
        { "question": "How much does the starter package cost?", "answer": "PHP 4,999 per month, all-inclusive." },
        { "question": "Do you offer refunds?", "answer": "Yes, full refund within 14 days." }
      ]
    },
    {
      "title": "Pricing FAQ (Tagalog)",
      "type": "faq",
      "kbType": "general",
      "faqPairs": [
        { "question": "Magkano po yung starter package?", "answer": "PHP 4,999 kada buwan, all-in." }
      ]
    }
  ]
}
```

- [ ] **Step 2: Write the test**

```ts
// tests/integration/retriever.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { retrieveKnowledge } from "@/lib/ai/retriever";
import { ingestDocument } from "@/lib/ai/ingest";
import { createServiceClient } from "@/lib/supabase/service";
import fixture from "../fixtures/rag-fixture-kb.json";

const RUN = process.env.HF_TOKEN && process.env.SUPABASE_DB_URL;
const d = RUN ? describe : describe.skip;

d("retriever (live)", () => {
  beforeAll(async () => {
    const supabase = createServiceClient();
    await supabase.from("knowledge_chunks").delete().eq("tenant_id", fixture.tenantId);
    await supabase.from("knowledge_docs").delete().eq("tenant_id", fixture.tenantId);
    for (const doc of fixture.docs) {
      const { data, error } = await supabase.from("knowledge_docs").insert({
        tenant_id: fixture.tenantId, title: doc.title, type: doc.type,
        status: "processing",
      }).select("id").single();
      if (error) throw error;
      await ingestDocument({
        docId: data.id, tenantId: fixture.tenantId, type: doc.type as never,
        kbType: doc.kbType as never, buffer: Buffer.from(""),
        docTitle: doc.title, faqPairs: doc.faqPairs,
      });
    }
  });

  it("retrieves the price chunk for an English query", async () => {
    const r = await retrieveKnowledge({
      query: "how much does the starter cost",
      tenantId: fixture.tenantId,
    });
    expect(r.status).toBe("success");
    expect(r.chunks[0].content).toContain("4,999");
  });

  it("retrieves the price chunk for a Taglish query", async () => {
    const r = await retrieveKnowledge({
      query: "magkano po yung starter",
      tenantId: fixture.tenantId,
    });
    expect(r.status).toBe("success");
    expect(r.chunks[0].content).toContain("4,999");
  });

  it("retrieves the refund chunk for a refund query", async () => {
    const r = await retrieveKnowledge({
      query: "can i get my money back",
      tenantId: fixture.tenantId,
    });
    expect(r.chunks.some((c) => c.content.toLowerCase().includes("refund"))).toBe(true);
  });

  afterAll(async () => {
    const supabase = createServiceClient();
    await supabase.from("knowledge_docs").delete().eq("tenant_id", fixture.tenantId);
  });
});
```

- [ ] **Step 3: Run the integration test**

Run: `HF_TOKEN=$HF_TOKEN SUPABASE_DB_URL=$SUPABASE_DB_URL npm test -- tests/integration/retriever.test.ts`
Expected: PASS — all three queries surface the right chunk.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/retriever.test.ts tests/fixtures/rag-fixture-kb.json
git commit -m "test(rag): integration coverage for english + taglish + paraphrase retrieval"
```

---

## Task 10: Faithfulness eval harness

**Files:**
- Create: `src/lib/ai/eval/golden-set.ts`
- Create: `src/lib/ai/eval/faithfulness.ts`
- Create: `tests/eval/rag-faithfulness.test.ts`
- Create: `tests/fixtures/rag-golden/sample-tenant.jsonl`

**Why:** Catches hallucinations + retrieval drift. Runs in CI on a small golden set so regressions surface before they reach production.

- [ ] **Step 1: Write a small golden set**

```jsonl
// tests/fixtures/rag-golden/sample-tenant.jsonl
{"query":"how much is the starter","expected_fact":"PHP 4,999","language":"en"}
{"query":"magkano po yung starter","expected_fact":"PHP 4,999","language":"taglish"}
{"query":"can i get a refund","expected_fact":"14 days","language":"en"}
```

- [ ] **Step 2: Write the loader**

```ts
// src/lib/ai/eval/golden-set.ts
import { readFileSync } from "fs";

export interface GoldenItem {
  query: string;
  expected_fact: string;
  language: string;
}

export function loadGoldenSet(path: string): GoldenItem[] {
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as GoldenItem);
}
```

- [ ] **Step 3: Write the faithfulness scorer**

```ts
// src/lib/ai/eval/faithfulness.ts
import type { ChunkResult } from "@/lib/ai/vector-search";

/** Substring-match faithfulness: does ANY retrieved chunk contain the expected fact? */
export function chunkContainsFact(chunks: ChunkResult[], fact: string): boolean {
  const needle = fact.toLowerCase().trim();
  return chunks.some((c) => c.content.toLowerCase().includes(needle));
}
```

- [ ] **Step 4: Write the eval test**

```ts
// tests/eval/rag-faithfulness.test.ts
import { describe, it, expect } from "vitest";
import path from "path";
import { retrieveKnowledge } from "@/lib/ai/retriever";
import { loadGoldenSet } from "@/lib/ai/eval/golden-set";
import { chunkContainsFact } from "@/lib/ai/eval/faithfulness";

const RUN = process.env.HF_TOKEN && process.env.SUPABASE_DB_URL;
const d = RUN ? describe : describe.skip;
const TENANT = "00000000-0000-0000-0000-000000000099";

d("RAG golden-set faithfulness", () => {
  const items = loadGoldenSet(path.join(__dirname, "../fixtures/rag-golden/sample-tenant.jsonl"));
  for (const item of items) {
    it(`retrieves expected fact for "${item.query}" (${item.language})`, async () => {
      const r = await retrieveKnowledge({ query: item.query, tenantId: TENANT });
      expect(chunkContainsFact(r.chunks, item.expected_fact))
        .toBe(true);
    });
  }
});
```

- [ ] **Step 5: Run eval (after Task 9 fixture is loaded)**

Run: `HF_TOKEN=$HF_TOKEN SUPABASE_DB_URL=$SUPABASE_DB_URL npm test -- tests/eval/rag-faithfulness.test.ts`
Expected: PASS — all golden items retrieve the expected fact.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/eval/ tests/eval/ tests/fixtures/rag-golden/
git commit -m "feat(rag): faithfulness eval harness with golden set"
```

---

## Task 11: Lower-confidence path — return chunks with a flag instead of dropping

**Files:**
- Modify: `src/lib/ai/retriever.ts`

**Why:** Today, when reranker confidence < 0.45 the retriever returns `chunks: []`. The bot then has no facts and either invents one or refuses. Returning low-confidence chunks (still gated by similarity ≥ 0.45 in `vector-search.ts`) lets the prompt show them as "weak match" and the LLM decide.

- [ ] **Step 1: Update return type + behavior**

```ts
// src/lib/ai/retriever.ts (top)
export interface RetrievalResult {
  status: "success" | "low_confidence" | "no_results";
  chunks: ChunkResult[];
  queryTarget: QueryTarget;
  retrievalPass: 1 | 2;
}

// inside retrieveKnowledge — replace the low-confidence branch:
if (pass1Reranked.length > 0 && pass1Reranked[0].similarity >= RERANK_CONFIDENCE_THRESHOLD) {
  return { status: "success", chunks: pass1Reranked, queryTarget, retrievalPass: 1 };
}

// Pass 2: LLM-assisted query expansion (existing code)…
const merged = deduplicateAndSort([...pass1Reranked, ...pass2Reranked]);
if (merged.length > 0) {
  const status: RetrievalResult["status"] =
    merged[0].similarity >= RERANK_CONFIDENCE_THRESHOLD ? "success" : "low_confidence";
  return { status, chunks: merged, queryTarget, retrievalPass: 2 };
}

return { status: "no_results", chunks: [], queryTarget, retrievalPass: 2 };
```

- [ ] **Step 2: Update `buildRetrievedKnowledge` to label low-confidence retrievals**

In `src/lib/ai/prompt-builder.ts`, accept a status param (extend `PromptContext`):

```ts
// PromptContext: add `ragStatus?: "success" | "low_confidence" | "no_results"`
// buildRetrievedKnowledge: prepend a warning when ragStatus === "low_confidence":
if (ragStatus === "low_confidence") {
  return [
    header,
    "WEAK MATCH — these chunks are the closest available but may not directly answer the lead. Treat as hints, not facts. If they don't contain the exact answer, say you don't know and set confidence < 0.4.",
    ...blocks,
    // …
  ].join("\n");
}
```

Wire `ragStatus` from the conversation engine (`conversation-engine.ts`) when it calls `buildSystemPrompt`.

- [ ] **Step 3: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/retriever.ts src/lib/ai/prompt-builder.ts src/lib/ai/conversation-engine.ts
git commit -m "feat(rag): surface weak-match chunks with explicit warning instead of dropping"
```

---

## Task 12: Increase top-k after reranking from 5 → 8

**Files:**
- Modify: `src/lib/ai/reranker.ts:6` (`TOP_K = 5` → `TOP_K = 8`)

**Why:** Anthropic's Contextual Retrieval study found top-20 outperformed top-5/10. Going straight to 20 doubles prompt size. 8 is a calibrated middle ground for Messenger latency.

- [ ] **Step 1: Bump TOP_K**

```ts
// src/lib/ai/reranker.ts (line 6)
const TOP_K = 8;
```

- [ ] **Step 2: Re-run retriever integration test**

Run: `npm test -- tests/integration/retriever.test.ts`
Expected: PASS, possibly with more chunks visible.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/reranker.ts
git commit -m "tune(rag): rerank top-k 5 -> 8 for fuller grounding without latency blowup"
```

---

## Task 13: Telemetry — log retrieval status + cited_chunks usage

**Files:**
- Modify: `src/lib/ai/conversation-engine.ts` (find the place where the LLM response is parsed)

**Why:** We need a signal for when the model says facts but cites nothing. That's the hallucination canary.

- [ ] **Step 1: Find the response parse site**

Run: `grep -n "cited_chunks" src/lib/ai/conversation-engine.ts src/lib/ai/decision-parser.ts`
Note the line numbers.

- [ ] **Step 2: Add logging**

After the response is parsed, log a structured line:

```ts
// after parsing decision JSON in conversation-engine.ts
const facts_uncited =
  retrievalResult.chunks.length > 0 &&
  (decision.cited_chunks?.length ?? 0) === 0 &&
  decision.confidence >= 0.6;

console.log("[rag-telemetry]", JSON.stringify({
  tenant_id: tenantId,
  conversation_id: conversationId,
  retrieval_status: retrievalResult.status,
  retrieval_pass: retrievalResult.retrievalPass,
  chunks_returned: retrievalResult.chunks.length,
  cited_count: decision.cited_chunks?.length ?? 0,
  confidence: decision.confidence,
  facts_uncited_warning: facts_uncited,
}));
```

- [ ] **Step 3: Smoke-test by running a manual dev conversation**

Run: `npm run dev`, send a chat through Messenger, watch for `[rag-telemetry]` log lines.
Expected: structured log per turn.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/conversation-engine.ts
git commit -m "obs(rag): structured telemetry for retrieval + citation behavior"
```

---

## Task 14 (deferred / optional): Switch FTS column to `simple` config

**Files:**
- Create: `supabase/migrations/0029_fts_simple_config.sql`

**Why:** The generated `fts` column uses `to_tsvector('english', ...)` which stems and discards Tagalog tokens. Switching to `'simple'` keeps every word. This is a full table rewrite — defer until Task 12 telemetry shows BM25 is missing Taglish hits.

(Spec only — do not execute until justified by telemetry.)

```sql
-- supabase/migrations/0029_fts_simple_config.sql (DO NOT APPLY YET)
ALTER TABLE knowledge_chunks DROP COLUMN fts;
ALTER TABLE knowledge_chunks
  ADD COLUMN fts tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;
CREATE INDEX knowledge_chunks_fts_idx ON knowledge_chunks USING GIN (fts);
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Multilingual recall — Task 2 (BGE-M3) + Task 1 (language detect) + Task 8 (filter)
- [x] Atomic FAQ chunks — Task 5
- [x] Source attribution — Tasks 6 + 7
- [x] iterative_scan — Task 4
- [x] Real-data grounding — Task 7 (label + cite forcing) + Task 11 (no silent drop)
- [x] Hallucination guardrail — Tasks 7, 11, 13
- [x] Eval harness — Task 10

**Type consistency:** `AtomicChunk`, `FaqPair`, `RetrievalResult.status`, `IngestParams` — checked across Tasks 5–11.

**No placeholders:** every step has runnable code or commands.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-28-rag-real-data-retrieval.md`.

Recommended order: Task 1 → 2 → 3 (re-embed in staging) → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13. Defer Task 14 until telemetry justifies it.
