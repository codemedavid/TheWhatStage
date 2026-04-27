# Editable Knowledge & FAQ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FAQ entries individually editable/deletable and turn the Editor tab into a single unified Markdown editor that diff-and-re-embeds richtext sections (including onboarding-generated content).

**Architecture:** FAQ edits flow through new PATCH/DELETE routes that re-embed the single chunk per FAQ. Richtext edits flow through one bulk PUT route that splits Markdown by `## Title` headings, diffs against existing rows by title + sha256(content), and re-embeds only changed/new sections. Each section remains its own `knowledge_docs` row → retrieval granularity preserved. A new pure utility `lib/knowledge/section-diff.ts` holds the diff logic, kept fully unit-tested.

**Tech Stack:** Next.js App Router, Supabase Postgres, Zod, HuggingFace BGE embeddings, Vitest, Playwright. Frontend: React, Tailwind, existing `Card` / `Button` / `EmptyState` UI primitives. Markdown editor: plain `<textarea>` (replaces the per-doc TipTap editor in the Editor tab; FAQ editing stays plain inputs).

**Spec:** `docs/superpowers/specs/2026-04-27-editable-knowledge-design.md`

---

## File Structure

**New files:**
- `supabase/migrations/0026_knowledge_editable.sql` — adds `content_hash`, `display_order` to `knowledge_docs`.
- `src/lib/knowledge/section-diff.ts` — pure utility: parse Markdown into sections, classify against existing docs (created/updated/deleted/unchanged), hash helper.
- `src/app/api/knowledge/faq/[id]/route.ts` — `PATCH` + `DELETE` for a single FAQ.
- `src/app/api/knowledge/richtext/list/route.ts` — `GET` returns all richtext docs as `{ sections: [...] }`.
- `src/app/api/knowledge/richtext/bulk/route.ts` — `PUT` accepts sections, diffs, re-embeds.
- `src/components/dashboard/knowledge/UnifiedRichTextEditor.tsx` — replaces current editor body in the Editor tab.
- `tests/unit/section-diff.test.ts`
- `tests/integration/knowledge-faq-edit.test.ts`
- `tests/integration/knowledge-richtext-bulk.test.ts`
- `tests/e2e/knowledge-edit.spec.ts`

**Modified files:**
- `src/components/dashboard/knowledge/FaqEditor.tsx` — add edit/delete affordances per card.
- `src/components/dashboard/knowledge/KnowledgePanel.tsx` — swap `RichTextEditor` for `UnifiedRichTextEditor`.

**Untouched (intentional):**
- `src/components/dashboard/knowledge/RichTextEditor.tsx` — left in place; no longer referenced from KnowledgePanel after this work, but not deleted in this plan to avoid touching unrelated history. Remove in a follow-up if confirmed dead.
- `src/app/api/knowledge/faq/route.ts` (POST) and `src/app/api/knowledge/richtext/route.ts` (POST) — single-create paths kept intact; onboarding still uses these patterns via `lib/onboarding/persist.ts`.

---

## Task 1: Database migration — `content_hash` + `display_order`

**Files:**
- Create: `supabase/migrations/0026_knowledge_editable.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 0026_knowledge_editable.sql
-- Adds content_hash for cheap change detection and display_order for
-- preserving section order in the unified richtext editor.

ALTER TABLE knowledge_docs
  ADD COLUMN content_hash text,
  ADD COLUMN display_order integer NOT NULL DEFAULT 0;

CREATE INDEX idx_knowledge_docs_tenant_type_order
  ON knowledge_docs(tenant_id, type, display_order);

-- Backfill content_hash for existing rows so subsequent saves can diff.
UPDATE knowledge_docs
  SET content_hash = encode(digest(coalesce(content, ''), 'sha256'), 'hex')
  WHERE content_hash IS NULL;
```

Note: `digest()` requires the `pgcrypto` extension. Run `pgcrypto` check first by listing extensions; the project should already have it (used by `gen_random_uuid`). If not enabled, add `CREATE EXTENSION IF NOT EXISTS pgcrypto;` at the top of the file.

- [ ] **Step 2: Verify pgcrypto is enabled**

Run via Supabase MCP `list_extensions` (or psql):

```sql
SELECT extname FROM pg_extension WHERE extname = 'pgcrypto';
```

Expected: returns one row. If empty, prepend `CREATE EXTENSION IF NOT EXISTS pgcrypto;` to the migration.

- [ ] **Step 3: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool with name `0026_knowledge_editable` and the SQL above.

- [ ] **Step 4: Verify columns exist**

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'knowledge_docs'
  AND column_name IN ('content_hash', 'display_order');
```

Expected: two rows. `content_hash text NULLABLE`. `display_order integer NOT NULL DEFAULT 0`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0026_knowledge_editable.sql
git commit -m "feat(db): add content_hash + display_order to knowledge_docs"
```

---

## Task 2: Section-diff utility — pure logic

**Files:**
- Create: `src/lib/knowledge/section-diff.ts`
- Test: `tests/unit/section-diff.test.ts`

This is the heart of the bulk save. Build it as a pure function so it's trivially testable.

- [ ] **Step 1: Write failing tests**

