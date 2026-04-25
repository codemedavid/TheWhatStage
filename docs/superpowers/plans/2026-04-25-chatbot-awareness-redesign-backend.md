# Chatbot Awareness Redesign — Backend & Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-form, task-shaped phase prompt model with a Hormozi-derived awareness ladder where the LLM only labels lead state and a deterministic router picks action pages — eliminating off-topic drift, hot-lead re-cooling, and RAG retrieval drift on the WhatStage selling campaign and similar cases.

**Architecture:** Phases become observation-only stored state (5 fixed awareness rungs auto-seeded per campaign in `awareness_ladder` mode). Per turn, a single structured-JSON LLM call labels (awareness, intent, objection, wants_cta_now, qualifier_just_completed); a pure `pickActionPage` function then selects the action page deterministically from `(awareness, funnel_type, qualifier_completed_at, wants_cta_now, surface_cta)`. Tenant authoring shifts from per-phase prompts to campaign-level structured fields (offer brief, top objections, scoped knowledge). RAG retrieval is constrained at the SQL level to campaign-tagged + global FAQ docs only. Existing `phase_mode='custom'` campaigns continue to run on the legacy path unchanged.

**Tech Stack:** Next.js App Router, Supabase Postgres + RLS, Vitest, TypeScript, HuggingFace LLM client, Zod validation.

---

## File Structure

**Created:**
- `supabase/migrations/0021_chatbot_awareness_redesign.sql` — schema migration + data migration in one file
- `src/lib/ai/awareness.ts` — awareness enum + constants module
- `src/lib/ai/awareness-templates.ts` — Layer D phase strategy templates (5 rungs + global rules + render fn)
- `src/lib/campaigns/router.ts` — pure `pickActionPage` function
- `src/lib/campaigns/convert-to-ladder.ts` — server-side service that converts a custom-mode campaign to awareness_ladder
- `src/app/api/campaigns/[id]/convert-to-ladder/route.ts` — POST endpoint exposing the converter
- `scripts/seed-whatstage-campaign.ts` — dogfood seed: rebuilds the WhatStage selling campaign in awareness_ladder mode
- `tests/unit/awareness.test.ts`
- `tests/unit/awareness-templates.test.ts`
- `tests/unit/campaigns-router.test.ts`
- `tests/unit/convert-to-ladder.test.ts`
- `tests/unit/campaigns-convert-to-ladder-api.test.ts`
- `tests/integration/awareness-pipeline.test.ts`

**Modified:**
- `src/lib/ai/decision-parser.ts` — extend `LLMDecision` with awareness fields
- `src/lib/ai/phase-machine.ts` — add `getCurrentAwareness` + `updateAwareness`; preserve existing exports for custom mode
- `src/lib/ai/retriever.ts` — add `campaignId` parameter; pass through to vector-search
- `src/lib/ai/vector-search.ts` — accept `campaignId` and forward to a new RPC `match_knowledge_chunks_scoped`
- `src/lib/ai/prompt-builder.ts` — branch on `phase_mode`; build awareness-mode prompt with offer_brief, top_objections, Layer D, Layer F routing context
- `src/lib/ai/conversation-engine.ts` — branch on `phase_mode`; new awareness pipeline
- `src/app/api/campaigns/route.ts` — extend POST schema with new fields + auto-seed 5 awareness phases
- `src/app/api/campaigns/[id]/route.ts` — extend PATCH schema
- `src/types/database.ts` — type updates (best-effort; TS uses `unknown` casts in many places)
- `tests/unit/decision-parser.test.ts` — add cases for new fields
- `tests/unit/retriever.test.ts` — add campaign-scoping cases
- `tests/unit/prompt-builder.test.ts` — add awareness-mode coverage; assert custom-mode regression
- `tests/unit/campaigns-api.test.ts` — extend POST/PATCH cases
- `tests/integration/conversation-engine.test.ts` — assert awareness pipeline runs for awareness_ladder campaigns

---

## Spec → Task Map

| Spec section | Tasks |
|---|---|
| Data Model: campaigns columns | Task 1 |
| Data Model: awareness_level enum + campaign_phases | Task 1 |
| Data Model: knowledge_docs scoping + junction | Task 1 |
| Data Model: conversations observed state | Task 1 |
| Data migration (set existing campaigns to custom + docs to global FAQ) | Task 1 |
| Awareness constants module | Task 2 |
| `pickActionPage` (80-case table test) | Tasks 3–4 |
| Layer D templates + render fn | Task 5 |
| Decision parser update (structured fields) | Task 6 |
| RAG scoping (SQL + retriever) | Tasks 7–8 |
| Phase machine awareness helpers | Task 9 |
| Prompt builder refactor (offer_brief / top_objections / Layer D / Layer F / phase_mode branch) | Task 10 |
| Conversation engine awareness pipeline | Task 11 |
| Convert-to-ladder service + API | Tasks 12–13 |
| Campaigns POST/PATCH schema + auto-seed phases | Task 14 |
| Integration tests (per-rung, hot-lead, objection, off-topic, custom regression) | Task 15 |
| Dogfood seed script | Task 16 |

---

## Task 1: Database Migration & Data Backfill

**Files:**
- Create: `supabase/migrations/0021_chatbot_awareness_redesign.sql`

- [ ] **Step 1: Verify last migration number**

Run: `ls supabase/migrations/ | sort | tail -5`
Expected: highest is `0020_action_page_cta.sql`. New migration MUST be `0021_chatbot_awareness_redesign.sql`.

- [ ] **Step 2: Write the migration SQL**

Create `supabase/migrations/0021_chatbot_awareness_redesign.sql`:

```sql
-- =============================================================
-- 0021: Chatbot Awareness Redesign
-- - awareness_level enum
-- - phase_mode enum
-- - new campaigns columns (offer_brief, top_objections, funnel_type,
--   primary_action_page_id, qualifier_action_page_id, optimization_goal,
--   phase_mode)
-- - campaign_phases adds awareness_level + surface_cta
-- - knowledge_docs adds is_global_faq
-- - new junction campaign_knowledge_docs
-- - conversations adds observed-state columns
-- - data backfill: existing campaigns -> phase_mode='custom',
--   existing knowledge_docs -> is_global_faq=true
-- =============================================================

-- 1. ENUMS -----------------------------------------------------
CREATE TYPE awareness_level AS ENUM (
  'UNAWARE', 'PROBLEM_AWARE', 'SOLUTION_AWARE', 'PRODUCT_AWARE', 'MOST_AWARE'
);

CREATE TYPE phase_mode AS ENUM ('awareness_ladder', 'custom');

CREATE TYPE optimization_goal AS ENUM ('SELL', 'BOOK', 'QUALIFY_COLLECT');

CREATE TYPE funnel_type AS ENUM ('direct', 'qualify_first');

-- 2. CAMPAIGNS COLUMNS ----------------------------------------
ALTER TABLE campaigns
  ADD COLUMN optimization_goal optimization_goal,
  ADD COLUMN funnel_type funnel_type NOT NULL DEFAULT 'direct',
  ADD COLUMN primary_action_page_id uuid REFERENCES action_pages(id) ON DELETE SET NULL,
  ADD COLUMN qualifier_action_page_id uuid REFERENCES action_pages(id) ON DELETE SET NULL,
  ADD COLUMN phase_mode phase_mode NOT NULL DEFAULT 'awareness_ladder',
  ADD COLUMN offer_brief jsonb,
  ADD COLUMN top_objections jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN campaigns.offer_brief IS '{ dream_outcome, core_pain, why_us } each ~1 sentence';
COMMENT ON COLUMN campaigns.top_objections IS '[{ objection, counter_frame }] 3-5 entries';

-- 3. CAMPAIGN_PHASES COLUMNS ----------------------------------
ALTER TABLE campaign_phases
  ADD COLUMN awareness_level awareness_level,
  ADD COLUMN surface_cta boolean NOT NULL DEFAULT true;

CREATE INDEX campaign_phases_awareness_idx
  ON campaign_phases (campaign_id, awareness_level);

-- 4. KNOWLEDGE_DOCS SCOPING -----------------------------------
ALTER TABLE knowledge_docs
  ADD COLUMN is_global_faq boolean NOT NULL DEFAULT false;

CREATE TABLE campaign_knowledge_docs (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  doc_id      uuid NOT NULL REFERENCES knowledge_docs(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, doc_id)
);

CREATE INDEX campaign_knowledge_docs_doc_idx
  ON campaign_knowledge_docs (doc_id);

ALTER TABLE campaign_knowledge_docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_knowledge_docs_all" ON campaign_knowledge_docs FOR ALL
  USING (campaign_id IN (SELECT id FROM campaigns WHERE tenant_id = current_tenant_id()));

-- 5. CONVERSATIONS OBSERVED STATE -----------------------------
ALTER TABLE conversations
  ADD COLUMN current_awareness_level awareness_level,
  ADD COLUMN current_intent_label text,
  ADD COLUMN qualifier_completed_at timestamptz,
  ADD COLUMN detected_objections text[] NOT NULL DEFAULT '{}';

-- 6. DATA BACKFILL --------------------------------------------
-- Existing campaigns keep running on the old code path.
UPDATE campaigns SET phase_mode = 'custom' WHERE phase_mode = 'awareness_ladder';

-- Existing knowledge docs are visible globally (preserves current behavior).
UPDATE knowledge_docs SET is_global_faq = true WHERE is_global_faq = false;

-- 7. SCOPED RAG RPC -------------------------------------------
-- Same shape as match_knowledge_chunks_hybrid but constrained by
-- (is_global_faq=true OR doc tagged to current campaign).
CREATE OR REPLACE FUNCTION match_knowledge_chunks_scoped(
  query_embedding vector(1024),
  fts_query       text,
  p_tenant_id     uuid,
  p_campaign_id   uuid,
  p_kb_type       text,
  p_top_k         int DEFAULT 15
)
RETURNS TABLE (
  id         uuid,
  content    text,
  similarity float,
  metadata   jsonb
)
LANGUAGE sql STABLE AS $$
  SELECT
    kc.id,
    kc.content,
    1 - (kc.embedding <=> query_embedding) AS similarity,
    jsonb_build_object('kb_type', kd.kb_type, 'doc_id', kd.id) AS metadata
  FROM knowledge_chunks kc
  JOIN knowledge_docs   kd ON kd.id = kc.doc_id
  WHERE kd.tenant_id = p_tenant_id
    AND kd.kb_type   = p_kb_type
    AND (
      kd.is_global_faq = true
      OR kd.id IN (
        SELECT doc_id FROM campaign_knowledge_docs
        WHERE campaign_id = p_campaign_id
      )
    )
  ORDER BY kc.embedding <=> query_embedding
  LIMIT p_top_k;
$$;
```

> **Note on RPC body:** The existing `match_knowledge_chunks_hybrid` RPC may have a different signature (FTS-weighted hybrid). If your local copy differs, port the same WHERE clause additions into a copy named `match_knowledge_chunks_scoped`. Read `supabase/migrations/0011_hybrid_search.sql` to see the exact body and port it 1:1, only adding the campaign-scope WHERE conditions and the new `p_campaign_id` parameter.

- [ ] **Step 3: Verify migration syntax against the local Supabase**

Run: `npx supabase db reset` (resets local DB and replays all migrations)
Expected: completes without errors. If `match_knowledge_chunks_scoped` errors, port the body from `0011_hybrid_search.sql` exactly.

- [ ] **Step 4: Manually verify backfill worked**

Run:
```bash
npx supabase db query "SELECT count(*) FILTER (WHERE phase_mode='custom') AS custom, count(*) AS total FROM campaigns"
npx supabase db query "SELECT count(*) FILTER (WHERE is_global_faq) AS global, count(*) AS total FROM knowledge_docs"
```
Expected: `custom == total` for campaigns, `global == total` for knowledge_docs.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0021_chatbot_awareness_redesign.sql
git commit -m "feat(db): chatbot awareness redesign schema + data backfill"
```

---

## Task 2: Awareness Constants Module

**Files:**
- Create: `src/lib/ai/awareness.ts`
- Test: `tests/unit/awareness.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/awareness.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  AWARENESS_LEVELS,
  AWARENESS_ORDER,
  isAwarenessLevel,
  type AwarenessLevel,
} from "@/lib/ai/awareness";

describe("awareness constants", () => {
  it("exposes all 5 levels in canonical order", () => {
    expect(AWARENESS_LEVELS).toEqual([
      "UNAWARE",
      "PROBLEM_AWARE",
      "SOLUTION_AWARE",
      "PRODUCT_AWARE",
      "MOST_AWARE",
    ]);
  });

  it("AWARENESS_ORDER maps level to numeric rank 0..4", () => {
    expect(AWARENESS_ORDER.UNAWARE).toBe(0);
    expect(AWARENESS_ORDER.PROBLEM_AWARE).toBe(1);
    expect(AWARENESS_ORDER.SOLUTION_AWARE).toBe(2);
    expect(AWARENESS_ORDER.PRODUCT_AWARE).toBe(3);
    expect(AWARENESS_ORDER.MOST_AWARE).toBe(4);
  });

  it("isAwarenessLevel narrows valid strings", () => {
    expect(isAwarenessLevel("PROBLEM_AWARE")).toBe(true);
    expect(isAwarenessLevel("unaware")).toBe(false);
    expect(isAwarenessLevel("")).toBe(false);
    expect(isAwarenessLevel(null)).toBe(false);
  });

  it("AwarenessLevel type covers all canonical values (compile-time check)", () => {
    const v: AwarenessLevel = "MOST_AWARE";
    expect(v).toBe("MOST_AWARE");
  });
});
```

- [ ] **Step 2: Run the test (expect failure)**

Run: `npx vitest run tests/unit/awareness.test.ts`
Expected: FAIL — module `@/lib/ai/awareness` not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/ai/awareness.ts`:

```ts
export const AWARENESS_LEVELS = [
  "UNAWARE",
  "PROBLEM_AWARE",
  "SOLUTION_AWARE",
  "PRODUCT_AWARE",
  "MOST_AWARE",
] as const;

export type AwarenessLevel = (typeof AWARENESS_LEVELS)[number];

export const AWARENESS_ORDER: Record<AwarenessLevel, number> = {
  UNAWARE: 0,
  PROBLEM_AWARE: 1,
  SOLUTION_AWARE: 2,
  PRODUCT_AWARE: 3,
  MOST_AWARE: 4,
};

export function isAwarenessLevel(value: unknown): value is AwarenessLevel {
  return typeof value === "string" && (AWARENESS_LEVELS as readonly string[]).includes(value);
}

export const AWARENESS_DISPLAY_NAMES: Record<AwarenessLevel, string> = {
  UNAWARE: "Unaware",
  PROBLEM_AWARE: "Problem-aware",
  SOLUTION_AWARE: "Solution-aware",
  PRODUCT_AWARE: "Product-aware",
  MOST_AWARE: "Most-aware",
};

/**
 * Default `surface_cta` value when seeding the 5 awareness phase rows.
 * Spec: UNAWARE/PROBLEM_AWARE = false, others = true.
 */
export const DEFAULT_SURFACE_CTA: Record<AwarenessLevel, boolean> = {
  UNAWARE: false,
  PROBLEM_AWARE: false,
  SOLUTION_AWARE: true,
  PRODUCT_AWARE: true,
  MOST_AWARE: true,
};
```

