# Editable Knowledge & FAQ — Design

**Status:** Approved (brainstorm)
**Date:** 2026-04-27
**Author:** WhatStage team

## Problem

Knowledge added to a tenant's bot — FAQs, rich-text editor docs, onboarding-generated content ("About {tenant}", website article) — is currently write-only from the dashboard. Once created, items cannot be edited or deleted. To fix a typo, update a policy, or refine onboarding-generated copy, the tenant has to delete via the database or live with stale knowledge feeding the bot.

## Goal

Tenants can edit existing knowledge in the dashboard. Edited content is re-embedded so retrieval reflects the latest version.

## Non-Goals

- Editing uploaded source files (PDFs, .docx) — re-upload to replace.
- Editing the Products knowledge tab (out of scope here).
- Per-section permissions, version history, or collaborative editing.
- Full WYSIWYG parity with the existing RichTextEditor — the unified editor uses Markdown sections.

## Scope by Tab

| Tab | Editable? | Mode |
| --- | --- | --- |
| Documents (uploaded files) | No | Re-upload to replace |
| FAQ | Yes | Inline edit per card |
| Editor (richtext) | Yes | One unified Markdown editor across all richtext docs (incl. onboarding-generated) |
| Products | No (out of scope) | — |

## Design

### FAQ — Per-Item Edit

Each existing FAQ card gains **Edit** and **Delete** controls.

- **Edit** flips the card into an inline form with the current Q + A pre-filled. Save calls `PATCH /api/knowledge/faq/[id]`. The handler:
  1. Updates `knowledge_docs.title` (= question) and `knowledge_docs.content` (= `${q}\n---\n${a}`).
  2. Re-formats the chunk via `formatFaqChunk(question, answer)`.
  3. Re-embeds and **updates** the existing `knowledge_chunks` row (one row per FAQ doc) — does not create a new chunk.
  4. Sets status `processing` → `ready` around the embed call so the UI shows progress.
- **Delete** calls `DELETE /api/knowledge/faq/[id]` which removes the doc and cascades chunks (FK `ON DELETE CASCADE`).

If embedding fails, status flips to `error` with `metadata.error`; the previous chunk is left intact so retrieval keeps working with the old content. The UI surfaces the error via the existing `ProcessingStatus` component.

### Editor — Unified Section-Based Editor

The Editor tab loads **all `knowledge_docs` of type `richtext`** for the tenant and presents them as one Markdown document:

```
## About Acme Co
Acme Co is a B2B…

## Acme Co Website Content
Our pricing page says…

## Refund policy
We offer a 30-day…
```

Section headers (`## Title`) map 1:1 to richtext docs. The user can:

- Edit prose inside any section.
- Rename a section (changes the doc title).
- Add a new `## New section` block — becomes a new doc on save.
- Delete a section's heading + body — the corresponding doc is deleted on save.
- Reorder sections (display order persisted via a new `display_order` column on `knowledge_docs`, scoped to richtext for now).

A single **"Save & Re-embed"** button commits everything.

#### Save flow (`PUT /api/knowledge/richtext/bulk`)

Request body:

```ts
{ sections: Array<{ title: string; content: string; order: number }> }
```

Server logic:

1. Load existing richtext docs for tenant: `(id, title, content, content_hash)`.
2. Match incoming sections to existing docs by **title** (case-insensitive, trimmed). Title is the natural key — it doubles as the section heading.
3. Compute diff:
   - **Created** — title not in existing set → insert new doc.
   - **Deleted** — existing title not in incoming set → delete doc (chunks cascade).
   - **Updated** — title matches AND `sha256(content)` differs from stored `content_hash` → update doc, re-embed.
   - **Unchanged** — title matches AND content hash matches → update only `display_order`, skip re-embed.