Create `tests/unit/section-diff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  parseSections,
  diffSections,
  hashContent,
  type ExistingDoc,
  type ParsedSection,
} from "@/lib/knowledge/section-diff";

describe("hashContent", () => {
  it("returns deterministic sha256 hex for identical input", () => {
    expect(hashContent("hello")).toBe(hashContent("hello"));
    expect(hashContent("hello")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("differs when content differs", () => {
    expect(hashContent("a")).not.toBe(hashContent("b"));
  });
});

describe("parseSections", () => {
  it("splits markdown on ## headings", () => {
    const md = `## About\nHello\n\n## Pricing\nWe charge $10`;
    const sections = parseSections(md);
    expect(sections).toEqual([
      { title: "About", content: "Hello", order: 0 },
      { title: "Pricing", content: "We charge $10", order: 1 },
    ]);
  });

  it("trims title and content whitespace", () => {
    const md = `##   Spaced Title   \n\n  body line  \n`;
    expect(parseSections(md)).toEqual([
      { title: "Spaced Title", content: "body line", order: 0 },
    ]);
  });

  it("returns empty array for input with no headings", () => {
    expect(parseSections("just prose with no headings")).toEqual([]);
  });

  it("ignores leading content before the first heading", () => {
    const md = `prefix\n## First\nbody`;
    expect(parseSections(md)).toEqual([
      { title: "First", content: "body", order: 0 },
    ]);
  });

  it("treats H1 (#) and H3 (###) as part of section content", () => {
    const md = `## Section\n### Subheading\ntext`;
    expect(parseSections(md)).toEqual([
      { title: "Section", content: "### Subheading\ntext", order: 0 },
    ]);
  });

  it("throws on duplicate titles (case-insensitive, trimmed)", () => {
    const md = `## About\na\n## about\nb`;
    expect(() => parseSections(md)).toThrow(/duplicate/i);
  });
});

describe("diffSections", () => {
  const existing: ExistingDoc[] = [
    { id: "doc-a", title: "About", contentHash: hashContent("Hello") },
    { id: "doc-b", title: "Pricing", contentHash: hashContent("Old price") },
    { id: "doc-c", title: "Refunds", contentHash: hashContent("30 days") },
  ];

  it("classifies created/updated/deleted/unchanged correctly", () => {
    const incoming: ParsedSection[] = [
      { title: "About", content: "Hello", order: 0 },        // unchanged
      { title: "Pricing", content: "New price", order: 1 },  // updated
      { title: "Team", content: "We are 3", order: 2 },       // created
      // Refunds removed → deleted
    ];

    const result = diffSections(existing, incoming);

    expect(result.unchanged.map((s) => s.title)).toEqual(["About"]);
    expect(result.updated.map((s) => s.title)).toEqual(["Pricing"]);
    expect(result.created.map((s) => s.title)).toEqual(["Team"]);
    expect(result.deleted.map((d) => d.id)).toEqual(["doc-c"]);
  });

  it("matches titles case-insensitively and trims whitespace", () => {
    const incoming: ParsedSection[] = [
      { title: "  about ", content: "Hello", order: 0 },
    ];
    const result = diffSections(existing.slice(0, 1), incoming);
    expect(result.unchanged).toHaveLength(1);
    expect(result.created).toHaveLength(0);
  });

  it("returns empty arrays when nothing to do", () => {
    const result = diffSections([], []);
    expect(result).toEqual({
      created: [],
      updated: [],
      deleted: [],
      unchanged: [],
    });
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

```bash
npm test -- tests/unit/section-diff.test.ts
```

Expected: FAIL — module `@/lib/knowledge/section-diff` cannot be resolved.

- [ ] **Step 3: Implement `section-diff.ts`**

Create `src/lib/knowledge/section-diff.ts`:

```ts
import { createHash } from "crypto";

export interface ParsedSection {
  title: string;
  content: string;
  order: number;
}

export interface ExistingDoc {
  id: string;
  title: string;
  contentHash: string | null;
}

export interface DiffResult {
  created: ParsedSection[];
  updated: Array<ParsedSection & { id: string }>;
  deleted: ExistingDoc[];
  unchanged: Array<ParsedSection & { id: string }>;
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

const HEADING_RE = /^##[ \t]+(.+?)\s*$/;

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

export function parseSections(markdown: string): ParsedSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: ParsedSection[] = [];
  let current: { title: string; bodyLines: string[] } | null = null;

  for (const line of lines) {
    const match = line.match(HEADING_RE);
    if (match) {
      if (current) {
        sections.push({
          title: current.title,
          content: current.bodyLines.join("\n").trim(),
          order: sections.length,
        });
      }
      current = { title: match[1].trim(), bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(line);
    }
  }

  if (current) {
    sections.push({
      title: current.title,
      content: current.bodyLines.join("\n").trim(),
      order: sections.length,
    });
  }

  const seen = new Set<string>();
  for (const s of sections) {
    const key = normalizeTitle(s.title);
    if (seen.has(key)) {
      throw new Error(`Duplicate section title: "${s.title}"`);
    }
    seen.add(key);
  }

  return sections;
}

export function diffSections(
  existing: ExistingDoc[],
  incoming: ParsedSection[]
): DiffResult {
  const existingByTitle = new Map<string, ExistingDoc>();
  for (const doc of existing) {
    existingByTitle.set(normalizeTitle(doc.title), doc);
  }

  const created: ParsedSection[] = [];
  const updated: Array<ParsedSection & { id: string }> = [];
  const unchanged: Array<ParsedSection & { id: string }> = [];
  const incomingTitles = new Set<string>();

  for (const section of incoming) {
    const normalized = { ...section, title: section.title.trim() };
    const key = normalizeTitle(normalized.title);
    incomingTitles.add(key);

    const match = existingByTitle.get(key);
    if (!match) {
      created.push(normalized);
      continue;
    }

    const incomingHash = hashContent(normalized.content);
    if (incomingHash === match.contentHash) {
      unchanged.push({ ...normalized, id: match.id });
    } else {
      updated.push({ ...normalized, id: match.id });
    }
  }

  const deleted = existing.filter(
    (doc) => !incomingTitles.has(normalizeTitle(doc.title))
  );

  return { created, updated, deleted, unchanged };
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- tests/unit/section-diff.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge/section-diff.ts tests/unit/section-diff.test.ts
git commit -m "feat(knowledge): add section-diff utility with tests"
```

---

## Task 3: PATCH + DELETE for individual FAQs

**Files:**
- Create: `src/app/api/knowledge/faq/[id]/route.ts`
- Test: `tests/integration/knowledge-faq-edit.test.ts`

- [ ] **Step 1: Write failing integration tests**

Create `tests/integration/knowledge-faq-edit.test.ts`. Mirror the patterns of existing integration tests (check `tests/integration/` for setup helpers; the project uses Vitest with mocked Supabase service client and a mocked `embedText`).

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock embedding so we don't hit HuggingFace
vi.mock("@/lib/ai/embedding", () => ({
  embedText: vi.fn(async () => new Array(1024).fill(0.1)),
}));

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(async () => ({ tenantId: "tenant-1", userId: "u-1" })),
}));

const supabaseMock = {
  from: vi.fn(),
};
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => supabaseMock,
}));