- [ ] **Step 4: Run the test (expect pass)**

Run: `npx vitest run tests/unit/awareness.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/awareness.ts tests/unit/awareness.test.ts
git commit -m "feat(ai): add awareness level constants module"
```

---

## Task 3: `pickActionPage` Router — Failing Exhaustive Test

**Files:**
- Test: `tests/unit/campaigns-router.test.ts`

The pure router is the most safety-critical pure function in the redesign. The spec requires exhaustive coverage: 5 awareness × 2 funnel × 2 qualifier × 2 cta-want × 2 surface_cta = **80 cases**. We generate them with nested loops to keep the test compact and self-checking.

- [ ] **Step 1: Write the failing exhaustive table test**

Create `tests/unit/campaigns-router.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickActionPage } from "@/lib/campaigns/router";
import { AWARENESS_LEVELS, type AwarenessLevel } from "@/lib/ai/awareness";

const PRIMARY = "ap-primary";
const QUALIFIER = "ap-qualifier";

interface Case {
  awareness: AwarenessLevel;
  funnelType: "direct" | "qualify_first";
  qualifierDone: boolean;
  wantsCta: boolean;
  surfaceCta: boolean;
}

function expectedFor(c: Case): { actionPageId: string | null } {
  if (!c.surfaceCta) return { actionPageId: null };
  if (c.awareness === "MOST_AWARE") return { actionPageId: PRIMARY };
  if (c.awareness === "UNAWARE" || c.awareness === "PROBLEM_AWARE") {
    return { actionPageId: null };
  }
  // SOLUTION_AWARE or PRODUCT_AWARE
  if (!c.wantsCta) return { actionPageId: null };
  if (c.funnelType === "qualify_first" && !c.qualifierDone) {
    return { actionPageId: QUALIFIER };
  }
  return { actionPageId: PRIMARY };
}

describe("pickActionPage exhaustive table (80 cases)", () => {
  const cases: Case[] = [];
  for (const awareness of AWARENESS_LEVELS) {
    for (const funnelType of ["direct", "qualify_first"] as const) {
      for (const qualifierDone of [false, true]) {
        for (const wantsCta of [false, true]) {
          for (const surfaceCta of [false, true]) {
            cases.push({ awareness, funnelType, qualifierDone, wantsCta, surfaceCta });
          }
        }
      }
    }
  }

  it("generates exactly 80 cases", () => {
    expect(cases).toHaveLength(80);
  });

  for (const c of cases) {
    const label = `aw=${c.awareness} funnel=${c.funnelType} qDone=${c.qualifierDone} wants=${c.wantsCta} surface=${c.surfaceCta}`;
    it(label, () => {
      const result = pickActionPage({
        awareness: c.awareness,
        funnelType: c.funnelType,
        qualifierCompletedAt: c.qualifierDone ? new Date("2026-01-01T00:00:00Z") : null,
        wantsCtaNow: c.wantsCta,
        surfaceCta: c.surfaceCta,
        primaryActionPageId: PRIMARY,
        qualifierActionPageId: QUALIFIER,
      });
      const expected = expectedFor(c);
      expect(result.actionPageId).toBe(expected.actionPageId);
      if (expected.actionPageId === null) {
        expect(result.ctaText).toBe("");
      }
    });
  }

  it("falls back to primary when qualifier_first selected but qualifierActionPageId is null", () => {
    const result = pickActionPage({
      awareness: "SOLUTION_AWARE",
      funnelType: "qualify_first",
      qualifierCompletedAt: null,
      wantsCtaNow: true,
      surfaceCta: true,
      primaryActionPageId: PRIMARY,
      qualifierActionPageId: null,
    });
    expect(result.actionPageId).toBe(PRIMARY);
  });

  it("returns ctaText alongside actionPageId when one is selected", () => {
    const result = pickActionPage({
      awareness: "MOST_AWARE",
      funnelType: "direct",
      qualifierCompletedAt: null,
      wantsCtaNow: false,
      surfaceCta: true,
      primaryActionPageId: PRIMARY,
      qualifierActionPageId: null,
      primaryCtaText: "Sign up now",
      qualifierCtaText: "Quick check",
    });
    expect(result.actionPageId).toBe(PRIMARY);
    expect(result.ctaText).toBe("Sign up now");
  });

  it("returns qualifier ctaText when routing to qualifier", () => {
    const result = pickActionPage({
      awareness: "PRODUCT_AWARE",
      funnelType: "qualify_first",
      qualifierCompletedAt: null,
      wantsCtaNow: true,
      surfaceCta: true,
      primaryActionPageId: PRIMARY,
      qualifierActionPageId: QUALIFIER,
      primaryCtaText: "Buy now",
      qualifierCtaText: "Quick fit-check",
    });
    expect(result.actionPageId).toBe(QUALIFIER);
    expect(result.ctaText).toBe("Quick fit-check");
  });
});
```

- [ ] **Step 2: Run the test (expect failure)**

Run: `npx vitest run tests/unit/campaigns-router.test.ts`
Expected: FAIL — `Cannot find module '@/lib/campaigns/router'`.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/unit/campaigns-router.test.ts
git commit -m "test(router): add exhaustive 80-case table for pickActionPage"
```

---

## Task 4: Implement `pickActionPage`

**Files:**
- Create: `src/lib/campaigns/router.ts`

- [ ] **Step 1: Implement the pure function**

Create `src/lib/campaigns/router.ts`:

```ts
import type { AwarenessLevel } from "@/lib/ai/awareness";

export interface PickActionPageInput {
  awareness: AwarenessLevel;
  funnelType: "direct" | "qualify_first";
  qualifierCompletedAt: Date | null;
  wantsCtaNow: boolean;
  surfaceCta: boolean;
  primaryActionPageId: string;
  qualifierActionPageId: string | null;
  primaryCtaText?: string;
  qualifierCtaText?: string;
}

export interface PickActionPageResult {
  actionPageId: string | null;
  ctaText: string;
}

/**
 * Deterministic action-page router. Pure function — no I/O.
 *
 * Rules (from design spec § "Action page routing function"):
 *   - surfaceCta=false              -> null
 *   - MOST_AWARE                    -> primary (always; bypasses qualifier — Hormozi)
 *   - UNAWARE / PROBLEM_AWARE       -> null (never push CTA)
 *   - SOLUTION_AWARE / PRODUCT_AWARE:
 *       - wantsCtaNow=false                                 -> null
 *       - qualify_first AND qualifier not done AND qualifier
 *         page configured                                   -> qualifier
 *       - else                                              -> primary
 */
export function pickActionPage(input: PickActionPageInput): PickActionPageResult {
  const {
    awareness,
    funnelType,
    qualifierCompletedAt,
    wantsCtaNow,
    surfaceCta,
    primaryActionPageId,
    qualifierActionPageId,
    primaryCtaText = "",
    qualifierCtaText = "",
  } = input;

  if (!surfaceCta) {
    return { actionPageId: null, ctaText: "" };
  }

  if (awareness === "MOST_AWARE") {
    return { actionPageId: primaryActionPageId, ctaText: primaryCtaText };
  }

  if (awareness === "UNAWARE" || awareness === "PROBLEM_AWARE") {
    return { actionPageId: null, ctaText: "" };
  }

  // SOLUTION_AWARE or PRODUCT_AWARE
  if (!wantsCtaNow) {
    return { actionPageId: null, ctaText: "" };
  }

  if (
    funnelType === "qualify_first" &&
    qualifierCompletedAt === null &&
    qualifierActionPageId !== null
  ) {
    return { actionPageId: qualifierActionPageId, ctaText: qualifierCtaText };
  }

  return { actionPageId: primaryActionPageId, ctaText: primaryCtaText };
}
```

- [ ] **Step 2: Run the test (expect pass)**

Run: `npx vitest run tests/unit/campaigns-router.test.ts`
Expected: PASS — 83 tests (80 generated + 3 explicit).

- [ ] **Step 3: Commit**

```bash
git add src/lib/campaigns/router.ts
git commit -m "feat(campaigns): add pickActionPage deterministic router"
```

---

## Task 5: Layer D Awareness Templates + Render

**Files:**
- Create: `src/lib/ai/awareness-templates.ts`
- Test: `tests/unit/awareness-templates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/awareness-templates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  renderPhaseStrategy,
  renderGlobalRules,
  AWARENESS_TEMPLATES,
} from "@/lib/ai/awareness-templates";

const offer = {
  dream_outcome: "leads that book themselves into your calendar",
  core_pain: "DMs that go cold",
  why_us: "we route Messenger leads to action pages that close",
};

const objections = [
  { objection: "too expensive", counter_frame: "It pays for itself with one extra booking." },
  { objection: "I'll think about it", counter_frame: "Cool — pin this so you don't lose the link." },
];

describe("AWARENESS_TEMPLATES", () => {
  it("has one template per awareness rung", () => {
    expect(Object.keys(AWARENESS_TEMPLATES).sort()).toEqual([
      "MOST_AWARE",
      "PROBLEM_AWARE",
      "PRODUCT_AWARE",
      "SOLUTION_AWARE",
      "UNAWARE",
    ]);
  });
});

describe("renderPhaseStrategy", () => {
  it("renders UNAWARE with offer.core_pain interpolated and includes the do-NOTs", () => {
    const out = renderPhaseStrategy("UNAWARE", {
      offer,
      primaryActionTitle: "Book a demo",
    });
    expect(out).toContain("LEAD STATE: Doesn't yet know they have a problem");
    expect(out).toContain(offer.core_pain);
    expect(out).toContain("Do NOT pitch");
    expect(out).toContain("Do NOT surface any CTA");
  });

  it("renders PROBLEM_AWARE referencing dream_outcome and core_pain", () => {
    const out = renderPhaseStrategy("PROBLEM_AWARE", {
      offer,
      primaryActionTitle: "Book a demo",
    });
    expect(out).toContain(offer.core_pain);
    expect(out).toContain(offer.dream_outcome);
    expect(out).toContain("Do NOT run discovery");
  });

  it("renders SOLUTION_AWARE with why_us and primary action title", () => {
    const out = renderPhaseStrategy("SOLUTION_AWARE", {
      offer,
      primaryActionTitle: "Book a demo",
    });
    expect(out).toContain(offer.why_us);
    expect(out).toContain("Book a demo");
  });

  it("renders PRODUCT_AWARE referencing why_us and primary action", () => {
    const out = renderPhaseStrategy("PRODUCT_AWARE", {
      offer,
      primaryActionTitle: "Book a demo",
    });
    expect(out).toContain(offer.why_us);
    expect(out).toContain("Book a demo");
    expect(out).toContain("counter_frame VERBATIM");
  });

  it("renders MOST_AWARE Hormozi rule (never re-cool)", () => {
    const out = renderPhaseStrategy("MOST_AWARE", {
      offer,
      primaryActionTitle: "Book a demo",
    });
    expect(out).toContain("never re-cool");
  });
});

describe("renderGlobalRules", () => {
  it("appends campaign rules as bullets when provided", () => {
    const out = renderGlobalRules({
      campaignRules: ["Never offer discounts", "Always reference the demo"],
      objections,
    });
    expect(out).toContain("GLOBAL RULES");
    expect(out).toContain("- Never offer discounts");
    expect(out).toContain("- Always reference the demo");
    expect(out).toContain("Reply in 1–3 sentences max");
    expect(out).toContain("Never list more than ONE action button");
  });

  it("includes the verbatim counter_frames for each top objection", () => {
    const out = renderGlobalRules({ campaignRules: [], objections });
    expect(out).toContain("too expensive");
    expect(out).toContain("It pays for itself with one extra booking.");
    expect(out).toContain("I'll think about it");
    expect(out).toContain("pin this so you don't lose the link");
  });

  it("renders with no campaign rules and no objections without crashing", () => {
    const out = renderGlobalRules({ campaignRules: [], objections: [] });
    expect(out).toContain("GLOBAL RULES");
  });
});
```

- [ ] **Step 2: Run the test (expect failure)**

Run: `npx vitest run tests/unit/awareness-templates.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the templates module**

Create `src/lib/ai/awareness-templates.ts`:

```ts
import type { AwarenessLevel } from "@/lib/ai/awareness";

export interface OfferBrief {
  dream_outcome: string;
  core_pain: string;
  why_us: string;
}

export interface TopObjection {
  objection: string;
  counter_frame: string;
}

export interface RenderContext {
  offer: OfferBrief;
  primaryActionTitle: string;
}

/**
 * Layer D phase strategy templates — one per awareness rung.
 * Pure strings with `{token}` placeholders; `renderPhaseStrategy` interpolates.
 */
export const AWARENESS_TEMPLATES: Record<AwarenessLevel, string> = {
  UNAWARE: [
    "LEAD STATE: Doesn't yet know they have a problem you solve.",
    "RECOGNIZE BY: vague curiosity, off-topic chatter, no pain articulated.",
    "YOUR JOB: Plant the pain in one line. Reference {core_pain}.",
    "         Ask one question that surfaces whether they relate to it.",
    "         Do NOT pitch. Do NOT mention the product yet.",
    "         Do NOT surface any CTA.",
    "TONE: warm, curious, not pushy.",
  ].join("\n"),

  PROBLEM_AWARE: [
    "LEAD STATE: Knows the pain, doesn't know solutions exist.",
    "RECOGNIZE BY: complaining about {core_pain} or its symptoms.",
    "YOUR JOB: Validate the pain in one sentence. Tease that there's a path",
    "         to {dream_outcome} without pitching.",
    "         Ask one clarifying question MAX to confirm fit.",
    "         Do NOT run discovery. Do NOT list features.",
    "         Do NOT surface a CTA unless they explicitly ask \"how\" or \"what is it\".",
    "TONE: empathetic, confident.",
  ].join("\n"),

  SOLUTION_AWARE: [
    "LEAD STATE: Knows solutions exist, comparing categories.",
    "RECOGNIZE BY: \"what's the best way to...\", \"should I do X or Y\", general research questions.",
    "YOUR JOB: Differentiate {why_us} in one line.",
    "         If they ask a factual question, answer from the knowledge base — short.",
    "         When natural, route to {primary_action_title}.",
    "         Do NOT compare yourself to specific competitors unless asked.",
    "         Do NOT dump features.",
    "TONE: helpful expert, not salesy.",
  ].join("\n"),

  PRODUCT_AWARE: [
    "LEAD STATE: Knows your product, weighing it. Often objecting or comparing.",
    "RECOGNIZE BY: questions about price, features, terms; \"vs <competitor>\"; hesitation phrases.",
    "YOUR JOB:",
    "  - If a top objection is detected → use the matching counter_frame VERBATIM",
    "    from campaign config. Do not improvise.",
    "  - Otherwise reinforce {why_us} and route to {primary_action_title}.",
    "  - Always surface CTA when momentum allows.",
    "DO NOT volunteer discounts. Do NOT negotiate against yourself.",
    "TONE: confident, direct, value-anchored.",
  ].join("\n"),

  MOST_AWARE: [
    "LEAD STATE: Ready to buy. Just needs the path.",
    "RECOGNIZE BY: \"how do I sign up\", \"send me the link\", \"I'm in\", explicit yes signals.",
    "YOUR JOB: Give the path. ONE message: brief confirmation + the action button.",
    "         No questions. No pitch. No discovery.",
    "         If qualifier_first funnel AND qualifier not done: still go straight",
    "         to primary CTA — never re-cool a hot lead.",
    "TONE: short, action-oriented.",
  ].join("\n"),
};

/**
 * Interpolates `{dream_outcome}`, `{core_pain}`, `{why_us}`, `{primary_action_title}`
 * into the chosen awareness template.
 */
export function renderPhaseStrategy(
  level: AwarenessLevel,
  ctx: RenderContext
): string {
  const tpl = AWARENESS_TEMPLATES[level];
  return tpl
    .replaceAll("{dream_outcome}", ctx.offer.dream_outcome)
    .replaceAll("{core_pain}", ctx.offer.core_pain)
    .replaceAll("{why_us}", ctx.offer.why_us)
    .replaceAll("{primary_action_title}", ctx.primaryActionTitle);
}

export interface RenderGlobalRulesInput {
  campaignRules: string[];
  objections: TopObjection[];
}

/**
 * Cross-rung guardrails always appended to the system prompt in awareness mode.
 * Includes verbatim counter_frames for every top objection.
 */
export function renderGlobalRules(input: RenderGlobalRulesInput): string {
  const lines: string[] = [
    "GLOBAL RULES (always apply):",
    "- Reply in 1–3 sentences max unless the user asked a deep factual question.",
    "- Never list more than ONE action button per message.",
    "- Never invent action pages, prices, or guarantees not in your context.",
    "- If the user asks a factual question NOT in the knowledge base, say so",
    "  briefly and route them to the appropriate page or human if available.",
  ];

  for (const r of input.campaignRules) {
    lines.push(`- ${r}`);
  }

  if (input.objections.length > 0) {
    lines.push("", "TOP OBJECTIONS (use the counter_frame VERBATIM when matched):");
    for (const o of input.objections) {
      lines.push(`- "${o.objection}" → ${o.counter_frame}`);
    }
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Run the test (expect pass)**

Run: `npx vitest run tests/unit/awareness-templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/awareness-templates.ts tests/unit/awareness-templates.test.ts
git commit -m "feat(ai): add awareness ladder Layer D templates + global rules"
```

---

## Task 6: Decision Parser — New Structured Output

**Files:**
- Modify: `src/lib/ai/decision-parser.ts`
- Test: `tests/unit/decision-parser.test.ts` (extend)

The new LLM contract returns:
```
{
  reply, detected_awareness, intent_label, detected_objection,
  wants_cta_now, qualifier_just_completed
}
```
We add these fields to `LLMDecision` while keeping the legacy fields (`message`, `phaseAction`, `confidence`, `imageIds`, `actionButtonId`, `ctaText`) intact for custom-mode regression.

The legacy `message` field maps from `reply` if present (otherwise from `message`).

- [ ] **Step 1: Append failing tests**

Append to `tests/unit/decision-parser.test.ts`:

```ts
describe("parseDecision — awareness fields", () => {
  it("parses all new awareness fields when present", () => {
    const raw = JSON.stringify({
      reply: "Got it — quick fit-check next.",
      detected_awareness: "PRODUCT_AWARE",
      intent_label: "comparing solutions",
      detected_objection: "money",
      wants_cta_now: true,
      qualifier_just_completed: false,
      confidence: 0.85,
    });
    const result = parseDecision(raw);
    expect(result.message).toBe("Got it — quick fit-check next.");
    expect(result.detectedAwareness).toBe("PRODUCT_AWARE");
    expect(result.intentLabel).toBe("comparing solutions");
    expect(result.detectedObjection).toBe("money");
    expect(result.wantsCtaNow).toBe(true);
    expect(result.qualifierJustCompleted).toBe(false);
  });

  it("falls back to null awareness when value is unknown", () => {
    const raw = JSON.stringify({
      reply: "Hi",
      detected_awareness: "TOTALLY_AWARE",
      wants_cta_now: false,
      qualifier_just_completed: false,
    });
    const result = parseDecision(raw);
    expect(result.detectedAwareness).toBeNull();
  });

  it("falls back wantsCtaNow to false when missing or non-boolean", () => {
    const result = parseDecision(
      JSON.stringify({ reply: "Hi", detected_awareness: "UNAWARE" })
    );
    expect(result.wantsCtaNow).toBe(false);
    expect(result.qualifierJustCompleted).toBe(false);
  });

  it("falls back intentLabel and detectedObjection to null when missing", () => {
    const result = parseDecision(
      JSON.stringify({ reply: "Hi", detected_awareness: "UNAWARE" })
    );
    expect(result.intentLabel).toBeNull();
    expect(result.detectedObjection).toBeNull();
  });

  it("uses `reply` when both `reply` and `message` are present", () => {
    const result = parseDecision(
      JSON.stringify({ reply: "from reply", message: "from message" })
    );
    expect(result.message).toBe("from reply");
  });

  it("keeps legacy `message` when `reply` is absent", () => {
    const result = parseDecision(
      JSON.stringify({ message: "legacy", phase_action: "stay", confidence: 0.8 })
    );
    expect(result.message).toBe("legacy");
  });
});
```

- [ ] **Step 2: Run the tests (expect failure)**

Run: `npx vitest run tests/unit/decision-parser.test.ts`
Expected: FAIL — `result.detectedAwareness` is undefined etc.

- [ ] **Step 3: Update `src/lib/ai/decision-parser.ts`**

Replace the entire file with:

```ts
import { isAwarenessLevel, type AwarenessLevel } from "@/lib/ai/awareness";

export interface LLMDecision {
  // Legacy fields (custom mode)
  message: string;
  phaseAction: "stay" | "advance" | "escalate";
  confidence: number;
  imageIds: string[];
  actionButtonId: string | null;
  ctaText: string | null;

  // New awareness-mode fields (null when not provided)
  detectedAwareness: AwarenessLevel | null;
  intentLabel: string | null;
  detectedObjection: string | null;
  wantsCtaNow: boolean;
  qualifierJustCompleted: boolean;
}

const VALID_ACTIONS = new Set(["stay", "advance", "escalate"]);

function extractJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // continue
    }
  }
  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch {
      // give up
    }
  }
  return null;
}

function clampConfidence(value: unknown): number {
  const num = typeof value === "number" && !Number.isNaN(value) ? value : 0.5;
  return Math.max(0.0, Math.min(1.0, num));
}

function emptyDecision(): LLMDecision {
  return {
    message: "",
    phaseAction: "escalate",
    confidence: 0.5,
    imageIds: [],
    actionButtonId: null,
    ctaText: null,
    detectedAwareness: null,
    intentLabel: null,
    detectedObjection: null,
    wantsCtaNow: false,
    qualifierJustCompleted: false,
  };
}

export function parseDecision(raw: string): LLMDecision {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object") return emptyDecision();
  const obj = parsed as Record<string, unknown>;

  // message: prefer "reply" (new schema) over "message" (legacy)
  const replyVal = typeof obj.reply === "string" ? obj.reply : null;
  const messageVal = typeof obj.message === "string" ? obj.message : null;
  const message = replyVal ?? messageVal ?? "";

  const confidence = clampConfidence(obj.confidence);

  let phaseAction: "stay" | "advance" | "escalate" =
    typeof obj.phase_action === "string" && VALID_ACTIONS.has(obj.phase_action)
      ? (obj.phase_action as "stay" | "advance" | "escalate")
      : "stay";

  if (message === "") phaseAction = "escalate";
  if (confidence < 0.4) phaseAction = "escalate";

  const imageIds = Array.isArray(obj.image_ids)
    ? obj.image_ids.filter((id): id is string => typeof id === "string")
    : [];

  const actionButtonId =
    typeof obj.action_button_id === "string" && obj.action_button_id.length > 0
      ? obj.action_button_id
      : null;

  const ctaText =
    actionButtonId !== null && typeof obj.cta_text === "string" && obj.cta_text.length > 0
      ? obj.cta_text
      : null;

  const detectedAwareness = isAwarenessLevel(obj.detected_awareness)
    ? obj.detected_awareness
    : null;

  const intentLabel =
    typeof obj.intent_label === "string" && obj.intent_label.trim().length > 0
      ? obj.intent_label.trim()
      : null;

  const detectedObjection =
    typeof obj.detected_objection === "string" && obj.detected_objection.trim().length > 0
      ? obj.detected_objection.trim()
      : null;

  const wantsCtaNow = obj.wants_cta_now === true;
  const qualifierJustCompleted = obj.qualifier_just_completed === true;

  return {
    message,
    phaseAction,
    confidence,
    imageIds,
    actionButtonId,
    ctaText,
    detectedAwareness,
    intentLabel,
    detectedObjection,
    wantsCtaNow,
    qualifierJustCompleted,
  };
}
```

- [ ] **Step 4: Run the tests (expect pass; existing legacy tests still pass)**

Run: `npx vitest run tests/unit/decision-parser.test.ts`
Expected: PASS — all legacy + new tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/decision-parser.ts tests/unit/decision-parser.test.ts
git commit -m "feat(ai): extend decision parser with awareness output fields"
```

---

## Task 7: Vector Search — Add `campaignId` Parameter

**Files:**
- Modify: `src/lib/ai/vector-search.ts`
- Test: `tests/unit/vector-search.test.ts` (extend)

- [ ] **Step 1: Inspect current test to understand mock RPC pattern**

Run: `head -60 tests/unit/vector-search.test.ts`
Expected output: see how `mockRpc` is wired and asserted.

- [ ] **Step 2: Append a failing test**

Append to `tests/unit/vector-search.test.ts`:

```ts
describe("searchKnowledge campaign scoping", () => {
  it("calls match_knowledge_chunks_scoped RPC when campaignId is provided", async () => {
    const { searchKnowledge } = await import("@/lib/ai/vector-search");
    // Reuse the mockRpc set up at the top of the file
    // (file-level import + vi.mock("@/lib/supabase/service"))
    mockRpc.mockResolvedValueOnce({
      data: [{ id: "k1", content: "x", similarity: 0.9, metadata: { kb_type: "general" } }],
      error: null,
    });
    await searchKnowledge({
      queryEmbedding: Array(1024).fill(0),
      ftsQuery: "hi",
      tenantId: "t1",
      campaignId: "camp-1",
      kbType: "general",
      topK: 5,
    });
    expect(mockRpc).toHaveBeenCalledWith(
      "match_knowledge_chunks_scoped",
      expect.objectContaining({
        p_campaign_id: "camp-1",
        p_tenant_id: "t1",
        p_kb_type: "general",
        p_top_k: 5,
      })
    );
  });

  it("falls back to match_knowledge_chunks_hybrid when campaignId is omitted", async () => {
    const { searchKnowledge } = await import("@/lib/ai/vector-search");
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    await searchKnowledge({
      queryEmbedding: Array(1024).fill(0),
      ftsQuery: "hi",
      tenantId: "t1",
      kbType: "general",
    });
    expect(mockRpc).toHaveBeenCalledWith(
      "match_knowledge_chunks_hybrid",
      expect.any(Object)
    );
  });
});
```

> If the existing test file doesn't expose `mockRpc` at the top-level (i.e. it's a local var inside `describe`), copy the file-level mock setup pattern from `tests/integration/conversation-engine.test.ts` (lines 9–16). Required: `const mockRpc = vi.fn();` and `vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn(() => ({ rpc: mockRpc })) }))`.

- [ ] **Step 3: Run test (expect failure)**

Run: `npx vitest run tests/unit/vector-search.test.ts`
Expected: FAIL — RPC name mismatch.

- [ ] **Step 4: Update `src/lib/ai/vector-search.ts`**

Replace with:

```ts
import { createServiceClient } from "@/lib/supabase/service";

export interface ChunkResult {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface SearchParams {
  queryEmbedding: number[];
  ftsQuery: string;
  tenantId: string;
  /** When provided, scopes retrieval to global FAQ docs + docs tagged to this campaign. */
  campaignId?: string;
  kbType: "general" | "product";
  topK?: number;
}

const SIMILARITY_THRESHOLD = 0.45;

export async function searchKnowledge({
  queryEmbedding,
  ftsQuery,
  tenantId,
  campaignId,
  kbType,
  topK = 15,
}: SearchParams): Promise<ChunkResult[]> {
  const supabase = createServiceClient();

  const useScoped = typeof campaignId === "string" && campaignId.length > 0;

  const { data, error } = useScoped
    ? await supabase.rpc("match_knowledge_chunks_scoped", {
        query_embedding: queryEmbedding,
        fts_query: ftsQuery,
        p_tenant_id: tenantId,
        p_campaign_id: campaignId,
        p_kb_type: kbType,
        p_top_k: topK,
      })
    : await supabase.rpc("match_knowledge_chunks_hybrid", {
        query_embedding: queryEmbedding,
        fts_query: ftsQuery,
        p_tenant_id: tenantId,
        p_kb_type: kbType,
        p_top_k: topK,
      });

  if (error) {
    throw new Error(`Vector search failed: ${error.message}`);
  }

  return (data ?? []).filter((c: ChunkResult) => c.similarity >= SIMILARITY_THRESHOLD);
}
```

- [ ] **Step 5: Run tests (expect pass; existing tests still pass)**

Run: `npx vitest run tests/unit/vector-search.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/vector-search.ts tests/unit/vector-search.test.ts
git commit -m "feat(ai): scope vector search to campaign + global FAQ via new RPC"
```

---

## Task 8: Retriever — Plumb Through `campaignId` + Low-Similarity Cutoff

**Files:**
- Modify: `src/lib/ai/retriever.ts`
- Test: `tests/unit/retriever.test.ts` (extend)

- [ ] **Step 1: Append failing tests**

Append to `tests/unit/retriever.test.ts`:

```ts
describe("retrieveKnowledge — campaign scoping", () => {
  it("forwards campaignId to searchKnowledge in both kb_type calls", async () => {
    mockClassify.mockReturnValue("both");
    mockSearch.mockResolvedValue([chunk("c1", 0.8)]);
    mockRerank.mockResolvedValue([chunk("c1", 0.85)]);

    await retrieveKnowledge({
      query: "what is whatstage",
      tenantId: "t1",
      campaignId: "camp-1",
    });

    const calls = mockSearch.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    for (const [args] of calls) {
      expect(args).toMatchObject({ campaignId: "camp-1", tenantId: "t1" });
    }
  });

  it("returns no_results when top similarity < 0.5 cutoff", async () => {
    mockClassify.mockReturnValue("general");
    mockSearch.mockResolvedValue([chunk("c1", 0.4)]);
    // Reranker returns the same low-similarity chunk
    mockRerank.mockResolvedValue([chunk("c1", 0.4)]);
    mockGenerate.mockResolvedValue({ content: "" });

    const result = await retrieveKnowledge({
      query: "off-topic question",
      tenantId: "t1",
      campaignId: "camp-1",
    });
    expect(result.chunks).toEqual([]);
    expect(result.status === "low_confidence" || result.status === "no_results").toBe(true);
  });
});
```