4. For created + updated docs, run the existing `ingestDocument` pipeline (chunks + embeddings). Each doc remains its own row in `knowledge_docs` with its own chunks — retrieval granularity is preserved.
5. Return `{ created: n, updated: n, deleted: n, unchanged: n }` so the UI can show "Re-embedded 3 sections."

**Title collisions:** if the user creates two sections with the same title, return 400 with a clear error pointing at the duplicate. Titles must be unique within a tenant's richtext docs.

**Why title-as-key (not section IDs):** the editor surface is plain Markdown. Embedding hidden IDs in HTML comments works but is fragile when users copy-paste between sections. Title matching is transparent and matches how users think about sections. The trade-off: renaming a section appears as delete-old + create-new (one extra re-embed). Acceptable given the typical edit cadence.

### Data Model Changes

Migration `0026_knowledge_editable.sql`:

```sql
alter table knowledge_docs
  add column content_hash text,
  add column display_order int not null default 0;

create index knowledge_docs_tenant_type_order_idx
  on knowledge_docs(tenant_id, type, display_order);

-- Backfill content_hash for existing rows
update knowledge_docs
  set content_hash = encode(digest(coalesce(content, ''), 'sha256'), 'hex')
  where content_hash is null;
```

`content_hash` is set/updated on every write so save-with-no-changes is a cheap no-op.

### Components

- `FaqEditor.tsx` — gain edit/delete affordances per card; existing add-flow unchanged.
- `RichTextEditor.tsx` — repurposed as **`UnifiedEditor.tsx`**: loads all richtext docs, renders one Markdown editor (existing TipTap/textarea — keep current editor library), parses sections on save. The current "add a single doc" form is removed; new content is added by typing a new `##` section.
- `ProcessingStatus.tsx` — reused as-is for FAQ inline status.

### API Surface

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/knowledge/faq` | Create FAQ (existing) |
| PATCH | `/api/knowledge/faq/[id]` | **New.** Update Q/A + re-embed. |
| DELETE | `/api/knowledge/faq/[id]` | **New.** Delete FAQ. |
| GET | `/api/knowledge/richtext` | **New.** List richtext docs as `{ sections: [...] }`. |
| PUT | `/api/knowledge/richtext/bulk` | **New.** Diff-and-upsert sections. |
| POST | `/api/knowledge/richtext` | Existing single-doc create — keep for now; UI no longer calls it directly but onboarding/persist still uses the same insert path. |

All routes scope by `tenantId` from `resolveSession()` — same pattern as existing routes.

## Error Handling

- **Embedding provider failure (FAQ edit):** doc.status = `error`, prior chunk untouched, UI shows error badge.
- **Embedding failure mid-bulk save (Editor):** process sections sequentially; on first failure, return 207 Partial with `{ succeeded: [...], failed: [{ title, error }] }`. UI shows a per-section error and lets the user retry. Successfully-embedded sections stay updated.
- **Title collision in bulk save:** 400 with the duplicate title.
- **Concurrent edits:** last write wins. Acceptable — single tenant operator.

## Testing

- **Unit** — `lib/knowledge/section-diff.ts` (extract pure diff function): created/updated/deleted/unchanged classification, hash equality, title normalization, duplicate detection.
- **Integration** — PATCH FAQ updates exactly one chunk; DELETE FAQ removes doc + chunks; PUT bulk creates/updates/deletes the right rows; unchanged sections are not re-embedded (assert via mock).
- **Component** — FaqEditor edit-mode toggles and saves; UnifiedEditor parses round-trip (`docs → markdown → parse → docs` is identity for unchanged content).
- **E2E (Playwright)** — Edit an FAQ in the dashboard, verify chat retrieval reflects the new answer. Edit a section in the unified editor, save, verify retrieval.

## Open Questions

None at design time. Implementation plan to follow.

## Out of Scope / Future

- Version history & rollback.
- Diff view before re-embed ("3 sections will change").
- Editing Products knowledge.
- Editing extracted text from uploaded PDFs in-place.