import { PATCH, DELETE } from "@/app/api/knowledge/faq/[id]/route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/knowledge/faq/abc", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/knowledge/faq/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when question or answer missing", async () => {
    const res = await PATCH(makeReq({ question: "" }), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects when doc not owned by tenant", async () => {
    supabaseMock.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    });

    const res = await PATCH(makeReq({ question: "Q", answer: "A" }), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(404);
  });

  it("updates doc + replaces single chunk on success", async () => {
    const updateDoc = vi.fn().mockReturnValue({ eq: () => ({ error: null }) });
    const updateChunk = vi.fn().mockReturnValue({
      eq: () => ({ eq: () => ({ error: null }) }),
    });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "knowledge_docs") {
        // First call: ownership check (select).
        // Subsequent calls: update.
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "abc", tenant_id: "tenant-1" },
                  error: null,
                }),
              }),
            }),
          }),
          update: (...args: unknown[]) => updateDoc(...args),
        };
      }
      if (table === "knowledge_chunks") {
        return { update: (...args: unknown[]) => updateChunk(...args) };
      }
      throw new Error("unexpected table " + table);
    });

    const res = await PATCH(makeReq({ question: "New Q", answer: "New A" }), {
      params: Promise.resolve({ id: "abc" }),
    });

    expect(res.status).toBe(200);
    expect(updateDoc).toHaveBeenCalled();
    expect(updateChunk).toHaveBeenCalled();
  });
});