- [ ] **Step 2: Run tests (expect failure)**

Run: `npx vitest run tests/unit/retriever.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `src/lib/ai/retriever.ts`**

Edit the file as follows:

In the `RetrievalParams` interface, add `campaignId?: string`:

```ts
export interface RetrievalParams {
  query: string;
  tenantId: string;
  campaignId?: string;
  context?: RetrievalContext;
}
```

In the function signature destructure, add `campaignId`:

```ts
export async function retrieveKnowledge(
  params: RetrievalParams
): Promise<RetrievalResult> {
  const { query, tenantId, campaignId, context } = params;
  ...
}
```

Update the `searchTargets` helper signature and pass `campaignId`:

```ts
async function searchTargets(
  queryEmbedding: number[],
  ftsQuery: string,
  tenantId: string,
  target: QueryTarget,
  campaignId?: string
): Promise<ChunkResult[]> {
  if (target === "both") {
    const [general, product] = await Promise.all([
      searchKnowledge({ queryEmbedding, ftsQuery, tenantId, campaignId, kbType: "general", topK: GENERAL_TOP_K }),
      searchKnowledge({ queryEmbedding, ftsQuery, tenantId, campaignId, kbType: "product", topK: PRODUCT_TOP_K }),
    ]);
    return [...general, ...product];
  }

  return searchKnowledge({
    queryEmbedding,
    ftsQuery,
    tenantId,
    campaignId,
    kbType: target,
    topK: target === "general" ? GENERAL_TOP_K : PRODUCT_TOP_K,
  });
}
```

Update the two call sites to pass `campaignId`:

```ts
const pass1Chunks = await searchTargets(queryEmbedding, searchQuery, tenantId, queryTarget, campaignId);
...
const pass2Chunks = await searchTargets(expandedEmbedding, expanded, tenantId, queryTarget, campaignId);
```

Add a low-similarity cutoff. Find the success-return at the end of pass 1:

```ts
if (pass1Reranked.length > 0 && pass1Reranked[0].similarity >= RERANK_CONFIDENCE_THRESHOLD) {
  return { status: "success", chunks: pass1Reranked, queryTarget, retrievalPass: 1 };
}
```

Just below the `RERANK_CONFIDENCE_THRESHOLD = 0.6;` constant declaration, add:

```ts
const SCOPE_LOW_SIMILARITY_CUTOFF = 0.5;
```

Then immediately before the final `return { status: allEmpty ? ... }` in pass 2, add the cutoff:

```ts
// Spec: scope-aware low-similarity cutoff. If we are campaign-scoped and the
// best chunk after both passes is below 0.5, treat as off-topic.
if (campaignId && (pass1Reranked[0]?.similarity ?? 0) < SCOPE_LOW_SIMILARITY_CUTOFF) {
  return { status: "no_results", chunks: [], queryTarget, retrievalPass: 2 };
}
```

- [ ] **Step 4: Run tests (expect pass)**

Run: `npx vitest run tests/unit/retriever.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/retriever.ts tests/unit/retriever.test.ts
git commit -m "feat(ai): plumb campaignId + add scope-aware low-similarity cutoff"
```

---

## Task 9: Phase Machine — Awareness Helpers

**Files:**
- Modify: `src/lib/ai/phase-machine.ts`
- Test: `tests/unit/phase-machine.test.ts` (extend)

We add `getCurrentAwareness` and `updateAwareness`. Existing exports (`getCurrentPhase`, `advancePhase`, `incrementMessageCount`, `exitPhase`) are kept untouched for custom-mode regression.

- [ ] **Step 1: Append failing tests**

Append to `tests/unit/phase-machine.test.ts`:

```ts
describe("getCurrentAwareness", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the conversation's stored awareness when present", async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { current_awareness_level: "PRODUCT_AWARE" },
            error: null,
          }),
        }),
      }),
    });
    const { getCurrentAwareness } = await import("@/lib/ai/phase-machine");
    const result = await getCurrentAwareness("conv-1");
    expect(result).toBe("PRODUCT_AWARE");
  });

  it("returns null when no row found", async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });
    const { getCurrentAwareness } = await import("@/lib/ai/phase-machine");
    const result = await getCurrentAwareness("conv-1");
    expect(result).toBeNull();
  });

  it("returns null for invalid stored value", async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { current_awareness_level: "JUNK" },
            error: null,
          }),
        }),
      }),
    });
    const { getCurrentAwareness } = await import("@/lib/ai/phase-machine");
    const result = await getCurrentAwareness("conv-1");
    expect(result).toBeNull();
  });
});

describe("updateAwareness", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates conversations row with new awareness, intent label, and merges objections", async () => {
    const eqMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { detected_objections: ["money"] },
            error: null,
          }),
        }),
      }),
    });
    mockFrom.mockReturnValueOnce({ update: updateMock });

    const { updateAwareness } = await import("@/lib/ai/phase-machine");
    await updateAwareness("conv-1", {
      awareness: "PRODUCT_AWARE",
      intentLabel: "comparing",
      detectedObjection: "time",
      qualifierJustCompleted: true,
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        current_awareness_level: "PRODUCT_AWARE",
        current_intent_label: "comparing",
        detected_objections: ["money", "time"],
      })
    );
    const updateArg = updateMock.mock.calls[0][0];
    expect(typeof updateArg.qualifier_completed_at).toBe("string");
  });

  it("does not duplicate objections when same value detected twice", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { detected_objections: ["money"] },
            error: null,
          }),
        }),
      }),
    });
    mockFrom.mockReturnValueOnce({ update: updateMock });
    const { updateAwareness } = await import("@/lib/ai/phase-machine");
    await updateAwareness("conv-1", {
      awareness: "PRODUCT_AWARE",
      intentLabel: null,
      detectedObjection: "money",
      qualifierJustCompleted: false,
    });
    const updateArg = updateMock.mock.calls[0][0];
    expect(updateArg.detected_objections).toEqual(["money"]);
    expect(updateArg.qualifier_completed_at).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests (expect failure)**

Run: `npx vitest run tests/unit/phase-machine.test.ts`
Expected: FAIL — exports not found.

- [ ] **Step 3: Append helpers to `src/lib/ai/phase-machine.ts`**

Add at the bottom of `src/lib/ai/phase-machine.ts`:

```ts
import { isAwarenessLevel, type AwarenessLevel } from "@/lib/ai/awareness";

export async function getCurrentAwareness(
  conversationId: string
): Promise<AwarenessLevel | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("current_awareness_level")
    .eq("id", conversationId)
    .single();
  if (error || !data) return null;
  const v = (data as { current_awareness_level: unknown }).current_awareness_level;
  return isAwarenessLevel(v) ? v : null;
}

export interface UpdateAwarenessInput {
  awareness: AwarenessLevel;
  intentLabel: string | null;
  detectedObjection: string | null;
  qualifierJustCompleted: boolean;
}

export async function updateAwareness(
  conversationId: string,
  input: UpdateAwarenessInput
): Promise<void> {
  const supabase = createServiceClient();

  // Read current objections so we can dedup-merge.
  const { data } = await supabase
    .from("conversations")
    .select("detected_objections")
    .eq("id", conversationId)
    .single();

  const existing: string[] =
    Array.isArray((data as { detected_objections?: unknown } | null)?.detected_objections)
      ? ((data as { detected_objections: string[] }).detected_objections)
      : [];

  const merged = input.detectedObjection
    ? Array.from(new Set([...existing, input.detectedObjection]))
    : existing;

  const update: Record<string, unknown> = {
    current_awareness_level: input.awareness,
    current_intent_label: input.intentLabel,
    detected_objections: merged,
  };

  if (input.qualifierJustCompleted) {
    update.qualifier_completed_at = new Date().toISOString();
  }

  await supabase.from("conversations").update(update).eq("id", conversationId);
}
```

- [ ] **Step 4: Run tests (expect pass)**

Run: `npx vitest run tests/unit/phase-machine.test.ts`
Expected: PASS — existing tests + the new awareness tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/phase-machine.ts tests/unit/phase-machine.test.ts
git commit -m "feat(ai): add awareness state helpers to phase-machine"
```

---

## Task 10: Prompt Builder — Awareness Mode Branch

**Files:**
- Modify: `src/lib/ai/prompt-builder.ts`
- Test: `tests/unit/prompt-builder.test.ts` (extend)

We add a new awareness-aware code path while preserving the existing one for `phase_mode='custom'`. The branch is selected via a new `phaseMode` field on `PromptContext`.

- [ ] **Step 1: Append failing tests**

Append to `tests/unit/prompt-builder.test.ts`:

```ts
describe("buildSystemPrompt — awareness mode", () => {
  it("includes Layer D for the prior awareness, offer brief, top objections, and Layer F routing context", async () => {
    // Existing tests in this file already mock createServiceClient / supabase chain.
    // Use the test harness from existing prompt-builder tests; this test just
    // asserts that buildSystemPrompt routes to the awareness branch when
    // phaseMode='awareness_ladder' and includes the expected blocks.
    const { buildSystemPrompt } = await import("@/lib/ai/prompt-builder");

    const prompt = await buildSystemPrompt({
      tenantId: "t1",
      businessName: "Acme",
      conversationId: "conv-1",
      ragChunks: [],
      currentPhase: {
        conversationPhaseId: "cp-1",
        phaseId: "p-1",
        name: "Solution-aware",
        orderIndex: 2,
        maxMessages: 3,
        systemPrompt: "",
        tone: "helpful",
        goals: null,
        transitionHint: null,
        actionButtonIds: null,
        messageCount: 0,
      },
      phaseMode: "awareness_ladder",
      priorAwareness: "SOLUTION_AWARE",
      offerBrief: {
        dream_outcome: "leads booking themselves",
        core_pain: "DMs going cold",
        why_us: "we close in chat",
      },
      topObjections: [
        { objection: "too expensive", counter_frame: "Pays for itself in one booking." },
      ],
      preselectedAction: {
        actionPageId: "ap-1",
        actionTitle: "Book a demo",
        ctaText: "Book your demo",
      },
      campaign: {
        name: "Sell WhatStage",
        description: null,
        goal: "form_submit",
        campaignRules: ["Never offer discounts"],
      },
    });

    // Layer A: identity + offer brief
    expect(prompt).toContain("DMs going cold");
    expect(prompt).toContain("leads booking themselves");
    expect(prompt).toContain("we close in chat");
    // Layer C: top objections counter_frame
    expect(prompt).toContain("Pays for itself in one booking.");
    // Layer D: SOLUTION_AWARE strategy
    expect(prompt).toContain("LEAD STATE: Knows solutions exist");
    expect(prompt).toContain("Book a demo"); // primary action title interpolated
    // Layer F: routing context
    expect(prompt).toContain("the active action button is \"Book a demo\"");
    expect(prompt).toContain("do NOT invent other CTAs");
    // Layer G: structured output schema
    expect(prompt).toContain("\"detected_awareness\"");
    expect(prompt).toContain("\"wants_cta_now\"");
    expect(prompt).toContain("\"qualifier_just_completed\"");
    // Global rules
    expect(prompt).toContain("- Never offer discounts");
  });

  it("defaults priorAwareness to UNAWARE on first turn", async () => {
    const { buildSystemPrompt } = await import("@/lib/ai/prompt-builder");
    const prompt = await buildSystemPrompt({
      tenantId: "t1",
      businessName: "Acme",
      conversationId: "conv-1",
      ragChunks: [],
      currentPhase: {
        conversationPhaseId: "cp-1",
        phaseId: "p-1",
        name: "Unaware",
        orderIndex: 0,
        maxMessages: 3,
        systemPrompt: "",
        tone: "warm",
        goals: null,
        transitionHint: null,
        actionButtonIds: null,
        messageCount: 0,
      },
      phaseMode: "awareness_ladder",
      priorAwareness: null,
      offerBrief: { dream_outcome: "x", core_pain: "y", why_us: "z" },
      topObjections: [],
      preselectedAction: null,
      campaign: { name: "Test", description: null, goal: "form_submit", campaignRules: [] },
    });
    expect(prompt).toContain("LEAD STATE: Doesn't yet know they have a problem");
  });

  it("custom mode regression — does not include awareness Layer D markers", async () => {
    const { buildSystemPrompt } = await import("@/lib/ai/prompt-builder");
    const prompt = await buildSystemPrompt({
      tenantId: "t1",
      businessName: "Acme",
      conversationId: "conv-1",
      ragChunks: [],
      currentPhase: {
        conversationPhaseId: "cp-1",
        phaseId: "p-1",
        name: "Greet",
        orderIndex: 0,
        maxMessages: 1,
        systemPrompt: "Welcome the lead.",
        tone: "friendly",
        goals: "open",
        transitionHint: null,
        actionButtonIds: null,
        messageCount: 0,
      },
      phaseMode: "custom",
      campaign: { name: "Old", description: "desc", goal: "form_submit", campaignRules: [] },
    });
    expect(prompt).not.toContain("LEAD STATE:");
    expect(prompt).not.toContain("\"detected_awareness\"");
    // Legacy phase block must still be present
    expect(prompt).toContain("Welcome the lead.");
  });
});
```

> **Note:** the existing test file already mocks the Supabase service client; the new tests use the same mocks. If you find the existing mocks return data in a way that prevents the awareness branch from being entered, ensure the persona mock returns valid values (existing tests in this file demonstrate the pattern).

- [ ] **Step 2: Run tests (expect failure)**

Run: `npx vitest run tests/unit/prompt-builder.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `src/lib/ai/prompt-builder.ts`**

At the top, add imports:

```ts
import {
  renderPhaseStrategy,
  renderGlobalRules,
  type OfferBrief,
  type TopObjection,
} from "@/lib/ai/awareness-templates";
import type { AwarenessLevel } from "@/lib/ai/awareness";
```

Extend `PromptContext`:

```ts
export interface PromptContext {
  tenantId: string;
  businessName: string;
  currentPhase: CurrentPhase;
  conversationId: string;
  ragChunks: ChunkResult[];
  images?: KnowledgeImage[];
  testMode?: boolean;
  historyOverride?: { role: "user" | "bot"; text: string }[];
  campaign?: CampaignContext;
  leadId?: string;

  // Awareness-mode fields
  phaseMode?: "awareness_ladder" | "custom";
  priorAwareness?: AwarenessLevel | null;
  offerBrief?: OfferBrief;
  topObjections?: TopObjection[];
  preselectedAction?: {
    actionPageId: string;
    actionTitle: string;
    ctaText: string;
  } | null;
}
```

Add new layer builders above `export async function buildSystemPrompt`:

```ts
// =====================================================================
// Awareness-mode layers
// =====================================================================

function buildOfferBriefLayer(
  businessName: string,
  offer: OfferBrief | undefined
): string {
  if (!offer) return "";
  return [
    "--- OFFER BRIEF ---",
    `You work at ${businessName}.`,
    `Dream outcome we deliver: ${offer.dream_outcome}`,
    `Core pain we solve: ${offer.core_pain}`,
    `Why us: ${offer.why_us}`,
  ].join("\n");
}

function buildTopObjectionsLayer(objections: TopObjection[] | undefined): string {
  if (!objections || objections.length === 0) return "";
  const lines = ["--- TOP OBJECTIONS ---"];
  for (const o of objections) {
    lines.push(`- "${o.objection}" → counter VERBATIM: ${o.counter_frame}`);
  }
  return lines.join("\n");
}

function buildLayerD(
  priorAwareness: AwarenessLevel | null | undefined,
  offer: OfferBrief | undefined,
  primaryActionTitle: string
): string {
  if (!offer) return "";
  const level = priorAwareness ?? "UNAWARE";
  return [
    "--- PHASE STRATEGY (current awareness rung) ---",
    renderPhaseStrategy(level, { offer, primaryActionTitle }),
  ].join("\n");
}

function buildRoutingContextLayer(
  preselectedAction: PromptContext["preselectedAction"]
): string {
  if (!preselectedAction) {
    return [
      "--- ROUTING CONTEXT ---",
      "There is no active action button to surface this turn.",
      "Do NOT invent CTAs, links, or buttons.",
    ].join("\n");
  }
  return [
    "--- ROUTING CONTEXT ---",
    `the active action button is "${preselectedAction.actionTitle}".`,
    "If timing is natural, surface it indirectly (\"if you're ready, the button below…\").",
    "Do NOT name a different action page; do NOT invent other CTAs.",
  ].join("\n");
}

function buildAwarenessOutputSchema(): string {
  return `--- RESPONSE FORMAT ---
You MUST respond with a single JSON object and nothing else. No prose before or after.

{
  "reply": "Your message to the lead, plain text, 1–3 sentences.",
  "detected_awareness": "UNAWARE|PROBLEM_AWARE|SOLUTION_AWARE|PRODUCT_AWARE|MOST_AWARE",
  "intent_label": "short label like 'comparing solutions' or 'stuck on price'",
  "detected_objection": "money|time|fit|trust|null",
  "wants_cta_now": true | false,
  "qualifier_just_completed": true | false,
  "confidence": 0.0
}

- "detected_awareness": where the lead currently is on the ladder, based on this message.
- "intent_label": one short phrase summarizing what they want right now.
- "detected_objection": match against TOP OBJECTIONS if any, else null.
- "wants_cta_now": true ONLY if their language signals readiness to take a next step.
- "qualifier_just_completed": true ONLY if they explicitly said they finished the qualifier in this turn.
- "confidence": your overall confidence in the reply, 0.0–1.0.`;
}
```

Replace the bottom of `buildSystemPrompt` (the section starting from `// Fetch action button info if phase has action buttons`) so the function branches by `phaseMode`. Find the existing assembly:

```ts
return [layer1, layer2, campaignRulesLayer, layer3, layer4, layer5, layer6, layer7, layer8, leadLayer, layer9, actionButtonsLayer, layer10]
  .filter((l) => l.length > 0)
  .join("\n\n");
```

Replace with:

```ts
// Branch: awareness_ladder vs custom
if (ctx.phaseMode === "awareness_ladder") {
  const primaryTitle = ctx.preselectedAction?.actionTitle ?? "the next step";
  const offerLayer = buildOfferBriefLayer(ctx.businessName, ctx.offerBrief);
  const objectionsLayer = buildTopObjectionsLayer(ctx.topObjections);
  const layerD = buildLayerD(ctx.priorAwareness ?? null, ctx.offerBrief, primaryTitle);
  const layerF = buildRoutingContextLayer(ctx.preselectedAction ?? null);
  const layerG = buildAwarenessOutputSchema();
  const globalRules = renderGlobalRules({
    campaignRules: ctx.campaign?.campaignRules ?? [],
    objections: ctx.topObjections ?? [],
  });

  return [
    layer1,                  // identity
    offerLayer,              // A: offer brief
    globalRules,             // B: campaign_rules + cross-rung guardrails
    objectionsLayer,         // C: top objections
    layerD,                  // D: phase strategy
    layer7,                  // (history) — reuse existing builder output
    layer8,                  // E: scoped RAG
    leadLayer,
    layer9,                  // available images (kept; non-breaking)
    layerF,                  // F: routing context
    layerG,                  // G: output schema
  ]
    .filter((l) => l.length > 0)
    .join("\n\n");
}

// Custom-mode legacy assembly (unchanged from before this refactor).
return [layer1, layer2, campaignRulesLayer, layer3, layer4, layer5, layer6, layer7, layer8, leadLayer, layer9, actionButtonsLayer, layer10]
  .filter((l) => l.length > 0)
  .join("\n\n");
```

- [ ] **Step 4: Run tests (expect pass)**

Run: `npx vitest run tests/unit/prompt-builder.test.ts`
Expected: PASS — including the regression assertion that custom-mode prompts still contain the legacy phase prompt.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/prompt-builder.ts tests/unit/prompt-builder.test.ts
git commit -m "feat(ai): branch prompt builder on phase_mode for awareness ladder"
```

---

## Task 11: Conversation Engine — Awareness Pipeline

**Files:**
- Modify: `src/lib/ai/conversation-engine.ts`

The engine now branches on `campaign.phase_mode`. Custom mode runs the existing path verbatim. Awareness mode runs:

1. Load campaign + offer_brief + top_objections + funnel_type + primary/qualifier action page (incl. titles + cta_text).
2. Load `priorAwareness`, `qualifierCompletedAt` from `conversations`.
3. Compute `preselectedAction` via `pickActionPage` using `priorAwareness` and `wantsCtaNow=true` (we pre-render assuming intent; the LLM signals readiness via wants_cta_now). Actually: the spec § 3F says use prior awareness to build prompt; the router runs again after step 5. So we pass the **prior-awareness preselection** to Layer F.
4. Retrieve scoped knowledge.
5. Build prompt (awareness mode).
6. Call LLM, parse new structured output.
7. Run `pickActionPage` again with the **new** awareness + `wantsCtaNow` from the LLM.
8. `updateAwareness` with new state.
9. Return `EngineOutput` (legacy shape preserved).

- [ ] **Step 1: Replace `src/lib/ai/conversation-engine.ts`**

Replace the file with:

```ts
import {
  getCurrentPhase,
  advancePhase,
  incrementMessageCount,
  getCurrentAwareness,
  updateAwareness,
} from "@/lib/ai/phase-machine";
import { getOrAssignCampaign } from "@/lib/ai/campaign-assignment";
import { retrieveKnowledge } from "@/lib/ai/retriever";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import type { CampaignContext, KnowledgeImage } from "@/lib/ai/prompt-builder";
import { generateResponse } from "@/lib/ai/llm-client";
import { parseDecision } from "@/lib/ai/decision-parser";
import { selectImages } from "@/lib/ai/image-selector";
import { parseResponse } from "@/lib/ai/response-parser";
import { createServiceClient } from "@/lib/supabase/service";
import { extractKnowledge } from "@/lib/leads/knowledge-extractor";
import { generateLeadSummary } from "@/lib/leads/summary-generator";
import { pickActionPage } from "@/lib/campaigns/router";
import type { OfferBrief, TopObjection } from "@/lib/ai/awareness-templates";
import type { AwarenessLevel } from "@/lib/ai/awareness";

export interface EngineInput {
  tenantId: string;
  leadId: string;
  businessName: string;
  conversationId: string;
  leadMessage: string;
  leadMessageId?: string;
}

export interface EngineOutput {
  message: string;
  phaseAction: "stay" | "advance" | "escalate";
  confidence: number;
  imageIds: string[];
  currentPhase: string;
  escalated: boolean;
  paused: boolean;
  actionButton?: {
    actionPageId: string;
    ctaText: string;
  };
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

interface AwarenessCampaignRow {
  id: string;
  name: string;
  description: string | null;
  goal: string;
  campaign_rules: string[] | null;
  phase_mode: "awareness_ladder" | "custom";
  funnel_type: "direct" | "qualify_first";
  primary_action_page_id: string | null;
  qualifier_action_page_id: string | null;
  offer_brief: OfferBrief | null;
  top_objections: TopObjection[] | null;
}

interface ActionPageRow {
  id: string;
  title: string;
  cta_text: string | null;
}

export async function handleMessage(input: EngineInput): Promise<EngineOutput> {
  const { tenantId, leadId, businessName, conversationId, leadMessage, leadMessageId } = input;
  const supabase = createServiceClient();

  // Gate check: bot pause / handoff.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("bot_paused_at, qualifier_completed_at")
    .eq("id", conversationId)
    .single();

  if ((conversation as { bot_paused_at?: string | null } | null)?.bot_paused_at) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("handoff_timeout_hours")
      .eq("id", tenantId)
      .single();
    const timeoutHours = (tenant as { handoff_timeout_hours: number | null } | null)?.handoff_timeout_hours ?? null;
    if (timeoutHours === null) {
      return emptyPaused();
    }
    const pausedAt = new Date(((conversation as { bot_paused_at: string }).bot_paused_at)).getTime();
    const elapsed = Date.now() - pausedAt;
    const timeoutMs = timeoutHours * 60 * 60 * 1000;
    if (elapsed <= timeoutMs) {
      return emptyPaused();
    }
    await supabase
      .from("conversations")
      .update({
        bot_paused_at: null,
        needs_human: false,
        escalation_reason: null,
        escalation_message_id: null,
      })
      .eq("id", conversationId);
    await supabase.from("escalation_events").insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      type: "bot_resumed",
      reason: "timeout",
    });
  }

  // Step 0: Campaign assignment + load full row.
  const campaignId = await getOrAssignCampaign(leadId, tenantId);
  const { data: campaignDataRaw } = await supabase
    .from("campaigns")
    .select(
      "id, name, description, goal, campaign_rules, phase_mode, funnel_type, primary_action_page_id, qualifier_action_page_id, offer_brief, top_objections"
    )
    .eq("id", campaignId)
    .single();
  const campaignData = campaignDataRaw as AwarenessCampaignRow | null;

  const phaseMode: "awareness_ladder" | "custom" =
    campaignData?.phase_mode ?? "custom";

  if (phaseMode === "awareness_ladder") {
    return handleAwarenessTurn({
      tenantId,
      leadId,
      businessName,
      conversationId,
      leadMessage,
      leadMessageId,
      campaignId,
      campaign: campaignData!,
      qualifierCompletedAt:
        (conversation as { qualifier_completed_at?: string | null } | null)?.qualifier_completed_at
          ? new Date((conversation as { qualifier_completed_at: string }).qualifier_completed_at)
          : null,
    });
  }

  return handleCustomTurn({
    tenantId,
    leadId,
    businessName,
    conversationId,
    leadMessage,
    leadMessageId,
    campaignId,
    campaign: campaignData,
  });
}

function emptyPaused(): EngineOutput {
  return {
    message: "",
    phaseAction: "stay",
    confidence: 0,
    imageIds: [],
    currentPhase: "",
    escalated: false,
    paused: true,
  };
}

// =====================================================================
// Awareness mode
// =====================================================================

interface AwarenessTurnArgs {
  tenantId: string;
  leadId: string;
  businessName: string;
  conversationId: string;
  leadMessage: string;
  leadMessageId?: string;
  campaignId: string;
  campaign: AwarenessCampaignRow;
  qualifierCompletedAt: Date | null;
}

async function handleAwarenessTurn(args: AwarenessTurnArgs): Promise<EngineOutput> {
  const supabase = createServiceClient();
  const {
    tenantId, leadId, businessName, conversationId,
    leadMessage, leadMessageId, campaignId, campaign, qualifierCompletedAt,
  } = args;

  // Load awareness phase row + action pages.
  const priorAwareness = await getCurrentAwareness(conversationId);

  const currentPhase = await getCurrentPhase(conversationId, campaignId);

  // Load primary + qualifier action page metadata.
  const actionPageIds = [campaign.primary_action_page_id, campaign.qualifier_action_page_id]
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const { data: actionPagesRaw } = actionPageIds.length > 0
    ? await supabase
        .from("action_pages")
        .select("id, title, cta_text")
        .in("id", actionPageIds)
    : { data: [] as ActionPageRow[] };
  const actionPages = (actionPagesRaw ?? []) as ActionPageRow[];
  const primaryPage = actionPages.find((p) => p.id === campaign.primary_action_page_id) ?? null;
  const qualifierPage = actionPages.find((p) => p.id === campaign.qualifier_action_page_id) ?? null;

  // Pre-route based on PRIOR awareness for Layer F.
  // Use wantsCtaNow=true here so the prompt sees the page that WOULD be surfaced
  // if the lead is ready; final routing happens again after the LLM call.
  // Look up surface_cta on the matching campaign_phases row.
  const { data: phaseRowRaw } = await supabase
    .from("campaign_phases")
    .select("surface_cta")
    .eq("campaign_id", campaignId)
    .eq("awareness_level", priorAwareness ?? "UNAWARE")
    .maybeSingle();
  const phaseSurfaceCta = ((phaseRowRaw as { surface_cta?: boolean } | null)?.surface_cta) ?? true;

  const preRoute = primaryPage
    ? pickActionPage({
        awareness: priorAwareness ?? "UNAWARE",
        funnelType: campaign.funnel_type,
        qualifierCompletedAt,
        wantsCtaNow: true,
        surfaceCta: phaseSurfaceCta,
        primaryActionPageId: primaryPage.id,
        qualifierActionPageId: qualifierPage?.id ?? null,
        primaryCtaText: primaryPage.cta_text ?? "",
        qualifierCtaText: qualifierPage?.cta_text ?? "",
      })
    : { actionPageId: null, ctaText: "" };

  const preselectedAction = preRoute.actionPageId
    ? {
        actionPageId: preRoute.actionPageId,
        actionTitle:
          actionPages.find((p) => p.id === preRoute.actionPageId)?.title ?? "the next step",
        ctaText: preRoute.ctaText,
      }
    : null;

  // Scoped retrieval.
  const retrieval = await retrieveKnowledge({
    query: leadMessage,
    tenantId,
    campaignId,
    context: {
      businessName,
      currentPhaseName: currentPhase.name,
      campaign: {
        name: campaign.name,
        description: campaign.description,
        goal: campaign.goal,
      },
    },
  });

  const campaignContext: CampaignContext = {
    name: campaign.name,
    description: campaign.description,
    goal: campaign.goal,
    campaignRules: (campaign.campaign_rules ?? []) as string[],
  };

  const systemPrompt = await buildSystemPrompt({
    tenantId,
    businessName,
    currentPhase,
    conversationId,
    ragChunks: retrieval.chunks,
    campaign: campaignContext,
    leadId,
    phaseMode: "awareness_ladder",
    priorAwareness,
    offerBrief: campaign.offer_brief ?? undefined,
    topObjections: campaign.top_objections ?? [],
    preselectedAction,
  });

  const llmResponse = await generateResponse(systemPrompt, leadMessage);
  const decision = parseDecision(llmResponse.content);

  // Final routing using NEW awareness from LLM.
  const newAwareness: AwarenessLevel = decision.detectedAwareness ?? priorAwareness ?? "UNAWARE";

  const { data: newPhaseRowRaw } = await supabase
    .from("campaign_phases")
    .select("surface_cta")
    .eq("campaign_id", campaignId)
    .eq("awareness_level", newAwareness)
    .maybeSingle();
  const newSurfaceCta = ((newPhaseRowRaw as { surface_cta?: boolean } | null)?.surface_cta) ?? true;

  const finalRoute = primaryPage
    ? pickActionPage({
        awareness: newAwareness,
        funnelType: campaign.funnel_type,
        qualifierCompletedAt: decision.qualifierJustCompleted
          ? new Date()
          : qualifierCompletedAt,
        wantsCtaNow: decision.wantsCtaNow,
        surfaceCta: newSurfaceCta,
        primaryActionPageId: primaryPage.id,
        qualifierActionPageId: qualifierPage?.id ?? null,
        primaryCtaText: primaryPage.cta_text ?? "",
        qualifierCtaText: qualifierPage?.cta_text ?? "",
      })
    : { actionPageId: null, ctaText: "" };

  let actionButton: { actionPageId: string; ctaText: string } | undefined;
  if (finalRoute.actionPageId) {
    actionButton = {
      actionPageId: finalRoute.actionPageId,
      ctaText: finalRoute.ctaText || "",
    };
  }

  // Persist awareness state.
  await updateAwareness(conversationId, {
    awareness: newAwareness,
    intentLabel: decision.intentLabel,
    detectedObjection: decision.detectedObjection,
    qualifierJustCompleted: decision.qualifierJustCompleted,
  });

  await incrementMessageCount(currentPhase.conversationPhaseId);

  // Strip any leaked tokens from message.
  const parsed = parseResponse(decision.message);

  // Lead knowledge + summary side effects (best-effort).
  extractKnowledge({
    tenantId, leadId, messageText: leadMessage,
    messageId: leadMessageId ?? null,
  }).catch(() => {});
  const { data: lastMsg } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .neq("id", leadMessageId ?? "")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastMsg && (lastMsg as { created_at?: string }).created_at) {
    const gap = Date.now() - new Date((lastMsg as { created_at: string }).created_at).getTime();
    if (gap >= 10 * 60 * 1000) {
      generateLeadSummary({ tenantId, leadId, conversationId }).catch(() => {});
    }
  }

  const finalMessage = applyHedging(parsed.cleanMessage, decision.confidence);

  return {
    message: finalMessage,
    phaseAction: decision.phaseAction,
    confidence: decision.confidence,
    imageIds: [],
    currentPhase: currentPhase.name,
    escalated: decision.phaseAction === "escalate",
    paused: false,
    actionButton,
  };
}

// =====================================================================
// Custom mode (legacy path — unchanged from pre-redesign)
// =====================================================================

interface CustomTurnArgs {
  tenantId: string;
  leadId: string;
  businessName: string;
  conversationId: string;
  leadMessage: string;
  leadMessageId?: string;
  campaignId: string;
  campaign: AwarenessCampaignRow | null;
}

async function handleCustomTurn(args: CustomTurnArgs): Promise<EngineOutput> {
  const supabase = createServiceClient();
  const {
    tenantId, leadId, businessName, conversationId,
    leadMessage, leadMessageId, campaignId, campaign,
  } = args;

  const currentPhase = await getCurrentPhase(conversationId, campaignId);

  const campaignContext: CampaignContext | undefined = campaign
    ? {
        name: campaign.name,
        description: campaign.description,
        goal: campaign.goal,
        campaignRules: (campaign.campaign_rules ?? []) as string[],
      }
    : undefined;

  const retrieval = await retrieveKnowledge({
    query: leadMessage,
    tenantId,
    context: {
      businessName,
      currentPhaseName: currentPhase.name,
      campaign: campaignContext,
    },
  });

  const { data: tenantConfig } = await supabase
    .from("tenants")
    .select("max_images_per_response")
    .eq("id", tenantId)
    .single();
  const maxImages = (tenantConfig as { max_images_per_response: number } | null)?.max_images_per_response ?? 2;

  const selectedImages = await selectImages({
    tenantId,
    leadMessage,
    currentPhaseName: currentPhase.name,
    retrievedChunks: retrieval.chunks,
    maxImages,
  });
  const promptImages: KnowledgeImage[] = selectedImages.map((img) => ({
    id: img.id,
    url: img.url,
    description: img.description,
    context_hint: img.contextHint,
  }));

  const systemPrompt = await buildSystemPrompt({
    tenantId,
    businessName,
    currentPhase,
    conversationId,
    ragChunks: retrieval.chunks,
    images: promptImages.length > 0 ? promptImages : undefined,
    campaign: campaignContext,
    leadId,
    phaseMode: "custom",
  });

  const llmResponse = await generateResponse(systemPrompt, leadMessage);
  const decision = parseDecision(llmResponse.content);

  let actionButton: { actionPageId: string; ctaText: string } | undefined;
  if (decision.actionButtonId) {
    const isValid =
      currentPhase.actionButtonIds !== null &&
      currentPhase.actionButtonIds.includes(decision.actionButtonId);
    if (isValid) {
      actionButton = {
        actionPageId: decision.actionButtonId,
        ctaText: decision.ctaText ?? "",
      };
    }
  }

  const parsed = parseResponse(decision.message);
  const mergedImageIds = [...new Set([...decision.imageIds])];

  let validatedImageIds: string[] = [];
  if (mergedImageIds.length > 0) {
    const { data: validImages } = await supabase
      .from("knowledge_images")
      .select("id, url")
      .eq("tenant_id", tenantId)
      .in("id", mergedImageIds);
    if (validImages) {
      const validIdSet = new Set((validImages as { id: string }[]).map((img) => img.id));
      validatedImageIds = mergedImageIds.filter((id) => validIdSet.has(id));
    }
  }

  let escalated = false;
  if (decision.phaseAction === "advance") {
    await advancePhase(conversationId, campaignId);
  } else if (decision.phaseAction === "escalate") {
    escalated = true;
    const escalationReason =
      parsed.cleanMessage.trim() === ""
        ? "empty_response"
        : decision.confidence < 0.4
          ? "low_confidence"
          : "llm_decision";
    await supabase
      .from("conversations")
      .update({
        needs_human: true,
        escalation_reason: escalationReason,
        escalation_message_id: leadMessageId ?? null,
      })
      .eq("id", conversationId);
    await supabase.from("escalation_events").insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      type: "escalated",
      reason: escalationReason,
    });
  }

  await incrementMessageCount(currentPhase.conversationPhaseId);

  extractKnowledge({
    tenantId, leadId, messageText: leadMessage,
    messageId: leadMessageId ?? null,
  }).catch(() => {});

  const { data: lastMsg } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .neq("id", leadMessageId ?? "")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastMsg && (lastMsg as { created_at?: string }).created_at) {
    const gap = Date.now() - new Date((lastMsg as { created_at: string }).created_at).getTime();
    if (gap >= 10 * 60 * 1000) {
      generateLeadSummary({ tenantId, leadId, conversationId }).catch(() => {});
    }
  }

  const finalMessage = applyHedging(parsed.cleanMessage, decision.confidence);

  return {
    message: finalMessage,
    phaseAction: decision.phaseAction,
    confidence: decision.confidence,
    imageIds: validatedImageIds,
    currentPhase: currentPhase.name,
    escalated,
    paused: false,
    actionButton,
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS. Fix any type errors before continuing.

- [ ] **Step 3: Run existing engine tests (regression)**

Run: `npx vitest run tests/integration/conversation-engine.test.ts tests/unit/conversation-engine.test.ts tests/unit/conversation-engine-images.test.ts tests/unit/conversation-engine-handoff.test.ts`
Expected: PASS. Existing tests use `phase_mode` defaulting via the `getOrAssignCampaign` mock (which returns a string id and the supabase mocks return a campaign row). If a test now fails because the mocked campaign select returns a row missing `phase_mode`, update the mocked row to include `phase_mode: "custom"` so it routes to the legacy path. **Do not** change behavior — only mock data.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/conversation-engine.ts tests/integration/conversation-engine.test.ts tests/unit/conversation-engine*.test.ts
git commit -m "feat(ai): branch conversation engine on phase_mode; awareness pipeline"
```

---

## Task 12: Convert-to-Ladder Service

**Files:**
- Create: `src/lib/campaigns/convert-to-ladder.ts`
- Test: `tests/unit/convert-to-ladder.test.ts`

The service:
1. Loads the campaign.
2. Validates `offer_brief` and `top_objections` are filled.
3. Deletes existing `campaign_phases` rows.
4. Inserts the 5 awareness rows.
5. Sets `phase_mode='awareness_ladder'` on the campaign.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/convert-to-ladder.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

import { convertCampaignToLadder } from "@/lib/campaigns/convert-to-ladder";

beforeEach(() => vi.clearAllMocks());

describe("convertCampaignToLadder", () => {
  it("rejects when offer_brief is missing", async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "c1",
              tenant_id: "t1",
              offer_brief: null,
              top_objections: [],
            },
            error: null,
          }),
        }),
      }),
    });
    await expect(convertCampaignToLadder("c1", "t1")).rejects.toThrow(/offer_brief/i);
  });

  it("rejects when top_objections has fewer than 1 entry", async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "c1",
              tenant_id: "t1",
              offer_brief: { dream_outcome: "x", core_pain: "y", why_us: "z" },
              top_objections: [],
            },
            error: null,
          }),
        }),
      }),
    });
    await expect(convertCampaignToLadder("c1", "t1")).rejects.toThrow(/objection/i);
  });

  it("deletes existing phases, inserts 5 awareness rows, and sets phase_mode", async () => {
    // 1. SELECT campaigns
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "c1",
              tenant_id: "t1",
              offer_brief: { dream_outcome: "x", core_pain: "y", why_us: "z" },
              top_objections: [{ objection: "money", counter_frame: "..." }],
            },
            error: null,
          }),
        }),
      }),
    });

    // 2. DELETE campaign_phases
    const deleteEqMock = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValueOnce({ delete: vi.fn().mockReturnValue({ eq: deleteEqMock }) });

    // 3. INSERT campaign_phases (5 rows)
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValueOnce({ insert: insertMock });

    // 4. UPDATE campaigns.phase_mode
    const updateEqMock = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValueOnce({ update: vi.fn().mockReturnValue({ eq: updateEqMock }) });

    await convertCampaignToLadder("c1", "t1");

    expect(deleteEqMock).toHaveBeenCalledWith("campaign_id", "c1");
    expect(insertMock).toHaveBeenCalledTimes(1);
    const inserted = insertMock.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(5);
    expect(inserted.map((r) => r.awareness_level)).toEqual([
      "UNAWARE",
      "PROBLEM_AWARE",
      "SOLUTION_AWARE",
      "PRODUCT_AWARE",
      "MOST_AWARE",
    ]);
    expect(inserted.map((r) => r.surface_cta)).toEqual([false, false, true, true, true]);
    expect(inserted.map((r) => r.order_index)).toEqual([1, 2, 3, 4, 5]);
    expect(updateEqMock).toHaveBeenCalledWith("id", "c1");
  });

  it("rejects when campaign tenant_id does not match", async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "c1", tenant_id: "OTHER", offer_brief: {}, top_objections: [] },
            error: null,
          }),
        }),
      }),
    });
    await expect(convertCampaignToLadder("c1", "t1")).rejects.toThrow(/not found|forbid/i);
  });
});
```

- [ ] **Step 2: Run test (expect failure)**

Run: `npx vitest run tests/unit/convert-to-ladder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `src/lib/campaigns/convert-to-ladder.ts`:

```ts
import { createServiceClient } from "@/lib/supabase/service";
import {
  AWARENESS_LEVELS,
  AWARENESS_DISPLAY_NAMES,
  DEFAULT_SURFACE_CTA,
} from "@/lib/ai/awareness";

export async function convertCampaignToLadder(
  campaignId: string,
  tenantId: string
): Promise<void> {
  const supabase = createServiceClient();

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("id, tenant_id, offer_brief, top_objections")
    .eq("id", campaignId)
    .single();

  if (error || !campaign) {
    throw new Error("Campaign not found");
  }

  const row = campaign as {
    id: string;
    tenant_id: string;
    offer_brief: unknown;
    top_objections: unknown;
  };

  if (row.tenant_id !== tenantId) {
    throw new Error("Campaign not found (forbidden)");
  }

  if (!row.offer_brief || typeof row.offer_brief !== "object") {
    throw new Error("Cannot convert: offer_brief is required");
  }
  const ob = row.offer_brief as Record<string, unknown>;
  if (
    typeof ob.dream_outcome !== "string" ||
    typeof ob.core_pain !== "string" ||
    typeof ob.why_us !== "string"
  ) {
    throw new Error("Cannot convert: offer_brief must have dream_outcome, core_pain, why_us");
  }

  const objections = Array.isArray(row.top_objections) ? row.top_objections : [];
  if (objections.length < 1) {
    throw new Error("Cannot convert: at least one objection is required");
  }

  // Delete existing phases.
  await supabase.from("campaign_phases").delete().eq("campaign_id", campaignId);

  // Insert 5 awareness phase rows.
  const rows = AWARENESS_LEVELS.map((level, i) => ({
    campaign_id: campaignId,
    tenant_id: tenantId,
    name: AWARENESS_DISPLAY_NAMES[level],
    order_index: i + 1,
    awareness_level: level,
    surface_cta: DEFAULT_SURFACE_CTA[level],
    max_messages: 3,
    system_prompt: "",
    tone: "",
    goals: null,
    transition_hint: null,
    action_button_ids: [],
  }));
  await supabase.from("campaign_phases").insert(rows);

  // Mark phase_mode.
  await supabase
    .from("campaigns")
    .update({ phase_mode: "awareness_ladder" })
    .eq("id", campaignId);
}
```

- [ ] **Step 4: Run test (expect pass)**

Run: `npx vitest run tests/unit/convert-to-ladder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/convert-to-ladder.ts tests/unit/convert-to-ladder.test.ts
git commit -m "feat(campaigns): add convertCampaignToLadder service"
```

---

## Task 13: Convert-to-Ladder API Endpoint

**Files:**
- Create: `src/app/api/campaigns/[id]/convert-to-ladder/route.ts`
- Test: `tests/unit/campaigns-convert-to-ladder-api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/campaigns-convert-to-ladder-api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({ resolveSession: vi.fn() }));

const mockConvert = vi.fn();
vi.mock("@/lib/campaigns/convert-to-ladder", () => ({
  convertCampaignToLadder: mockConvert,
}));