describe("DELETE /api/knowledge/faq/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes doc scoped to tenant", async () => {
    const del = vi.fn().mockReturnValue({
      eq: () => ({ eq: () => ({ error: null }) }),
    });
    supabaseMock.from.mockReturnValue({ delete: del });

    const res = await DELETE(
      new Request("http://localhost/api/knowledge/faq/abc", { method: "DELETE" }),
      { params: Promise.resolve({ id: "abc" }) }
    );
    expect(res.status).toBe(204);
    expect(del).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- tests/integration/knowledge-faq-edit.test.ts
```

Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the route**

Create `src/app/api/knowledge/faq/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { embedText } from "@/lib/ai/embedding";
import { formatFaqChunk } from "@/lib/ai/processors/faq";
import { hashContent } from "@/lib/knowledge/section-diff";

const updateSchema = z.object({
  question: z.string().min(1).max(1000),
  answer: z.string().min(1).max(5000),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: RouteContext) {
  const session = await resolveSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session;
  const { id } = await ctx.params;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { question, answer } = parsed.data;
  const service = createServiceClient();

  const { data: doc, error: lookupErr } = await service
    .from("knowledge_docs")
    .select("id, tenant_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }
  if (!doc) {
    return NextResponse.json({ error: "FAQ not found" }, { status: 404 });
  }

  const chunkContent = formatFaqChunk(question, answer);
  const newContent = `${question}\n---\n${answer}`;

  let embedding: number[];
  try {
    embedding = await embedText(chunkContent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await service
      .from("knowledge_docs")
      .update({ status: "error", metadata: { error: msg } })
      .eq("id", id);
    return NextResponse.json({ error: "Embedding failed" }, { status: 502 });
  }

  const { error: docErr } = await service
    .from("knowledge_docs")
    .update({
      title: question,
      content: newContent,
      content_hash: hashContent(newContent),
      status: "ready",
      metadata: {},
    })
    .eq("id", id);

  if (docErr) {
    return NextResponse.json({ error: docErr.message }, { status: 500 });
  }

  const { error: chunkErr } = await service
    .from("knowledge_chunks")
    .update({ content: chunkContent, embedding })
    .eq("doc_id", id)
    .eq("tenant_id", tenantId);

  if (chunkErr) {
    return NextResponse.json({ error: chunkErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(_request: Request, ctx: RouteContext) {
  const session = await resolveSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session;
  const { id } = await ctx.params;
  const service = createServiceClient();

  const { error } = await service
    .from("knowledge_docs")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
```

Note: assumes `knowledge_chunks.doc_id` has `ON DELETE CASCADE`. If unsure, verify with:

```sql
SELECT confdeltype FROM pg_constraint WHERE conname LIKE '%knowledge_chunks%doc%';
```

`c` = cascade. If not `c`, add an explicit chunk delete before the doc delete.

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- tests/integration/knowledge-faq-edit.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/knowledge/faq/[id]/route.ts tests/integration/knowledge-faq-edit.test.ts
git commit -m "feat(api): PATCH + DELETE for individual FAQs"
```

---

## Task 4: GET + PUT bulk routes for richtext

**Files:**
- Create: `src/app/api/knowledge/richtext/list/route.ts`
- Create: `src/app/api/knowledge/richtext/bulk/route.ts`
- Test: `tests/integration/knowledge-richtext-bulk.test.ts`

- [ ] **Step 1: Write failing integration tests**

```ts
// tests/integration/knowledge-richtext-bulk.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const embedBatchMock = vi.fn(
  async (texts: string[]) => texts.map(() => new Array(1024).fill(0.1))
);
vi.mock("@/lib/ai/embedding", () => ({
  embedText: vi.fn(async () => new Array(1024).fill(0.1)),
  embedBatch: embedBatchMock,
}));
vi.mock("@/lib/ai/chunking", () => ({
  chunkText: (s: string) => [s], // 1 chunk per section in tests
}));

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(async () => ({ tenantId: "tenant-1", userId: "u-1" })),
}));

const supabaseMock: any = { from: vi.fn() };
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => supabaseMock,
}));

import { GET } from "@/app/api/knowledge/richtext/list/route";
import { PUT } from "@/app/api/knowledge/richtext/bulk/route";
import { hashContent } from "@/lib/knowledge/section-diff";

beforeEach(() => {
  vi.clearAllMocks();
  embedBatchMock.mockClear();
});

describe("GET /api/knowledge/richtext/list", () => {
  it("returns sections ordered by display_order", async () => {
    supabaseMock.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              data: [
                { id: "1", title: "About", content: "hi", display_order: 0 },
                { id: "2", title: "Pricing", content: "$10", display_order: 1 },
              ],
              error: null,
            }),
          }),
        }),
      }),
    });

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.sections).toEqual([
      { id: "1", title: "About", content: "hi", order: 0 },
      { id: "2", title: "Pricing", content: "$10", order: 1 },
    ]);
  });
});

describe("PUT /api/knowledge/richtext/bulk", () => {
  it("returns 400 on duplicate titles", async () => {
    supabaseMock.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({ data: [], error: null }),
        }),
      }),
    });

    const req = new Request("http://localhost/api/knowledge/richtext/bulk", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sections: [
          { title: "About", content: "a", order: 0 },
          { title: "about", content: "b", order: 1 },
        ],
      }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/duplicate/i);
  });

  it("creates new sections, updates changed, deletes removed, skips unchanged", async () => {
    const existing = [
      { id: "doc-a", title: "About", content_hash: hashContent("Hello"), display_order: 0 },
      { id: "doc-b", title: "Pricing", content_hash: hashContent("Old price"), display_order: 1 },
      { id: "doc-c", title: "Refunds", content_hash: hashContent("30 days"), display_order: 2 },
    ];

    let insertedDoc = { id: "doc-new" };
    const insertSpy = vi.fn().mockReturnValue({
      select: () => ({ single: async () => ({ data: insertedDoc, error: null }) }),
    });
    const updateSpy = vi.fn().mockReturnValue({
      eq: () => ({ eq: () => ({ error: null }) }),
    });
    const deleteSpy = vi.fn().mockReturnValue({
      in: () => ({ eq: () => ({ error: null }) }),
    });
    const chunkDeleteSpy = vi.fn().mockReturnValue({
      eq: () => ({ eq: () => ({ error: null }) }),
    });
    const chunkInsertSpy = vi.fn().mockReturnValue({ error: null });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "knowledge_docs") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                data: existing,
                error: null,
              }),
            }),
          }),
          insert: (...args: unknown[]) => insertSpy(...args),
          update: (...args: unknown[]) => updateSpy(...args),
          delete: (...args: unknown[]) => deleteSpy(...args),
        };
      }
      if (table === "knowledge_chunks") {
        return {
          insert: (...args: unknown[]) => chunkInsertSpy(...args),
          delete: (...args: unknown[]) => chunkDeleteSpy(...args),
        };
      }
      throw new Error("unexpected table " + table);
    });

    const req = new Request("http://localhost/api/knowledge/richtext/bulk", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sections: [
          { title: "About", content: "Hello", order: 0 },        // unchanged
          { title: "Pricing", content: "New price", order: 1 },  // updated
          { title: "Team", content: "We are 3", order: 2 },       // created
          // Refunds → deleted
        ],
      }),
    });

    const res = await PUT(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      created: 1,
      updated: 1,
      deleted: 1,
      unchanged: 1,
    });
    // Embedding called for created + updated only (1 chunk each = 2 texts total)
    expect(embedBatchMock).toHaveBeenCalledTimes(1);
    expect(embedBatchMock.mock.calls[0][0]).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- tests/integration/knowledge-richtext-bulk.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `GET /api/knowledge/richtext/list`**

Create `src/app/api/knowledge/richtext/list/route.ts`:

```ts
import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const session = await resolveSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const service = createServiceClient();

  const { data, error } = await service
    .from("knowledge_docs")
    .select("id, title, content, display_order")
    .eq("tenant_id", session.tenantId)
    .eq("type", "richtext")
    .order("display_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sections = (data ?? []).map((d, i) => ({
    id: d.id,
    title: d.title,
    content: d.content ?? "",
    order: d.display_order ?? i,
  }));

  return NextResponse.json({ sections });
}
```

- [ ] **Step 4: Implement `PUT /api/knowledge/richtext/bulk`**

Create `src/app/api/knowledge/richtext/bulk/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import { embedBatch } from "@/lib/ai/embedding";
import { chunkText } from "@/lib/ai/chunking";
import {
  diffSections,
  hashContent,
  type ExistingDoc,
  type ParsedSection,
} from "@/lib/knowledge/section-diff";

const sectionSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(50_000),
  order: z.number().int().min(0),
});
const bodySchema = z.object({
  sections: z.array(sectionSchema).max(200),
});

interface DocRow {
  id: string;
  title: string;
  content: string | null;
  contentHash: string;
}

async function reEmbedAndStoreChunks(
  service: ReturnType<typeof createServiceClient>,
  tenantId: string,
  rows: Array<{ id: string; content: string; isUpdate: boolean }>
): Promise<{ failures: Array<{ id: string; error: string }> }> {
  const failures: Array<{ id: string; error: string }> = [];
  if (rows.length === 0) return { failures };

  // Build flat chunk list with provenance back to docId
  const chunkPlan: Array<{ docId: string; content: string }> = [];
  for (const row of rows) {
    const chunks = chunkText(row.content);
    for (const c of chunks) {
      chunkPlan.push({ docId: row.id, content: c });
    }
  }

  let embeddings: number[][];
  try {
    embeddings = await embedBatch(chunkPlan.map((c) => c.content));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    for (const row of rows) {
      failures.push({ id: row.id, error: msg });
      await service
        .from("knowledge_docs")
        .update({ status: "error", metadata: { error: msg } })
        .eq("id", row.id);
    }
    return { failures };
  }

  // For each doc that already had chunks (updates), wipe old chunks first.
  for (const row of rows) {
    if (row.isUpdate) {
      const { error } = await service
        .from("knowledge_chunks")
        .delete()
        .eq("doc_id", row.id)
        .eq("tenant_id", tenantId);
      if (error) failures.push({ id: row.id, error: error.message });
    }
  }

  const chunkRows = chunkPlan.map((c, i) => ({
    doc_id: c.docId,
    tenant_id: tenantId,
    content: c.content,
    kb_type: "general" as const,
    embedding: embeddings[i],
    metadata: {},
  }));

  const { error: insertErr } = await service
    .from("knowledge_chunks")
    .insert(chunkRows);
  if (insertErr) {
    failures.push({ id: "chunks", error: insertErr.message });
  }

  return { failures };
}

export async function PUT(request: Request) {
  const session = await resolveSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session;

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Reject duplicate titles up front (case-insensitive)
  const seen = new Set<string>();
  for (const s of parsed.data.sections) {
    const key = s.title.trim().toLowerCase();
    if (seen.has(key)) {
      return NextResponse.json(
        { error: `Duplicate section title: "${s.title}"` },
        { status: 400 }
      );
    }
    seen.add(key);
  }

  const service = createServiceClient();

  const { data: existingRaw, error: loadErr } = await service
    .from("knowledge_docs")
    .select("id, title, content, content_hash, display_order")
    .eq("tenant_id", tenantId)
    .eq("type", "richtext");

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }

  const existing: ExistingDoc[] = (existingRaw ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    contentHash: d.content_hash,
  }));

  const incoming: ParsedSection[] = parsed.data.sections;
  const diff = diffSections(existing, incoming);

  // 1. Delete removed sections (chunks cascade if FK has ON DELETE CASCADE;
  //    otherwise the delete-chunks branch in reEmbedAndStoreChunks does not
  //    apply here because we delete the doc itself).
  if (diff.deleted.length > 0) {
    const ids = diff.deleted.map((d) => d.id);
    const { error } = await service
      .from("knowledge_docs")
      .delete()
      .in("id", ids)
      .eq("tenant_id", tenantId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // 2. Update unchanged display_order only (no embedding)
  for (const s of diff.unchanged) {
    await service
      .from("knowledge_docs")
      .update({ display_order: s.order })
      .eq("id", s.id)
      .eq("tenant_id", tenantId);
  }

  // 3. Update changed sections — title (in case casing changed), content, hash, order
  for (const s of diff.updated) {
    await service
      .from("knowledge_docs")
      .update({
        title: s.title,
        content: s.content,
        content_hash: hashContent(s.content),
        display_order: s.order,
        status: "processing",
        metadata: {},
      })
      .eq("id", s.id)
      .eq("tenant_id", tenantId);
  }

  // 4. Create new sections
  const createdIds: Array<{ id: string; content: string }> = [];
  for (const s of diff.created) {
    const { data, error } = await service
      .from("knowledge_docs")
      .insert({
        tenant_id: tenantId,
        title: s.title,
        type: "richtext",
        content: s.content,
        content_hash: hashContent(s.content),
        display_order: s.order,
        status: "processing",
        metadata: {},
      })
      .select("id")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Insert failed" },
        { status: 500 }
      );
    }
    createdIds.push({ id: data.id, content: s.content });
  }

  // 5. Re-embed updated + created
  const toEmbed = [
    ...diff.updated.map((s) => ({ id: s.id, content: s.content, isUpdate: true })),
    ...createdIds.map((c) => ({ id: c.id, content: c.content, isUpdate: false })),
  ];

  const { failures } = await reEmbedAndStoreChunks(service, tenantId, toEmbed);

  // 6. Mark embedded docs as ready
  const succeededIds = toEmbed
    .map((r) => r.id)
    .filter((id) => !failures.some((f) => f.id === id));
  if (succeededIds.length > 0) {
    await service
      .from("knowledge_docs")
      .update({ status: "ready", metadata: {} })
      .in("id", succeededIds);
  }

  const status = failures.length > 0 ? 207 : 200;
  return NextResponse.json(
    {
      created: diff.created.length,
      updated: diff.updated.length,
      deleted: diff.deleted.length,
      unchanged: diff.unchanged.length,
      failures,
    },
    { status }
  );
}
```

- [ ] **Step 5: Run tests, verify they pass**

```bash
npm test -- tests/integration/knowledge-richtext-bulk.test.ts
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/knowledge/richtext/list/route.ts \
        src/app/api/knowledge/richtext/bulk/route.ts \
        tests/integration/knowledge-richtext-bulk.test.ts
git commit -m "feat(api): GET list + PUT bulk for richtext sections"
```

---

## Task 5: FAQ inline edit + delete UI

**Files:**
- Modify: `src/components/dashboard/knowledge/FaqEditor.tsx`

- [ ] **Step 1: Replace the FAQ list rendering with editable rows**

Replace the entire `FaqEditor.tsx` file with the version below. Changes from the current file:
- Track per-row edit state (`editingId`, `editQ`, `editA`).
- Each row shows Edit + Delete buttons; in edit mode, shows inputs and Save/Cancel.
- Save calls `PATCH /api/knowledge/faq/[id]`; Delete calls `DELETE` after confirmation.
- Removes nothing from the existing add-flow.

```tsx
"use client";

import { useState } from "react";
import { HelpCircle, Plus, Pencil, Trash2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import ProcessingStatus from "./ProcessingStatus";
import type { KnowledgeDoc } from "@/hooks/useKnowledgeDocs";

interface FaqEditorProps {
  docs: KnowledgeDoc[];
  onFaqAdded: () => void;
}

export default function FaqEditor({ docs, onFaqAdded }: FaqEditorProps) {
  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQ, setEditQ] = useState("");
  const [editA, setEditA] = useState("");
  const [rowBusy, setRowBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const faqDocs = docs.filter((d) => d.type === "faq");

  const handleSubmit = async () => {
    setValidationError(null);
    setError(null);
    if (!question.trim() || !answer.trim()) {
      setValidationError("Question and answer are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/knowledge/faq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), answer: answer.trim() }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to save FAQ");
        return;
      }
      setQuestion("");
      setAnswer("");
      setShowForm(false);
      onFaqAdded();
    } catch {
      setError("Failed to save FAQ");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (doc: KnowledgeDoc) => {
    setRowError(null);
    setEditingId(doc.id);
    setEditQ(doc.title);
    // Answer lives in doc.content split by `---`. The list endpoint does
    // not return content today; load it on demand.
    fetch(`/api/knowledge/docs/${doc.id}`)
      .then((r) => r.json())
      .then((body) => {
        const raw = (body?.doc?.content as string) ?? "";
        const idx = raw.indexOf("\n---\n");
        setEditA(idx >= 0 ? raw.slice(idx + 5) : raw);
      })
      .catch(() => setEditA(""));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditQ("");
    setEditA("");
    setRowError(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!editQ.trim() || !editA.trim()) {
      setRowError("Question and answer are required");
      return;
    }
    setRowBusy(true);
    setRowError(null);
    try {
      const res = await fetch(`/api/knowledge/faq/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: editQ.trim(), answer: editA.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setRowError(body.error ?? "Save failed");
        return;
      }
      cancelEdit();
      onFaqAdded();
    } finally {
      setRowBusy(false);
    }
  };

  const deleteFaq = async (id: string) => {
    if (!confirm("Delete this FAQ?")) return;
    setRowBusy(true);
    try {
      const res = await fetch(`/api/knowledge/faq/${id}`, { method: "DELETE" });
      if (res.ok) onFaqAdded();
    } finally {
      setRowBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--ws-text-tertiary)]">
          Add question and answer pairs for common inquiries.
        </p>
        <Button variant="secondary" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" />
          Add FAQ
        </Button>
      </div>

      {showForm && (
        <Card className="mb-4 p-4">
          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
              Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Enter the question..."
              className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
            />
          </div>
          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
              Answer
            </label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Enter the answer..."
              rows={3}
              className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
            />
          </div>
          {validationError && (
            <p className="mb-2 text-sm text-[var(--ws-danger)]">{validationError}</p>
          )}
          {error && <p className="mb-2 text-sm text-[var(--ws-danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                setQuestion("");
                setAnswer("");
                setValidationError(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </Card>
      )}

      {faqDocs.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title="No FAQs added"
          description="Add common questions and answers so your bot can respond accurately."
        />
      ) : (
        <div className="space-y-2">
          {faqDocs.map((doc) =>
            editingId === doc.id ? (
              <Card key={doc.id} className="p-4">
                <div className="mb-3">
                  <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
                    Question
                  </label>
                  <input
                    value={editQ}
                    onChange={(e) => setEditQ(e.target.value)}
                    className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ws-accent)]"
                  />
                </div>
                <div className="mb-3">
                  <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
                    Answer
                  </label>
                  <textarea
                    value={editA}
                    onChange={(e) => setEditA(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ws-accent)]"
                  />
                </div>
                {rowError && (
                  <p className="mb-2 text-sm text-[var(--ws-danger)]">{rowError}</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={cancelEdit} disabled={rowBusy}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={saveEdit} disabled={rowBusy}>
                    {rowBusy ? "Saving..." : "Save"}
                  </Button>
                </div>
              </Card>
            ) : (
              <Card key={doc.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex flex-1 items-center gap-3">
                  <HelpCircle className="h-5 w-5 text-[var(--ws-text-muted)]" />
                  <p className="text-sm font-medium text-[var(--ws-text-primary)]">
                    {doc.title}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <ProcessingStatus
                    status={doc.status}
                    errorMessage={
                      doc.status === "error"
                        ? (doc.metadata?.error as string) ?? undefined
                        : undefined
                    }
                  />
                  <button
                    onClick={() => startEdit(doc)}
                    className="rounded p-1.5 text-[var(--ws-text-muted)] hover:bg-[var(--ws-border-subtle)]"
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteFaq(doc.id)}
                    className="rounded p-1.5 text-[var(--ws-text-muted)] hover:bg-[var(--ws-border-subtle)]"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the existing single-doc GET endpoint shape**

The edit handler calls `/api/knowledge/docs/${id}`. Run:

```bash
ls src/app/api/knowledge/docs/
```

If `[id]/route.ts` does not exist, create it:

```ts
// src/app/api/knowledge/docs/[id]/route.ts
import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await resolveSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const service = createServiceClient();
  const { data, error } = await service
    .from("knowledge_docs")
    .select("id, title, content, type, status, metadata")
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ doc: data });
}
```

- [ ] **Step 3: Manually smoke-test in the dev server**

```bash
npm run dev
```

Navigate to the dashboard knowledge tab → FAQ. Add a FAQ, then edit it (verify saved Q + A reload correctly), then delete it. Confirm no console errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/knowledge/FaqEditor.tsx \
        src/app/api/knowledge/docs/[id]/route.ts
git commit -m "feat(ui): inline edit + delete for individual FAQs"
```

---

## Task 6: Unified richtext editor UI

**Files:**
- Create: `src/components/dashboard/knowledge/UnifiedRichTextEditor.tsx`
- Modify: `src/components/dashboard/knowledge/KnowledgePanel.tsx`

- [ ] **Step 1: Implement `UnifiedRichTextEditor.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { FileEdit, Save } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import type { KnowledgeDoc } from "@/hooks/useKnowledgeDocs";

interface Props {
  docs: KnowledgeDoc[];
  onSaveComplete: () => void;
}

interface SectionPayload {
  id?: string;
  title: string;
  content: string;
  order: number;
}

function sectionsToMarkdown(sections: SectionPayload[]): string {
  return sections
    .sort((a, b) => a.order - b.order)
    .map((s) => `## ${s.title}\n${s.content}`.trim())
    .join("\n\n");
}

function parseMarkdownToSections(md: string): SectionPayload[] {
  const lines = md.split(/\r?\n/);
  const out: SectionPayload[] = [];
  let cur: { title: string; body: string[] } | null = null;
  for (const line of lines) {
    const m = line.match(/^##[ \t]+(.+?)\s*$/);
    if (m) {
      if (cur) {
        out.push({
          title: cur.title,
          content: cur.body.join("\n").trim(),
          order: out.length,
        });
      }
      cur = { title: m[1].trim(), body: [] };
    } else if (cur) {
      cur.body.push(line);
    }
  }
  if (cur) {
    out.push({
      title: cur.title,
      content: cur.body.join("\n").trim(),
      order: out.length,
    });
  }
  return out;
}

export default function UnifiedRichTextEditor({ docs, onSaveComplete }: Props) {
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const richtextDocs = docs.filter((d) => d.type === "richtext");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/knowledge/richtext/list");
        if (!res.ok) {
          setError("Failed to load editor content");
          return;
        }
        const body = await res.json();
        if (cancelled) return;
        const md = sectionsToMarkdown(body.sections ?? []);
        setMarkdown(md);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only run on mount; explicit refetch happens after save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const sections = parseMarkdownToSections(markdown);
      const res = await fetch("/api/knowledge/richtext/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) {
        setError(body.error ?? "Save failed");
        return;
      }
      const parts: string[] = [];
      if (body.created) parts.push(`${body.created} added`);
      if (body.updated) parts.push(`${body.updated} re-embedded`);
      if (body.deleted) parts.push(`${body.deleted} removed`);
      if (body.unchanged) parts.push(`${body.unchanged} unchanged`);
      setSuccess(parts.length ? parts.join(", ") : "Saved");
      if (Array.isArray(body.failures) && body.failures.length > 0) {
        setError(
          `Some sections failed: ${body.failures
            .map((f: { error: string }) => f.error)
            .join("; ")}`
        );
      }
      onSaveComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--ws-border-strong)] border-t-[var(--ws-accent)]" />
      </div>
    );
  }

  if (richtextDocs.length === 0 && markdown.trim() === "") {
    return (
      <div>
        <EmptyState
          icon={FileEdit}
          title="No knowledge written yet"
          description="Type below to add knowledge sections. Each section starts with ## Title."
        />
        <Card className="mt-4 p-3">
          <textarea
            data-testid="unified-editor-textarea"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            rows={16}
            placeholder={"## About us\nWho we are...\n\n## Pricing\nOur pricing..."}
            className="w-full resize-y rounded-md border border-[var(--ws-border)] bg-white p-3 font-mono text-sm leading-relaxed text-[var(--ws-text-primary)] outline-none focus:border-[var(--ws-accent)]"
          />
          <div className="mt-3 flex items-center justify-between">
            {error && <p className="text-sm text-[var(--ws-danger)]">{error}</p>}
            {success && <p className="text-sm text-[var(--ws-success)]">{success}</p>}
            <div className="ml-auto">
              <Button variant="primary" onClick={save} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save & Re-embed"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-[var(--ws-text-tertiary)]">
          One unified editor for all your knowledge. Use{" "}
          <code className="rounded bg-[var(--ws-page)] px-1">## Title</code> to
          start a new section. Save re-embeds only changed sections.
        </p>
      </div>
      <Card className="overflow-hidden">
        <textarea
          data-testid="unified-editor-textarea"
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          rows={24}
          className="w-full resize-y border-0 bg-white p-4 font-mono text-sm leading-relaxed text-[var(--ws-text-primary)] outline-none"
        />
        <div className="flex items-center justify-between border-t border-[var(--ws-border)] px-4 py-3">
          <div className="text-sm">
            {error && <span className="text-[var(--ws-danger)]">{error}</span>}
            {success && !error && (
              <span className="text-[var(--ws-success)]">{success}</span>
            )}
          </div>
          <Button variant="primary" onClick={save} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save & Re-embed"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `KnowledgePanel.tsx`**

Edit `src/components/dashboard/knowledge/KnowledgePanel.tsx`:

Change the import:

```tsx
import RichTextEditor from "./RichTextEditor";
```

to:

```tsx
import UnifiedRichTextEditor from "./UnifiedRichTextEditor";
```

And the usage:

```tsx
{activeTab === "editor" && (
  <RichTextEditor docs={docs} onSaveComplete={refetch} />
)}
```

to:

```tsx
{activeTab === "editor" && (
  <UnifiedRichTextEditor docs={docs} onSaveComplete={refetch} />
)}
```

- [ ] **Step 3: Smoke-test in the dev server**

```bash
npm run dev
```

In a tenant with onboarding-generated content, open Knowledge → Editor. Confirm:
- The unified textarea pre-loads with `## About {tenant}` and `## {tenant} Website Content` sections.
- Editing prose and clicking Save shows "1 re-embedded" toast.
- Adding a brand-new `## Refunds` section creates a new doc.
- Removing a section removes the doc on save.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/knowledge/UnifiedRichTextEditor.tsx \
        src/components/dashboard/knowledge/KnowledgePanel.tsx
git commit -m "feat(ui): unified markdown editor for richtext knowledge"
```

---

## Task 7: E2E test — Playwright

**Files:**
- Create: `tests/e2e/knowledge-edit.spec.ts`

- [ ] **Step 1: Write the E2E spec**

```ts
import { test, expect } from "@playwright/test";

// Assumes a seeded tenant logged in via the project's auth fixture.
// Adapt to existing Playwright setup (e.g. tests/e2e/fixtures.ts).

test.describe("Knowledge editing", () => {
  test("edit and delete an FAQ", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /knowledge/i }).click();
    await page.getByRole("button", { name: /faq/i }).click();

    // Add an FAQ first if none exist
    await page.getByRole("button", { name: /add faq/i }).click();
    await page.getByPlaceholder("Enter the question...").fill("What is your refund policy?");
    await page.getByPlaceholder("Enter the answer...").fill("30 days, no questions asked.");
    await page.getByRole("button", { name: "Save" }).click();

    // Edit it
    const card = page.locator("text=What is your refund policy?").locator("..");
    await card.getByRole("button", { name: "Edit" }).click();
    const qInput = page.locator("input").filter({ hasText: "" }).nth(0);
    await page.locator("textarea").first().fill("60 days, no questions asked.");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.locator("text=What is your refund policy?")).toBeVisible();

    // Delete it
    page.once("dialog", (d) => d.accept());
    await page
      .locator("text=What is your refund policy?")
      .locator("..")
      .getByRole("button", { name: "Delete" })
      .click();

    await expect(page.locator("text=What is your refund policy?")).toHaveCount(0);
  });

  test("unified editor adds, updates, and deletes sections", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /knowledge/i }).click();
    await page.getByRole("button", { name: /editor/i }).click();

    const ta = page.getByTestId("unified-editor-textarea");
    await ta.fill("## Hours\nMon–Fri 9–5\n\n## Contact\nhello@example.com");
    await page.getByRole("button", { name: /save & re-embed/i }).click();
    await expect(page.locator("text=2 added")).toBeVisible();

    // Update one section, leave the other unchanged
    await ta.fill("## Hours\nMon–Sat 9–5\n\n## Contact\nhello@example.com");
    await page.getByRole("button", { name: /save & re-embed/i }).click();
    await expect(page.locator("text=1 re-embedded")).toBeVisible();
    await expect(page.locator("text=1 unchanged")).toBeVisible();

    // Delete a section
    await ta.fill("## Hours\nMon–Sat 9–5");
    await page.getByRole("button", { name: /save & re-embed/i }).click();
    await expect(page.locator("text=1 removed")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the E2E suite**

```bash
npx playwright test tests/e2e/knowledge-edit.spec.ts
```

Expected: PASS. If selectors miss because of tenant scaffolding differences, adjust selectors using the existing E2E auth/setup helpers — do not weaken the assertions.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/knowledge-edit.spec.ts
git commit -m "test(e2e): editable FAQ + unified richtext editor"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run the full unit + integration suite**

```bash
npm test
```

Expected: all green.

- [ ] **Step 2: Type-check + lint**

```bash
npm run typecheck
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Manual full path through the dashboard**

```bash
npm run dev
```

Walk through:
1. Knowledge → FAQ: add, edit (verify content reload), delete.
2. Knowledge → Editor: confirm onboarding-generated sections load. Edit, save, confirm "X re-embedded" toast. Add a new `## ` section and save. Delete a section and save.
3. Open the chat playground / test-chat and ask a question that should retrieve from an edited section. Confirm the bot reflects the new content.

- [ ] **Step 4: Final commit (if any pending)**

```bash
git status
# If clean, no commit needed.
```

---

## Self-Review Notes

- All spec sections (FAQ per-item edit, unified editor, content_hash diff, granular retrieval, error handling, scope exclusions) are covered by Tasks 1–7.
- No "TBD" / "implement later" placeholders.
- Type names are consistent: `ParsedSection`, `ExistingDoc`, `DiffResult`, `SectionPayload` — `SectionPayload` is a UI-only type used in `UnifiedRichTextEditor.tsx`; both client parsers (UI) and server parsers (`section-diff.ts`) implement the same `## Title` rule against the same `parseSections` semantics. Server is authoritative — client parse is a convenience for shaping the request.
- Title-as-key uniqueness enforced both client-side (parseMarkdownToSections accepts duplicates but server rejects with 400) and server-side (defense in depth).
- `chunkText` mocked to 1-chunk-per-section in tests so embedding-call counts are predictable.
- `pgcrypto` is gated behind a verification step in Task 1.