import { resolveSession } from "@/lib/auth/session";
const mockResolveSession = vi.mocked(resolveSession);

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/campaigns/[id]/convert-to-ladder", () => {
  it("returns 401 when unauthenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const { POST } = await import("@/app/api/campaigns/[id]/convert-to-ladder/route");
    const res = await POST(new Request("http://x"), ctx("c1"));
    expect(res.status).toBe(401);
  });

  it("calls convertCampaignToLadder on success", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u", tenantId: "t1" });
    mockConvert.mockResolvedValueOnce(undefined);
    const { POST } = await import("@/app/api/campaigns/[id]/convert-to-ladder/route");
    const res = await POST(new Request("http://x"), ctx("c1"));
    expect(mockConvert).toHaveBeenCalledWith("c1", "t1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 400 when validation fails", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u", tenantId: "t1" });
    mockConvert.mockRejectedValueOnce(new Error("Cannot convert: offer_brief is required"));
    const { POST } = await import("@/app/api/campaigns/[id]/convert-to-ladder/route");
    const res = await POST(new Request("http://x"), ctx("c1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/offer_brief/);
  });

  it("returns 404 when campaign not found", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u", tenantId: "t1" });
    mockConvert.mockRejectedValueOnce(new Error("Campaign not found"));
    const { POST } = await import("@/app/api/campaigns/[id]/convert-to-ladder/route");
    const res = await POST(new Request("http://x"), ctx("c1"));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test (expect failure)**

Run: `npx vitest run tests/unit/campaigns-convert-to-ladder-api.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the route**

Create `src/app/api/campaigns/[id]/convert-to-ladder/route.ts`:

```ts
import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { convertCampaignToLadder } from "@/lib/campaigns/convert-to-ladder";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;

  try {
    await convertCampaignToLadder(id, session.tenantId);
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Conversion failed";
    if (/not found|forbidden/i.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
```

- [ ] **Step 4: Run test (expect pass)**

Run: `npx vitest run tests/unit/campaigns-convert-to-ladder-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/[id]/convert-to-ladder/route.ts tests/unit/campaigns-convert-to-ladder-api.test.ts
git commit -m "feat(api): POST /api/campaigns/[id]/convert-to-ladder"
```

---

## Task 14: Campaigns POST/PATCH Schema + Auto-Seed Awareness Phases

**Files:**
- Modify: `src/app/api/campaigns/route.ts`
- Modify: `src/app/api/campaigns/[id]/route.ts`
- Test: `tests/unit/campaigns-api.test.ts` (extend)

- [ ] **Step 1: Append failing tests**

Append to `tests/unit/campaigns-api.test.ts`:

```ts
describe("POST /api/campaigns — awareness fields & auto-seed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("accepts new fields and inserts 5 awareness phase rows when phase_mode defaults", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u", tenantId: "t1" });

    const insertedCampaign = {
      id: "c-new",
      name: "Sell WhatStage",
      tenant_id: "t1",
      phase_mode: "awareness_ladder",
    };
    const phaseInsertMock = vi.fn().mockResolvedValue({ data: null, error: null });

    // Sequence:
    // 1. INSERT campaigns -> select -> single
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: insertedCampaign, error: null }),
        }),
      }),
    });
    // 2. INSERT campaign_phases (5 rows)
    mockFrom.mockReturnValueOnce({ insert: phaseInsertMock });

    const { POST } = await import("@/app/api/campaigns/route");
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({
        name: "Sell WhatStage",
        goal: "form_submit",
        optimization_goal: "SELL",
        funnel_type: "direct",
        primary_action_page_id: "ap-1",
        offer_brief: {
          dream_outcome: "Leads booking themselves",
          core_pain: "DMs go cold",
          why_us: "We close in chat",
        },
        top_objections: [
          { objection: "too expensive", counter_frame: "Pays for itself in one booking." },
        ],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(phaseInsertMock).toHaveBeenCalledTimes(1);
    const phaseRows = phaseInsertMock.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(phaseRows).toHaveLength(5);
    expect(phaseRows.map((r) => r.awareness_level)).toEqual([
      "UNAWARE", "PROBLEM_AWARE", "SOLUTION_AWARE", "PRODUCT_AWARE", "MOST_AWARE",
    ]);
  });

  it("rejects funnel_type=qualify_first without qualifier_action_page_id", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u", tenantId: "t1" });
    const { POST } = await import("@/app/api/campaigns/route");
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({
        name: "x",
        goal: "form_submit",
        funnel_type: "qualify_first",
        primary_action_page_id: "ap-1",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/campaigns/[id] — new fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("accepts updates to offer_brief and top_objections", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u", tenantId: "t1" });
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "c1", offer_brief: { dream_outcome: "x", core_pain: "y", why_us: "z" } },
              error: null,
            }),
          }),
        }),
      }),
    });
    mockFrom.mockReturnValueOnce({ update: updateMock });

    const { PATCH } = await import("@/app/api/campaigns/[id]/route");
    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({
          offer_brief: { dream_outcome: "x", core_pain: "y", why_us: "z" },
          top_objections: [{ objection: "money", counter_frame: "ok" }],
        }),
      }),
      { params: Promise.resolve({ id: "c1" }) }
    );
    expect(res.status).toBe(200);
    const arg = updateMock.mock.calls[0][0];
    expect(arg.offer_brief).toBeDefined();
    expect(arg.top_objections).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests (expect failure)**

Run: `npx vitest run tests/unit/campaigns-api.test.ts`
Expected: FAIL — schema rejects unknown fields, no auto-seed yet.

- [ ] **Step 3: Update `src/app/api/campaigns/route.ts`**

Replace the file with:

```ts
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { z } from "zod";
import {
  AWARENESS_LEVELS,
  AWARENESS_DISPLAY_NAMES,
  DEFAULT_SURFACE_CTA,
} from "@/lib/ai/awareness";

const offerBriefSchema = z.object({
  dream_outcome: z.string().min(1).max(500),
  core_pain: z.string().min(1).max(500),
  why_us: z.string().min(1).max(500),
});

const topObjectionsSchema = z
  .array(
    z.object({
      objection: z.string().min(1).max(200),
      counter_frame: z.string().min(1).max(500),
    })
  )
  .max(10);

const createSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    goal: z.enum(["form_submit", "appointment_booked", "purchase", "stage_reached"]),
    goal_config: z.record(z.unknown()).optional(),
    follow_up_delay_minutes: z.number().int().min(15).max(1440).optional(),
    follow_up_message: z.string().max(500).optional(),

    optimization_goal: z.enum(["SELL", "BOOK", "QUALIFY_COLLECT"]).optional(),
    funnel_type: z.enum(["direct", "qualify_first"]).default("direct"),
    primary_action_page_id: z.string().uuid().optional(),
    qualifier_action_page_id: z.string().uuid().optional(),
    phase_mode: z.enum(["awareness_ladder", "custom"]).default("awareness_ladder"),
    offer_brief: offerBriefSchema.optional(),
    top_objections: topObjectionsSchema.optional(),
    campaign_rules: z.array(z.string().min(1).max(300)).max(10).optional(),
  })
  .refine(
    (v) => v.funnel_type !== "qualify_first" || !!v.qualifier_action_page_id,
    { message: "qualifier_action_page_id is required when funnel_type='qualify_first'" }
  );

export async function GET() {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const service = createServiceClient();
  const { data: campaigns, error } = await service
    .from("campaigns")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  return NextResponse.json({ campaigns: campaigns ?? [] });
}

export async function POST(request: Request) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const insertRow = {
    tenant_id: tenantId,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    goal: parsed.data.goal,
    goal_config: parsed.data.goal_config ?? {},
    follow_up_delay_minutes: parsed.data.follow_up_delay_minutes ?? 120,
    follow_up_message: parsed.data.follow_up_message ?? null,
    optimization_goal: parsed.data.optimization_goal ?? null,
    funnel_type: parsed.data.funnel_type,
    primary_action_page_id: parsed.data.primary_action_page_id ?? null,
    qualifier_action_page_id: parsed.data.qualifier_action_page_id ?? null,
    phase_mode: parsed.data.phase_mode,
    offer_brief: parsed.data.offer_brief ?? null,
    top_objections: parsed.data.top_objections ?? [],
    campaign_rules: parsed.data.campaign_rules ?? [],
  };

  const { data: campaign, error } = await service
    .from("campaigns")
    .insert(insertRow)
    .select("*")
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }

  // Auto-seed 5 awareness phase rows when phase_mode = awareness_ladder.
  if (parsed.data.phase_mode === "awareness_ladder") {
    const campaignId = (campaign as { id: string }).id;
    const phaseRows = AWARENESS_LEVELS.map((level, i) => ({
      campaign_id: campaignId,
      tenant_id: tenantId,
      name: AWARENESS_DISPLAY_NAMES[level],
      order_index: i + 1,
      awareness_level: level,
      surface_cta: DEFAULT_SURFACE_CTA[level],
      max_messages: 3,
      system_prompt: "",
      tone: "",
      goals: null,
      transition_hint: null,
      action_button_ids: [],
    }));
    await service.from("campaign_phases").insert(phaseRows);
  }

  return NextResponse.json({ campaign }, { status: 201 });
}
```

- [ ] **Step 4: Update `src/app/api/campaigns/[id]/route.ts`**

Update the `updateSchema` to include the new fields. Replace the schema constant with:

```ts
const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  goal: z.enum(["form_submit", "appointment_booked", "purchase", "stage_reached"]).optional(),
  goal_config: z.record(z.unknown()).optional(),
  is_primary: z.boolean().optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
  follow_up_delay_minutes: z.number().int().min(15).max(1440).optional(),
  follow_up_message: z.string().max(500).nullable().optional(),
  campaign_rules: z.array(z.string().min(1).max(300)).max(10).optional(),

  optimization_goal: z.enum(["SELL", "BOOK", "QUALIFY_COLLECT"]).optional(),
  funnel_type: z.enum(["direct", "qualify_first"]).optional(),
  primary_action_page_id: z.string().uuid().nullable().optional(),
  qualifier_action_page_id: z.string().uuid().nullable().optional(),
  offer_brief: z.object({
    dream_outcome: z.string().min(1).max(500),
    core_pain: z.string().min(1).max(500),
    why_us: z.string().min(1).max(500),
  }).nullable().optional(),
  top_objections: z.array(z.object({
    objection: z.string().min(1).max(200),
    counter_frame: z.string().min(1).max(500),
  })).max(10).optional(),
});
```

No changes needed to the rest of the PATCH handler — `parsed.data` spread already covers the new keys.

- [ ] **Step 5: Run tests (expect pass)**

Run: `npx vitest run tests/unit/campaigns-api.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/campaigns/route.ts src/app/api/campaigns/[id]/route.ts tests/unit/campaigns-api.test.ts
git commit -m "feat(api): campaigns POST/PATCH accept awareness fields + auto-seed phases"
```

---

## Task 15: Integration Tests — Awareness Pipeline

**Files:**
- Create: `tests/integration/awareness-pipeline.test.ts`

These tests cover the spec's integration requirements:
1. Per-rung pipeline executes and stores awareness.
2. Hot-lead bypass (MOST_AWARE in qualify_first → primary CTA, not qualifier).
3. Objection routing (PRODUCT_AWARE + money objection → counter_frame appears verbatim).
4. Off-topic question → empty RAG → bot acknowledges politely.
5. Custom-mode regression — engine still routes via legacy path.

We mock at the boundaries (Supabase service, LLM, embedding) and assert end-to-end behavior of `handleMessage`.

- [ ] **Step 1: Create the test file**

Create `tests/integration/awareness-pipeline.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// ----- Globals -----
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const mockRpc = vi.fn();
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ rpc: mockRpc, from: mockFrom })),
}));

const mockFeatureExtraction = vi.fn();
vi.mock("@huggingface/inference", () => ({
  InferenceClient: vi.fn().mockImplementation(() => ({
    featureExtraction: mockFeatureExtraction,
  })),
}));

vi.mock("@/lib/ai/campaign-assignment", () => ({
  getOrAssignCampaign: vi.fn().mockResolvedValue("camp-1"),
}));
vi.mock("@/lib/leads/knowledge-extractor", () => ({
  extractKnowledge: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/leads/summary-generator", () => ({
  generateLeadSummary: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/ai/image-selector", () => ({ selectImages: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/ai/reranker", () => ({ rerankChunks: vi.fn().mockImplementation(async (_q, c) => c) }));
vi.mock("@/lib/ai/query-router", () => ({ classifyQuery: vi.fn().mockReturnValue("general") }));

import { handleMessage } from "@/lib/ai/conversation-engine";

const fakeEmbedding = Array.from({ length: 1024 }, (_, i) => Math.sin(i) * 0.01);

interface CampaignRow {
  id: string;
  name: string;
  description: string | null;
  goal: string;
  campaign_rules: string[] | null;
  phase_mode: "awareness_ladder" | "custom";
  funnel_type: "direct" | "qualify_first";
  primary_action_page_id: string | null;
  qualifier_action_page_id: string | null;
  offer_brief: { dream_outcome: string; core_pain: string; why_us: string } | null;
  top_objections: { objection: string; counter_frame: string }[] | null;
}

function singleResolver(data: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data, error: null }),
      }),
    }),
  };
}

function makeAwarenessQueueFor(opts: {
  campaign: CampaignRow;
  llmJson: object;
  ragChunks?: { id: string; content: string; similarity: number; metadata: Record<string, unknown> }[];
  priorAwareness?: string | null;
  surfaceCta?: boolean;
  qualifierCompletedAt?: string | null;
  llmPersonaTone?: string;
}) {
  const personaTone = opts.llmPersonaTone ?? "friendly";
  // Sequence of mockFrom calls in handleAwarenessTurn:
  // 1. conversations gate select (id, bot_paused_at, qualifier_completed_at)
  mockFrom.mockReturnValueOnce(singleResolver({
    bot_paused_at: null,
    qualifier_completed_at: opts.qualifierCompletedAt ?? null,
  }));

  // 2. campaigns select (full row)
  mockFrom.mockReturnValueOnce(singleResolver(opts.campaign));

  // 3. conversations select for getCurrentAwareness
  mockFrom.mockReturnValueOnce(singleResolver({
    current_awareness_level: opts.priorAwareness ?? null,
  }));

  // 4. conversation_phases select (getCurrentPhase) — return existing phase
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "cp-1",
                  phase_id: "ph-1",
                  message_count: 0,
                  campaign_phases: {
                    id: "ph-1",
                    name: opts.priorAwareness ?? "Unaware",
                    order_index: 1,
                    max_messages: 3,
                    system_prompt: "",
                    tone: "warm",
                    goals: null,
                    transition_hint: null,
                    action_button_ids: null,
                  },
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    }),
  });

  // 5. action_pages select (.in)
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({
        data: [
          { id: "ap-primary", title: "Book a demo", cta_text: "Book your demo" },
          { id: "ap-qualifier", title: "Quick fit-check", cta_text: "Take the quick check" },
        ],
        error: null,
      }),
    }),
  });

  // 6. campaign_phases select for surface_cta (priorAwareness route)
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { surface_cta: opts.surfaceCta ?? true },
            error: null,
          }),
        }),
      }),
    }),
  });

  // 7. RPC call inside retriever
  mockRpc.mockResolvedValueOnce({
    data: opts.ragChunks ?? [],
    error: null,
  });

  // 8. tenant select inside prompt-builder buildSystemPrompt
  mockFrom.mockReturnValueOnce(singleResolver({
    persona_tone: personaTone,
    custom_instructions: null,
    business_type: "services",
    bot_goal: "sell",
  }));

  // 9. bot_rules select
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  });

  // 10. messages select (history)
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }),
  });

  // 11–13. lead_contacts, lead_knowledge, action_submissions
  for (let k = 0; k < 3; k++) {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }),
    });
  }

  // LLM HTTP mock — returns the JSON we want.
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(opts.llmJson) } }],
    }),
  });
  // Embedding mock
  mockFeatureExtraction.mockResolvedValue(fakeEmbedding);

  // 14. campaign_phases select for surface_cta (final-route, NEW awareness)
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { surface_cta: opts.surfaceCta ?? true },
            error: null,
          }),
        }),
      }),
    }),
  });

  // 15. conversations select (detected_objections) — for updateAwareness
  mockFrom.mockReturnValueOnce(singleResolver({ detected_objections: [] }));

  // 16. conversations update (updateAwareness)
  mockFrom.mockReturnValueOnce({
    update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
  });

  // 17. conversation_phases select then update for incrementMessageCount
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { message_count: 0 }, error: null }),
      }),
    }),
  });
  mockFrom.mockReturnValueOnce({
    update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
  });

  // 18. messages select (idle gap)
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        neq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    }),
  });
}

const baseCampaign: CampaignRow = {
  id: "camp-1",
  name: "Sell WhatStage",
  description: null,
  goal: "form_submit",
  campaign_rules: ["Never offer discounts"],
  phase_mode: "awareness_ladder",
  funnel_type: "direct",
  primary_action_page_id: "ap-primary",
  qualifier_action_page_id: null,
  offer_brief: {
    dream_outcome: "leads booking themselves",
    core_pain: "DMs going cold",
    why_us: "we close in chat",
  },
  top_objections: [
    { objection: "too expensive", counter_frame: "It pays for itself with one extra booking." },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("awareness pipeline integration", () => {
  it("PROBLEM_AWARE — does not surface CTA", async () => {
    makeAwarenessQueueFor({
      campaign: baseCampaign,
      priorAwareness: "PROBLEM_AWARE",
      surfaceCta: false,
      llmJson: {
        reply: "DMs go cold a lot — it gets old fast.",
        detected_awareness: "PROBLEM_AWARE",
        intent_label: "venting pain",
        detected_objection: null,
        wants_cta_now: false,
        qualifier_just_completed: false,
        confidence: 0.85,
      },
    });
    const out = await handleMessage({
      tenantId: "t1", leadId: "l1", businessName: "Acme",
      conversationId: "conv-1", leadMessage: "My DMs are dying",
    });
    expect(out.actionButton).toBeUndefined();
    expect(out.message).toContain("DMs");
  });

  it("MOST_AWARE in qualify_first funnel — bypasses qualifier, surfaces primary", async () => {
    const campaign: CampaignRow = {
      ...baseCampaign,
      funnel_type: "qualify_first",
      qualifier_action_page_id: "ap-qualifier",
    };
    makeAwarenessQueueFor({
      campaign,
      priorAwareness: "PRODUCT_AWARE",
      surfaceCta: true,
      llmJson: {
        reply: "Got it — link below.",
        detected_awareness: "MOST_AWARE",
        intent_label: "ready to buy",
        detected_objection: null,
        wants_cta_now: true,
        qualifier_just_completed: false,
        confidence: 0.95,
      },
    });
    const out = await handleMessage({
      tenantId: "t1", leadId: "l1", businessName: "Acme",
      conversationId: "conv-1", leadMessage: "I want to sign up",
    });
    expect(out.actionButton?.actionPageId).toBe("ap-primary");
  });

  it("PRODUCT_AWARE + money objection — counter_frame appears VERBATIM in prompt", async () => {
    // We assert the LLM was called with a system prompt containing the counter_frame.
    makeAwarenessQueueFor({
      campaign: baseCampaign,
      priorAwareness: "PRODUCT_AWARE",
      surfaceCta: true,
      llmJson: {
        reply: "It pays for itself with one extra booking.",
        detected_awareness: "PRODUCT_AWARE",
        intent_label: "price objection",
        detected_objection: "money",
        wants_cta_now: false,
        qualifier_just_completed: false,
        confidence: 0.9,
      },
    });
    await handleMessage({
      tenantId: "t1", leadId: "l1", businessName: "Acme",
      conversationId: "conv-1", leadMessage: "Too expensive",
    });
    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse((fetchCall[1] as { body: string }).body);
    const systemMsg = body.messages.find((m: { role: string }) => m.role === "system");
    expect(systemMsg.content).toContain("It pays for itself with one extra booking.");
  });

  it("off-topic question with empty scoped RAG — no CTA, message returned", async () => {
    makeAwarenessQueueFor({
      campaign: baseCampaign,
      priorAwareness: "SOLUTION_AWARE",
      surfaceCta: true,
      ragChunks: [],
      llmJson: {
        reply: "I don't have that handy here.",
        detected_awareness: "SOLUTION_AWARE",
        intent_label: "off-topic",
        detected_objection: null,
        wants_cta_now: false,
        qualifier_just_completed: false,
        confidence: 0.6,
      },
    });
    const out = await handleMessage({
      tenantId: "t1", leadId: "l1", businessName: "Acme",
      conversationId: "conv-1", leadMessage: "What's the weather in Tokyo",
    });
    expect(out.actionButton).toBeUndefined();
    expect(out.message).toMatch(/don't have/i);
  });

  it("custom-mode campaign still routes through legacy path (regression)", async () => {
    // For a custom campaign, the engine should not call the awareness branch.
    // We assert via the fact that we DON'T queue awareness-specific selects;
    // the existing custom path is exercised by tests/integration/conversation-engine.test.ts,
    // but we provide a smoke check here.

    // 1. conversations gate
    mockFrom.mockReturnValueOnce(singleResolver({ bot_paused_at: null, qualifier_completed_at: null }));
    // 2. campaign select with phase_mode=custom
    mockFrom.mockReturnValueOnce(singleResolver({
      ...baseCampaign,
      phase_mode: "custom",
    }));
    // 3. conversation_phases select (getCurrentPhase) — same shape as awareness path
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "cp-1", phase_id: "ph-1", message_count: 0,
                    campaign_phases: {
                      id: "ph-1", name: "Greet", order_index: 0, max_messages: 3,
                      system_prompt: "Hi the lead.", tone: "friendly",
                      goals: "open", transition_hint: null, action_button_ids: null,
                    },
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    });
    // 4. RPC for retrieval (legacy match_knowledge_chunks_hybrid)
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    // 5. tenants max_images
    mockFrom.mockReturnValueOnce(singleResolver({ max_images_per_response: 2 }));
    // 6. bot_rules
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });
    // 7. messages history
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    });
    // 8. tenants persona
    mockFrom.mockReturnValueOnce(singleResolver({
      persona_tone: "friendly", custom_instructions: null,
      business_type: "services", bot_goal: "sell",
    }));
    // 9–11. lead_contacts, lead_knowledge, action_submissions
    for (let k = 0; k < 3; k++) {
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      });
    }
    // LLM
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          message: "Hey",
          phase_action: "stay",
          confidence: 0.9,
          image_ids: [],
        }) } }],
      }),
    });
    mockFeatureExtraction.mockResolvedValue(fakeEmbedding);

    // 12. conversation_phases select for incrementMessageCount
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { message_count: 0 }, error: null }),
        }),
      }),
    });
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    });
    // 13. messages idle gap
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          neq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    });

    const out = await handleMessage({
      tenantId: "t1", leadId: "l1", businessName: "Acme",
      conversationId: "conv-2", leadMessage: "Hi",
    });

    // Custom path should NOT have invoked match_knowledge_chunks_scoped.
    const rpcNames = mockRpc.mock.calls.map((c) => c[0]);
    expect(rpcNames).toContain("match_knowledge_chunks_hybrid");
    expect(rpcNames).not.toContain("match_knowledge_chunks_scoped");
    expect(out.message).toBe("Hey");
  });
});
```

> **Note on mock fragility:** the order of `mockFrom`/`mockRpc` returns must match the engine's call order exactly. If the engine refactor changes call order, update the queue. The test asserts behavior, not call sequence.

- [ ] **Step 2: Run tests (expect pass)**

Run: `npx vitest run tests/integration/awareness-pipeline.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/awareness-pipeline.test.ts
git commit -m "test(int): awareness pipeline per-rung + bypass + objection + scope + regression"
```

---

## Task 16: Dogfood Seed Script (WhatStage Selling Campaign)

**Files:**
- Create: `scripts/seed-whatstage-campaign.ts`

The script (re)builds the WhatStage selling campaign in `awareness_ladder` mode for a given tenant. It is invoked manually with `npx tsx scripts/seed-whatstage-campaign.ts <tenant_id> <primary_action_page_id>`.

- [ ] **Step 1: Verify scripts dir convention**

Run: `ls scripts/ 2>&1 || mkdir -p scripts`
Expected: directory exists or is created.

- [ ] **Step 2: Write the script**

Create `scripts/seed-whatstage-campaign.ts`:

```ts
/* eslint-disable no-console */
/**
 * Dogfood seed: rebuilds the WhatStage selling campaign in awareness_ladder mode.
 *
 * Usage:
 *   npx tsx scripts/seed-whatstage-campaign.ts <tenant_id> <primary_action_page_id> [qualifier_action_page_id]
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars.
 */
import { createServiceClient } from "../src/lib/supabase/service";
import {
  AWARENESS_LEVELS,
  AWARENESS_DISPLAY_NAMES,
  DEFAULT_SURFACE_CTA,
} from "../src/lib/ai/awareness";

async function main() {
  const [tenantId, primaryActionPageId, qualifierActionPageId] = process.argv.slice(2);
  if (!tenantId || !primaryActionPageId) {
    console.error("Usage: tsx scripts/seed-whatstage-campaign.ts <tenant_id> <primary_action_page_id> [qualifier_action_page_id]");
    process.exit(1);
  }

  const supabase = createServiceClient();

  // Delete any existing "Sell WhatStage" campaign for this tenant.
  const { data: existing } = await supabase
    .from("campaigns")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("name", "Sell WhatStage");
  for (const row of (existing as { id: string }[] | null) ?? []) {
    await supabase.from("campaigns").delete().eq("id", row.id);
  }

  // Insert the campaign.
  const { data: campaignRaw, error } = await supabase
    .from("campaigns")
    .insert({
      tenant_id: tenantId,
      name: "Sell WhatStage",
      description: "Reference implementation: sell WhatStage to other tenants in awareness_ladder mode.",
      goal: "form_submit",
      optimization_goal: "BOOK",
      funnel_type: qualifierActionPageId ? "qualify_first" : "direct",
      primary_action_page_id: primaryActionPageId,
      qualifier_action_page_id: qualifierActionPageId ?? null,
      phase_mode: "awareness_ladder",
      offer_brief: {
        dream_outcome:
          "Messenger leads that book themselves into your calendar without you babysitting DMs.",
        core_pain:
          "DMs that go cold because there's no clear next step from chat.",
        why_us:
          "We route every Messenger lead to a signed action page — qualifier, demo, or buy — so the chatbot stays focused on intent.",
      },
      top_objections: [
        {
          objection: "too expensive",
          counter_frame:
            "If it converts one extra lead a week, it pays for itself — and the alternative is the DMs you already lose.",
        },
        {
          objection: "I'll think about it",
          counter_frame:
            "Cool — pin this thread so you don't lose the link. The page stays live whenever you're ready.",
        },
        {
          objection: "I don't have time to set this up",
          counter_frame:
            "Setup is one campaign + one action page. We seed the awareness ladder for you — about 10 minutes start to finish.",
        },
        {
          objection: "I'm not sure it'll work for my business",
          counter_frame:
            "We work for any business that gets Messenger DMs and has one clear next step (form, calendar, or checkout). If you have those, you're in.",
        },
      ],
      campaign_rules: [
        "Never offer discounts.",
        "Always reference the demo or qualifier — never invent another CTA.",
        "When the lead is product-aware and asks about price, answer in one sentence and route.",
      ],
    })
    .select("id")
    .single();

  if (error || !campaignRaw) {
    console.error("Failed to insert campaign:", error);
    process.exit(1);
  }
  const campaignId = (campaignRaw as { id: string }).id;
  console.log(`Inserted campaign ${campaignId}`);

  // Seed 5 awareness phase rows.
  const phaseRows = AWARENESS_LEVELS.map((level, i) => ({
    campaign_id: campaignId,
    tenant_id: tenantId,
    name: AWARENESS_DISPLAY_NAMES[level],
    order_index: i + 1,
    awareness_level: level,
    surface_cta: DEFAULT_SURFACE_CTA[level],
    max_messages: 3,
    system_prompt: "",
    tone: "",
    goals: null,
    transition_hint: null,
    action_button_ids: [],
  }));
  const { error: phaseErr } = await supabase.from("campaign_phases").insert(phaseRows);
  if (phaseErr) {
    console.error("Failed to insert phase rows:", phaseErr);
    process.exit(1);
  }
  console.log(`Seeded ${phaseRows.length} awareness phase rows.`);

  console.log("Done. Tag knowledge docs to this campaign via campaign_knowledge_docs to scope retrieval.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Verify the script type-checks**

Run: `npx tsc --noEmit scripts/seed-whatstage-campaign.ts`
Expected: PASS (script may rely on path mappings; if it errors on `@/` imports, replace with relative imports as already done above).

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-whatstage-campaign.ts
git commit -m "chore(seed): dogfood seed for WhatStage selling campaign in awareness mode"
```

---

## Final Verification

- [ ] **Run full test suite**

Run: `npm test`
Expected: ALL pass.

- [ ] **Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Run lint**

Run: `npm run lint`
Expected: PASS (or warnings only, no errors).

---

## Decisions / Spec Ambiguities Resolved

| Ambiguity | Resolution |
|---|---|
| Spec mentions a 40-case test but math gives 80 (5 × 2 × 2 × 2 × 2). | Plan generates the full 80-case grid. |
| Spec § "Per-Turn AI Flow" mentions images / `image_ids` only in legacy schema. | Awareness-mode `EngineOutput.imageIds` returns `[]`; image selection is left to custom mode for v1 (action pages do the heavy lifting per spec). |
| Spec doesn't define minimum `top_objections` count for "convert to ladder". | Plan requires ≥1 (spec says 3–5 in UI; API enforces only ≥1 to keep server-side validation forgiving for the dogfood flow). |
| Spec says LLM signal is fallback for qualifier-completion, webhook is authoritative. | Plan: when `qualifier_just_completed=true`, engine uses `new Date()` for routing this turn AND persists `qualifier_completed_at`. Webhook flows are unchanged and continue to be authoritative when they fire. |
| "phase_mode='custom' UI not exposed". | Plan does NOT expose any UI; existing migrated campaigns route through legacy `handleCustomTurn`. |
| Layer F prompt — should it use prior or new awareness? | Per spec § "Note: step 3F builds prompt using PRIOR awareness", plan uses prior awareness for Layer F and reroutes after step 5 with new awareness — minor UX gap is accepted for v1. |
| Knowledge `kb_type` (general vs product) is unchanged by redesign. | Plan keeps the existing two-bucket retrieval; `match_knowledge_chunks_scoped` mirrors the hybrid signature so both kb_type calls are made when `classifyQuery="both"`. |
