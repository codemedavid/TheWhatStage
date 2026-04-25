# Chatbot Awareness Redesign — UI Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tenant-facing UI for authoring `awareness_ladder` campaigns: a 5-step creation form (goal & funnel, offer brief, top objections, knowledge scoping, campaign rules), a "Convert to ladder" action for legacy custom-mode campaigns, a read-only "Preview phase strategies" panel, and gating of the per-phase editor so it only renders for `phase_mode='custom'`.

**Architecture:** A new wizard component `AwarenessLadderWizard` orchestrates 5 step components (`StepGoalFunnel`, `StepOfferBrief`, `StepObjections`, `StepKnowledge`, `StepRules`), each a focused, independently testable React component holding only its slice of state. The wizard owns aggregate `draft` state and POSTs to `/api/campaigns` on the final step (Plan 1 backend accepts the new fields). Editing flows through `CampaignEditorClient`: the existing `CampaignForm` is replaced by an `AwarenessLadderEditor` for ladder-mode campaigns and the legacy `CampaignForm` is preserved for `custom`-mode. `CampaignFlowPanel` (per-phase editor) is hidden for ladder-mode and replaced with `AwarenessStrategyPreview`. Plan 1 ships all backend types and routes; Plan 2 imports those types and calls those routes by name.

**Tech Stack:** Next.js App Router (client components), React 19, TypeScript, Tailwind utility classes via `var(--ws-*)` tokens, Vitest + React Testing Library + `@testing-library/user-event` for component tests, Playwright for E2E.

---

## Cross-Plan Dependencies (from Plan 1)

Plan 2 assumes Plan 1 is merged. From Plan 1, the following are guaranteed to exist:

- **Type:** `Campaign` (extended in `src/hooks/useCampaigns.ts`) gains the fields:
  - `optimization_goal: 'SELL' | 'BOOK' | 'QUALIFY_COLLECT' | null`
  - `funnel_type: 'direct' | 'qualify_first'`
  - `primary_action_page_id: string | null`
  - `qualifier_action_page_id: string | null`
  - `phase_mode: 'awareness_ladder' | 'custom'`
  - `offer_brief: { dream_outcome: string; core_pain: string; why_us: string } | null`
  - `top_objections: { objection: string; counter_frame: string }[] | null`
- **Type:** `AwarenessLevel = 'UNAWARE' | 'PROBLEM_AWARE' | 'SOLUTION_AWARE' | 'PRODUCT_AWARE' | 'MOST_AWARE'` exported from `src/lib/ai/awareness.ts`.
- **Function:** `renderPhaseStrategy(level: AwarenessLevel, campaign: Campaign): string` exported from `src/lib/ai/phase-templates.ts` (reused for the preview panel).
- **API:** `POST /api/campaigns` accepts `{ name, goal, optimization_goal, funnel_type, primary_action_page_id, qualifier_action_page_id, offer_brief, top_objections, campaign_rules, knowledge_doc_ids, global_faq_doc_ids }` and returns `{ campaign }`.
- **API:** `PATCH /api/campaigns/[id]` accepts the same fields plus `name`, `description`, `status`, `follow_up_*`.
- **API:** `POST /api/campaigns/[id]/convert-to-ladder` returns `{ campaign }` with `phase_mode='awareness_ladder'`.
- **API:** `GET /api/action-pages?goal=<SELL|BOOK|QUALIFY_COLLECT>` returns `{ action_pages: { id: string; name: string; goal: string }[] }`. (If the route already exists with a different filter shape in Plan 1, swap the query param accordingly — no other downstream UI logic changes.)
- **API:** `GET /api/knowledge-docs` returns `{ docs: { id: string; title: string; is_global_faq: boolean }[] }`.

If any name above changes during Plan 1 execution, the engineer rebases Plan 2 and renames at the call site only — type signatures and API shapes are stable.

---

## File Structure

**Create:**
- `src/components/dashboard/campaigns/AwarenessLadderWizard.tsx` — orchestrator (~180 LOC)
- `src/components/dashboard/campaigns/wizard/StepGoalFunnel.tsx` — Step 1
- `src/components/dashboard/campaigns/wizard/StepOfferBrief.tsx` — Step 2
- `src/components/dashboard/campaigns/wizard/StepObjections.tsx` — Step 3
- `src/components/dashboard/campaigns/wizard/StepKnowledge.tsx` — Step 4
- `src/components/dashboard/campaigns/wizard/StepRules.tsx` — Step 5
- `src/components/dashboard/campaigns/wizard/types.ts` — shared `WizardDraft` type
- `src/components/dashboard/campaigns/wizard/objection-templates.ts` — Hormozi 4 templates
- `src/components/dashboard/campaigns/AwarenessLadderEditor.tsx` — edit-mode wrapper (reuses wizard steps)
- `src/components/dashboard/campaigns/AwarenessStrategyPreview.tsx` — read-only Layer D preview
- `src/components/dashboard/campaigns/ConvertToLadderButton.tsx` — convert action
- `tests/unit/awareness-wizard.test.tsx`
- `tests/unit/step-goal-funnel.test.tsx`
- `tests/unit/step-offer-brief.test.tsx`
- `tests/unit/step-objections.test.tsx`
- `tests/unit/step-knowledge.test.tsx`
- `tests/unit/step-rules.test.tsx`
- `tests/unit/awareness-strategy-preview.test.tsx`
- `tests/unit/convert-to-ladder-button.test.tsx`
- `tests/e2e/awareness-ladder.spec.ts`

**Modify:**
- `src/app/(tenant)/app/campaigns/new/page.tsx` — replace simple form with `AwarenessLadderWizard`
- `src/app/(tenant)/app/campaigns/[id]/CampaignEditorClient.tsx` — gate Flow tab and Settings tab on `phase_mode`
- `src/hooks/useCampaigns.ts` — extend `Campaign` interface with new fields (mirror Plan 1)

---

## Task 1: Add new Campaign fields to the client type

**Files:**
- Modify: `src/hooks/useCampaigns.ts:5-26`
- Test: none (type-only change; consumers' tests cover usage)

- [ ] **Step 1: Edit the `Campaign` interface**

Replace the interface in `src/hooks/useCampaigns.ts` (lines 5–26) with:

```ts
export interface Campaign {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  goal: string;
  goal_config: Record<string, unknown>;
  is_primary: boolean;
  status: string;
  follow_up_delay_minutes: number;
  follow_up_message: string | null;
  campaign_plan: {
    goal_summary: string;
    selling_approach: string;
    buyer_context: string;
    key_behaviors: string[];
    phase_outline: { name: string; purpose: string }[];
  } | null;
  campaign_rules: string[];
  // Plan 1 additions:
  phase_mode: "awareness_ladder" | "custom";
  optimization_goal: "SELL" | "BOOK" | "QUALIFY_COLLECT" | null;
  funnel_type: "direct" | "qualify_first";
  primary_action_page_id: string | null;
  qualifier_action_page_id: string | null;
  offer_brief: {
    dream_outcome: string;
    core_pain: string;
    why_us: string;
  } | null;
  top_objections: { objection: string; counter_frame: string }[] | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (existing usages of fields like `campaign.name`, `campaign.goal`, `campaign.campaign_rules` are unchanged; new fields are additive).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCampaigns.ts
git commit -m "feat(ui): extend Campaign type with awareness ladder fields"
```

---

## Task 2: Wizard shared types and objection templates

**Files:**
- Create: `src/components/dashboard/campaigns/wizard/types.ts`
- Create: `src/components/dashboard/campaigns/wizard/objection-templates.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
// src/components/dashboard/campaigns/wizard/types.ts
export type OptimizationGoal = "SELL" | "BOOK" | "QUALIFY_COLLECT";
export type FunnelType = "direct" | "qualify_first";

export interface OfferBrief {
  dream_outcome: string;
  core_pain: string;
  why_us: string;
}

export interface ObjectionEntry {
  objection: string;
  counter_frame: string;
}

export interface WizardDraft {
  name: string;
  optimization_goal: OptimizationGoal;
  funnel_type: FunnelType;
  primary_action_page_id: string | null;
  qualifier_action_page_id: string | null;
  offer_brief: OfferBrief;
  top_objections: ObjectionEntry[];
  campaign_rules: string[];
  knowledge_doc_ids: string[];
  global_faq_doc_ids: string[];
}

export const EMPTY_DRAFT: WizardDraft = {
  name: "",
  optimization_goal: "SELL",
  funnel_type: "direct",
  primary_action_page_id: null,
  qualifier_action_page_id: null,
  offer_brief: { dream_outcome: "", core_pain: "", why_us: "" },
  top_objections: [],
  campaign_rules: [],
  knowledge_doc_ids: [],
  global_faq_doc_ids: [],
};

export interface ActionPageOption {
  id: string;
  name: string;
  goal: string;
}

export interface KnowledgeDocOption {
  id: string;
  title: string;
  is_global_faq: boolean;
}
```

- [ ] **Step 2: Write `objection-templates.ts`**

```ts
// src/components/dashboard/campaigns/wizard/objection-templates.ts
import type { ObjectionEntry } from "./types";

export interface ObjectionTemplate {
  category: "money" | "time" | "fit" | "trust";
  label: string;
  example: ObjectionEntry;
}

export const HORMOZI_OBJECTION_TEMPLATES: ObjectionTemplate[] = [
  {
    category: "money",
    label: "Money — too expensive / no budget",
    example: {
      objection: "It's too expensive",
      counter_frame:
        "Most clients earn it back within their first month — the real cost is staying stuck where you are now.",
    },
  },
  {
    category: "time",
    label: "Time — busy / not the right time",
    example: {
      objection: "I don't have time right now",
      counter_frame:
        "It takes 15 minutes to set up. Waiting another month is choosing the same problem for 30 more days.",
    },
  },
  {
    category: "fit",
    label: "Fit — won't work for my situation",
    example: {
      objection: "My business is different, this won't work for me",
      counter_frame:
        "We've onboarded teams in 12+ industries with the same playbook. Tell me what's unique and I'll show you exactly how it maps.",
    },
  },
  {
    category: "trust",
    label: "Trust — skeptical / never heard of you",
    example: {
      objection: "How do I know this actually works?",
      counter_frame:
        "Look at our case studies and try it free for 14 days. If it doesn't move the needle, you keep everything you built.",
    },
  },
];
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/campaigns/wizard/types.ts src/components/dashboard/campaigns/wizard/objection-templates.ts
git commit -m "feat(ui): add awareness wizard types and Hormozi objection templates"
```

---

## Task 3: StepGoalFunnel component (Step 1)

**Files:**
- Create: `src/components/dashboard/campaigns/wizard/StepGoalFunnel.tsx`
- Test: `tests/unit/step-goal-funnel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/step-goal-funnel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StepGoalFunnel from "@/components/dashboard/campaigns/wizard/StepGoalFunnel";
import { EMPTY_DRAFT } from "@/components/dashboard/campaigns/wizard/types";

const SELL_PAGES = [
  { id: "ap-1", name: "Buy Plan", goal: "SELL" },
  { id: "ap-2", name: "Checkout", goal: "SELL" },
];
const BOOK_PAGES = [{ id: "ap-3", name: "Book Call", goal: "BOOK" }];
const QUALIFY_PAGES = [{ id: "ap-4", name: "Lead Form", goal: "QUALIFY_COLLECT" }];

describe("StepGoalFunnel", () => {
  const onChange = vi.fn();
  beforeEach(() => onChange.mockClear());

  it("renders three optimization_goal radios", () => {
    render(
      <StepGoalFunnel
        draft={EMPTY_DRAFT}
        onChange={onChange}
        actionPages={[...SELL_PAGES, ...BOOK_PAGES, ...QUALIFY_PAGES]}
      />
    );
    expect(screen.getByLabelText(/sell/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/book/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/qualify/i)).toBeInTheDocument();
  });

  it("renders two funnel_type radios", () => {
    render(
      <StepGoalFunnel
        draft={EMPTY_DRAFT}
        onChange={onChange}
        actionPages={SELL_PAGES}
      />
    );
    expect(screen.getByLabelText(/direct/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/qualify first/i)).toBeInTheDocument();
  });

  it("filters primary action page dropdown by goal=SELL", () => {
    render(
      <StepGoalFunnel
        draft={{ ...EMPTY_DRAFT, optimization_goal: "SELL" }}
        onChange={onChange}
        actionPages={[...SELL_PAGES, ...BOOK_PAGES]}
      />
    );
    const select = screen.getByLabelText(/primary action page/i) as HTMLSelectElement;
    const optionTexts = Array.from(select.options).map((o) => o.text);
    expect(optionTexts).toContain("Buy Plan");
    expect(optionTexts).toContain("Checkout");
    expect(optionTexts).not.toContain("Book Call");
  });

  it("hides qualifier dropdown when funnel_type=direct", () => {
    render(
      <StepGoalFunnel
        draft={{ ...EMPTY_DRAFT, funnel_type: "direct" }}
        onChange={onChange}
        actionPages={[...SELL_PAGES, ...QUALIFY_PAGES]}
      />
    );
    expect(screen.queryByLabelText(/qualifier action page/i)).not.toBeInTheDocument();
  });

  it("shows qualifier dropdown when funnel_type=qualify_first", () => {
    render(
      <StepGoalFunnel
        draft={{ ...EMPTY_DRAFT, funnel_type: "qualify_first" }}
        onChange={onChange}
        actionPages={[...SELL_PAGES, ...QUALIFY_PAGES]}
      />
    );
    expect(screen.getByLabelText(/qualifier action page/i)).toBeInTheDocument();
  });

  it("emits onChange when goal radio is clicked", async () => {
    const user = userEvent.setup();
    render(
      <StepGoalFunnel
        draft={EMPTY_DRAFT}
        onChange={onChange}
        actionPages={QUALIFY_PAGES}
      />
    );
    await user.click(screen.getByLabelText(/qualify/i));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ optimization_goal: "QUALIFY_COLLECT" })
    );
  });

  it("emits onChange when name input changes", async () => {
    const user = userEvent.setup();
    render(
      <StepGoalFunnel
        draft={EMPTY_DRAFT}
        onChange={onChange}
        actionPages={SELL_PAGES}
      />
    );
    await user.type(screen.getByLabelText(/campaign name/i), "X");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: "X" }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/step-goal-funnel.test.tsx`
Expected: FAIL — module `StepGoalFunnel` not found.

- [ ] **Step 3: Implement `StepGoalFunnel`**

```tsx
// src/components/dashboard/campaigns/wizard/StepGoalFunnel.tsx
"use client";

import type {
  WizardDraft,
  ActionPageOption,
  OptimizationGoal,
  FunnelType,
} from "./types";

interface Props {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
  actionPages: ActionPageOption[];
}

const GOAL_OPTIONS: { value: OptimizationGoal; label: string; description: string }[] = [
  { value: "SELL", label: "Sell", description: "Drive purchases on a product or sales page" },
  { value: "BOOK", label: "Book", description: "Get leads to book a call or appointment" },
  { value: "QUALIFY_COLLECT", label: "Qualify / Collect", description: "Capture lead info via a form" },
];

const FUNNEL_OPTIONS: { value: FunnelType; label: string; description: string }[] = [
  { value: "direct", label: "Direct", description: "Send leads straight to the primary action page" },
  {
    value: "qualify_first",
    label: "Qualify first",
    description: "Send leads to a qualifier page before the primary action",
  },
];

export default function StepGoalFunnel({ draft, onChange, actionPages }: Props) {
  const labelClass = "block text-sm font-medium text-[var(--ws-text-primary)] mb-1";
  const inputClass =
    "w-full rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]";

  const primaryCandidates = actionPages.filter((p) => p.goal === draft.optimization_goal);
  const qualifierCandidates = actionPages.filter((p) => p.goal === "QUALIFY_COLLECT");

  return (
    <div className="space-y-6">
      <div>
        <label className={labelClass} htmlFor="campaign-name">
          Campaign Name
        </label>
        <input
          id="campaign-name"
          className={inputClass}
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. WhatStage Main Funnel"
        />
      </div>

      <fieldset>
        <legend className={labelClass}>Optimization Goal</legend>
        <div className="space-y-2 mt-2">
          {GOAL_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                draft.optimization_goal === opt.value
                  ? "border-[var(--ws-accent)] bg-[var(--ws-accent-subtle)]"
                  : "border-[var(--ws-border)]"
              }`}
            >
              <input
                type="radio"
                name="optimization_goal"
                value={opt.value}
                checked={draft.optimization_goal === opt.value}
                onChange={() =>
                  onChange({
                    optimization_goal: opt.value,
                    primary_action_page_id: null,
                  })
                }
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium text-[var(--ws-text-primary)]">{opt.label}</div>
                <div className="text-xs text-[var(--ws-text-muted)]">{opt.description}</div>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={labelClass}>Funnel Type</legend>
        <div className="space-y-2 mt-2">
          {FUNNEL_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                draft.funnel_type === opt.value
                  ? "border-[var(--ws-accent)] bg-[var(--ws-accent-subtle)]"
                  : "border-[var(--ws-border)]"
              }`}
            >
              <input
                type="radio"
                name="funnel_type"
                value={opt.value}
                checked={draft.funnel_type === opt.value}
                onChange={() =>
                  onChange({
                    funnel_type: opt.value,
                    qualifier_action_page_id:
                      opt.value === "direct" ? null : draft.qualifier_action_page_id,
                  })
                }
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium text-[var(--ws-text-primary)]">{opt.label}</div>
                <div className="text-xs text-[var(--ws-text-muted)]">{opt.description}</div>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className={labelClass} htmlFor="primary-action-page">
          Primary Action Page
        </label>
        <select
          id="primary-action-page"
          className={inputClass}
          value={draft.primary_action_page_id ?? ""}
          onChange={(e) => onChange({ primary_action_page_id: e.target.value || null })}
        >
          <option value="">Select an action page…</option>
          {primaryCandidates.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {primaryCandidates.length === 0 && (
          <p className="mt-1 text-xs text-amber-600">
            No action pages with this goal. Create one under Action Pages first.
          </p>
        )}
      </div>

      {draft.funnel_type === "qualify_first" && (
        <div>
          <label className={labelClass} htmlFor="qualifier-action-page">
            Qualifier Action Page
          </label>
          <select
            id="qualifier-action-page"
            className={inputClass}
            value={draft.qualifier_action_page_id ?? ""}
            onChange={(e) => onChange({ qualifier_action_page_id: e.target.value || null })}
          >
            <option value="">Select a qualifier page…</option>
            {qualifierCandidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/step-goal-funnel.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/campaigns/wizard/StepGoalFunnel.tsx tests/unit/step-goal-funnel.test.tsx
git commit -m "feat(ui): wizard step 1 — goal & funnel selector"
```

---

## Task 4: StepOfferBrief component (Step 2)

**Files:**
- Create: `src/components/dashboard/campaigns/wizard/StepOfferBrief.tsx`
- Test: `tests/unit/step-offer-brief.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/step-offer-brief.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StepOfferBrief from "@/components/dashboard/campaigns/wizard/StepOfferBrief";
import { EMPTY_DRAFT } from "@/components/dashboard/campaigns/wizard/types";

describe("StepOfferBrief", () => {
  const onChange = vi.fn();
  beforeEach(() => onChange.mockClear());

  it("renders three text fields", () => {
    render(<StepOfferBrief draft={EMPTY_DRAFT} onChange={onChange} />);
    expect(screen.getByLabelText(/dream outcome/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/core pain/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/why us/i)).toBeInTheDocument();
  });

  it("emits offer_brief patch on dream_outcome change", async () => {
    const user = userEvent.setup();
    render(<StepOfferBrief draft={EMPTY_DRAFT} onChange={onChange} />);
    await user.type(screen.getByLabelText(/dream outcome/i), "X");
    expect(onChange).toHaveBeenCalledWith({
      offer_brief: { dream_outcome: "X", core_pain: "", why_us: "" },
    });
  });

  it("preserves other offer_brief fields on edit", async () => {
    const user = userEvent.setup();
    render(
      <StepOfferBrief
        draft={{
          ...EMPTY_DRAFT,
          offer_brief: { dream_outcome: "A", core_pain: "B", why_us: "C" },
        }}
        onChange={onChange}
      />
    );
    await user.type(screen.getByLabelText(/why us/i), "D");
    expect(onChange).toHaveBeenLastCalledWith({
      offer_brief: { dream_outcome: "A", core_pain: "B", why_us: "CD" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/step-offer-brief.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `StepOfferBrief`**

```tsx
// src/components/dashboard/campaigns/wizard/StepOfferBrief.tsx
"use client";

import type { WizardDraft } from "./types";

interface Props {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
}

export default function StepOfferBrief({ draft, onChange }: Props) {
  const labelClass = "block text-sm font-medium text-[var(--ws-text-primary)] mb-1";
  const helpClass = "mb-2 text-xs text-[var(--ws-text-muted)]";
  const inputClass =
    "w-full rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]";

  const update = (field: keyof WizardDraft["offer_brief"], value: string) => {
    onChange({ offer_brief: { ...draft.offer_brief, [field]: value } });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className={labelClass} htmlFor="dream-outcome">
          Dream Outcome
        </label>
        <p className={helpClass}>One sentence: what does the lead want to achieve?</p>
        <textarea
          id="dream-outcome"
          rows={2}
          className={inputClass}
          value={draft.offer_brief.dream_outcome}
          onChange={(e) => update("dream_outcome", e.target.value)}
          placeholder="e.g. A predictable pipeline of qualified leads from Messenger."
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="core-pain">
          Core Pain
        </label>
        <p className={helpClass}>One sentence: what hurts now if they do nothing?</p>
        <textarea
          id="core-pain"
          rows={2}
          className={inputClass}
          value={draft.offer_brief.core_pain}
          onChange={(e) => update("core_pain", e.target.value)}
          placeholder="e.g. Leads ghost after the first DM and they have no system to follow up."
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="why-us">
          Why Us
        </label>
        <p className={helpClass}>One sentence: what makes you the answer?</p>
        <textarea
          id="why-us"
          rows={2}
          className={inputClass}
          value={draft.offer_brief.why_us}
          onChange={(e) => update("why_us", e.target.value)}
          placeholder="e.g. We pair an AI bot with action pages so every lead is captured and routed."
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/step-offer-brief.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/campaigns/wizard/StepOfferBrief.tsx tests/unit/step-offer-brief.test.tsx
git commit -m "feat(ui): wizard step 2 — offer brief"
```

---

## Task 5: StepObjections component (Step 3)

**Files:**
- Create: `src/components/dashboard/campaigns/wizard/StepObjections.tsx`
- Test: `tests/unit/step-objections.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/step-objections.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StepObjections from "@/components/dashboard/campaigns/wizard/StepObjections";
import { EMPTY_DRAFT } from "@/components/dashboard/campaigns/wizard/types";

describe("StepObjections", () => {
  const onChange = vi.fn();
  beforeEach(() => onChange.mockClear());

  it("renders four Hormozi template buttons", () => {
    render(<StepObjections draft={EMPTY_DRAFT} onChange={onChange} />);
    expect(screen.getByRole("button", { name: /money/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /time/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /trust/i })).toBeInTheDocument();
  });

  it("clicking a template appends an objection entry", async () => {
    const user = userEvent.setup();
    render(<StepObjections draft={EMPTY_DRAFT} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /money/i }));
    expect(onChange).toHaveBeenCalledWith({
      top_objections: [
        expect.objectContaining({
          objection: "It's too expensive",
          counter_frame: expect.stringContaining("first month"),
        }),
      ],
    });
  });

  it("renders editable inputs for each existing objection", () => {
    render(
      <StepObjections
        draft={{
          ...EMPTY_DRAFT,
          top_objections: [{ objection: "Too pricey", counter_frame: "Worth it" }],
        }}
        onChange={onChange}
      />
    );
    expect(screen.getByDisplayValue("Too pricey")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Worth it")).toBeInTheDocument();
  });

  it("emits patch when an objection's text is edited", async () => {
    const user = userEvent.setup();
    render(
      <StepObjections
        draft={{
          ...EMPTY_DRAFT,
          top_objections: [{ objection: "A", counter_frame: "B" }],
        }}
        onChange={onChange}
      />
    );
    await user.type(screen.getByDisplayValue("A"), "X");
    expect(onChange).toHaveBeenLastCalledWith({
      top_objections: [{ objection: "AX", counter_frame: "B" }],
    });
  });

  it("removes an objection when remove button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <StepObjections
        draft={{
          ...EMPTY_DRAFT,
          top_objections: [
            { objection: "A", counter_frame: "B" },
            { objection: "C", counter_frame: "D" },
          ],
        }}
        onChange={onChange}
      />
    );
    await user.click(screen.getAllByRole("button", { name: /remove/i })[0]);
    expect(onChange).toHaveBeenCalledWith({
      top_objections: [{ objection: "C", counter_frame: "D" }],
    });
  });

  it("warns when fewer than 3 objections", () => {
    render(
      <StepObjections
        draft={{
          ...EMPTY_DRAFT,
          top_objections: [{ objection: "A", counter_frame: "B" }],
        }}
        onChange={onChange}
      />
    );
    expect(screen.getByText(/at least 3 objections/i)).toBeInTheDocument();
  });

  it("disables add-template buttons when 5 objections present", () => {
    render(
      <StepObjections
        draft={{
          ...EMPTY_DRAFT,
          top_objections: Array(5).fill({ objection: "x", counter_frame: "y" }),
        }}
        onChange={onChange}
      />
    );
    expect(screen.getByRole("button", { name: /money/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/step-objections.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `StepObjections`**

```tsx
// src/components/dashboard/campaigns/wizard/StepObjections.tsx
"use client";

import type { WizardDraft, ObjectionEntry } from "./types";
import { HORMOZI_OBJECTION_TEMPLATES } from "./objection-templates";

interface Props {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
}

export default function StepObjections({ draft, onChange }: Props) {
  const labelClass = "block text-sm font-medium text-[var(--ws-text-primary)] mb-1";
  const inputClass =
    "w-full rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]";

  const objections = draft.top_objections;
  const atMax = objections.length >= 5;

  const addTemplate = (entry: ObjectionEntry) => {
    if (atMax) return;
    onChange({ top_objections: [...objections, entry] });
  };

  const updateAt = (index: number, patch: Partial<ObjectionEntry>) => {
    const next = objections.map((o, i) => (i === index ? { ...o, ...patch } : o));
    onChange({ top_objections: next });
  };

  const removeAt = (index: number) => {
    onChange({ top_objections: objections.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-5">
      <div>
        <p className={labelClass}>Add from Hormozi templates</p>
        <p className="mb-2 text-xs text-[var(--ws-text-muted)]">
          The four root objections. Click to add and then customize.
        </p>
        <div className="flex flex-wrap gap-2">
          {HORMOZI_OBJECTION_TEMPLATES.map((tpl) => (
            <button
              key={tpl.category}
              type="button"
              disabled={atMax}
              onClick={() => addTemplate(tpl.example)}
              className="rounded-md border border-[var(--ws-border)] bg-white px-3 py-1.5 text-xs text-[var(--ws-text-primary)] hover:bg-[var(--ws-accent-subtle)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {tpl.label}
            </button>
          ))}
        </div>
      </div>

      {objections.length < 3 && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
          Add at least 3 objections so the bot has counter-frames to reach for.
        </div>
      )}

      <div className="space-y-4">
        {objections.map((obj, index) => (
          <div
            key={index}
            className="rounded-lg border border-[var(--ws-border)] bg-white p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--ws-text-muted)]">
                Objection {index + 1}
              </span>
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            </div>
            <div>
              <label className={labelClass} htmlFor={`objection-${index}`}>
                What the lead says
              </label>
              <input
                id={`objection-${index}`}
                className={inputClass}
                value={obj.objection}
                onChange={(e) => updateAt(index, { objection: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor={`counter-${index}`}>
                Counter frame (used verbatim by the bot)
              </label>
              <textarea
                id={`counter-${index}`}
                rows={2}
                className={inputClass}
                value={obj.counter_frame}
                onChange={(e) => updateAt(index, { counter_frame: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={atMax}
        onClick={() => addTemplate({ objection: "", counter_frame: "" })}
        className="text-sm text-[var(--ws-accent)] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
      >
        + Add blank objection
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/step-objections.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/campaigns/wizard/StepObjections.tsx tests/unit/step-objections.test.tsx
git commit -m "feat(ui): wizard step 3 — top objections with Hormozi templates"
```

---

## Task 6: StepKnowledge component (Step 4)

**Files:**
- Create: `src/components/dashboard/campaigns/wizard/StepKnowledge.tsx`
- Test: `tests/unit/step-knowledge.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/step-knowledge.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StepKnowledge from "@/components/dashboard/campaigns/wizard/StepKnowledge";
import { EMPTY_DRAFT } from "@/components/dashboard/campaigns/wizard/types";

const DOCS = [
  { id: "d1", title: "Pricing FAQ", is_global_faq: true },
  { id: "d2", title: "Onboarding Guide", is_global_faq: false },
];

describe("StepKnowledge", () => {
  const onChange = vi.fn();
  beforeEach(() => onChange.mockClear());

  it("renders all docs as checkboxes", () => {
    render(<StepKnowledge draft={EMPTY_DRAFT} onChange={onChange} docs={DOCS} />);
    expect(screen.getByLabelText(/pricing faq/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/onboarding guide/i)).toBeInTheDocument();
  });

  it("warns when zero docs are selected", () => {
    render(<StepKnowledge draft={EMPTY_DRAFT} onChange={onChange} docs={DOCS} />);
    expect(screen.getByText(/no knowledge selected/i)).toBeInTheDocument();
  });

  it("emits knowledge_doc_ids on doc checkbox click", async () => {
    const user = userEvent.setup();
    render(<StepKnowledge draft={EMPTY_DRAFT} onChange={onChange} docs={DOCS} />);
    await user.click(screen.getByLabelText(/pricing faq/i));
    expect(onChange).toHaveBeenCalledWith({ knowledge_doc_ids: ["d1"] });
  });

  it("toggles global_faq_doc_ids on global toggle", async () => {
    const user = userEvent.setup();
    render(
      <StepKnowledge
        draft={{ ...EMPTY_DRAFT, knowledge_doc_ids: ["d2"] }}
        onChange={onChange}
        docs={DOCS}
      />
    );
    await user.click(screen.getByLabelText(/mark "onboarding guide" as global faq/i));
    expect(onChange).toHaveBeenCalledWith({ global_faq_doc_ids: ["d2"] });
  });

  it("disables global toggle when doc is not selected for this campaign", () => {
    render(<StepKnowledge draft={EMPTY_DRAFT} onChange={onChange} docs={DOCS} />);
    expect(
      screen.getByLabelText(/mark "onboarding guide" as global faq/i)
    ).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/step-knowledge.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `StepKnowledge`**

```tsx
// src/components/dashboard/campaigns/wizard/StepKnowledge.tsx
"use client";

import type { WizardDraft, KnowledgeDocOption } from "./types";

interface Props {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
  docs: KnowledgeDocOption[];
}

export default function StepKnowledge({ draft, onChange, docs }: Props) {
  const toggleDoc = (id: string) => {
    const has = draft.knowledge_doc_ids.includes(id);
    const next = has
      ? draft.knowledge_doc_ids.filter((x) => x !== id)
      : [...draft.knowledge_doc_ids, id];
    const patch: Partial<WizardDraft> = { knowledge_doc_ids: next };
    if (has) {
      patch.global_faq_doc_ids = draft.global_faq_doc_ids.filter((x) => x !== id);
    }
    onChange(patch);
  };

  const toggleGlobal = (id: string) => {
    const has = draft.global_faq_doc_ids.includes(id);
    const next = has
      ? draft.global_faq_doc_ids.filter((x) => x !== id)
      : [...draft.global_faq_doc_ids, id];
    onChange({ global_faq_doc_ids: next });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--ws-text-muted)]">
        Pick the knowledge docs the bot may pull from for this campaign. Optionally mark
        a doc as a global FAQ — global FAQs are searchable from any campaign.
      </p>

      {draft.knowledge_doc_ids.length === 0 && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
          No knowledge selected. The bot will only have offer brief + objections to draw
          from. Add at least one doc unless that's intentional.
        </div>
      )}

      <div className="space-y-2">
        {docs.map((doc) => {
          const selected = draft.knowledge_doc_ids.includes(doc.id);
          const isGlobal = draft.global_faq_doc_ids.includes(doc.id);
          return (
            <div
              key={doc.id}
              className="rounded-lg border border-[var(--ws-border)] bg-white p-3"
            >
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleDoc(doc.id)}
                />
                <span className="text-sm font-medium text-[var(--ws-text-primary)]">
                  {doc.title}
                </span>
              </label>
              <label className="mt-2 flex items-center gap-2 pl-7">
                <input
                  type="checkbox"
                  checked={isGlobal}
                  disabled={!selected}
                  onChange={() => toggleGlobal(doc.id)}
                  aria-label={`Mark "${doc.title}" as global FAQ`}
                />
                <span className="text-xs text-[var(--ws-text-muted)]">
                  Mark as global FAQ (visible to all campaigns)
                </span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/step-knowledge.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/campaigns/wizard/StepKnowledge.tsx tests/unit/step-knowledge.test.tsx
git commit -m "feat(ui): wizard step 4 — campaign knowledge scoping"
```

---

## Task 7: StepRules component (Step 5)

**Files:**
- Create: `src/components/dashboard/campaigns/wizard/StepRules.tsx`
- Test: `tests/unit/step-rules.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/step-rules.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StepRules from "@/components/dashboard/campaigns/wizard/StepRules";
import { EMPTY_DRAFT } from "@/components/dashboard/campaigns/wizard/types";

describe("StepRules", () => {
  const onChange = vi.fn();
  beforeEach(() => onChange.mockClear());

  it("renders an Add Rule button when empty", () => {
    render(<StepRules draft={EMPTY_DRAFT} onChange={onChange} />);
    expect(screen.getByRole("button", { name: /add rule/i })).toBeInTheDocument();
  });

  it("adds a blank rule on Add Rule click", async () => {
    const user = userEvent.setup();
    render(<StepRules draft={EMPTY_DRAFT} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /add rule/i }));
    expect(onChange).toHaveBeenCalledWith({ campaign_rules: [""] });
  });

  it("emits patch when a rule is edited", async () => {
    const user = userEvent.setup();
    render(
      <StepRules draft={{ ...EMPTY_DRAFT, campaign_rules: ["a"] }} onChange={onChange} />
    );
    await user.type(screen.getByDisplayValue("a"), "b");
    expect(onChange).toHaveBeenLastCalledWith({ campaign_rules: ["ab"] });
  });

  it("removes a rule on Remove click", async () => {
    const user = userEvent.setup();
    render(
      <StepRules
        draft={{ ...EMPTY_DRAFT, campaign_rules: ["a", "b"] }}
        onChange={onChange}
      />
    );
    await user.click(screen.getAllByRole("button", { name: /remove/i })[0]);
    expect(onChange).toHaveBeenCalledWith({ campaign_rules: ["b"] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/step-rules.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `StepRules`**

```tsx
// src/components/dashboard/campaigns/wizard/StepRules.tsx
"use client";

import type { WizardDraft } from "./types";

interface Props {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
}

export default function StepRules({ draft, onChange }: Props) {
  const inputClass =
    "w-full rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]";

  const updateAt = (index: number, value: string) => {
    const next = draft.campaign_rules.map((r, i) => (i === index ? value : r));
    onChange({ campaign_rules: next });
  };

  const removeAt = (index: number) => {
    onChange({ campaign_rules: draft.campaign_rules.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--ws-text-muted)]">
        Optional. Hard guardrails appended to every prompt — one short sentence each.
      </p>
      <div className="space-y-2">
        {draft.campaign_rules.map((rule, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              className={inputClass}
              value={rule}
              onChange={(e) => updateAt(index, e.target.value)}
              placeholder="e.g. Never quote prices in chat. Always send to the pricing page."
            />
            <button
              type="button"
              onClick={() => removeAt(index)}
              className="text-sm text-red-500 hover:text-red-700"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange({ campaign_rules: [...draft.campaign_rules, ""] })}
        className="text-sm text-[var(--ws-accent)] hover:underline"
      >
        + Add Rule
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/step-rules.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/campaigns/wizard/StepRules.tsx tests/unit/step-rules.test.tsx
git commit -m "feat(ui): wizard step 5 — campaign rules"
```

---

## Task 8: AwarenessLadderWizard orchestrator

**Files:**
- Create: `src/components/dashboard/campaigns/AwarenessLadderWizard.tsx`
- Test: `tests/unit/awareness-wizard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/awareness-wizard.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AwarenessLadderWizard from "@/components/dashboard/campaigns/AwarenessLadderWizard";

const ACTION_PAGES = [{ id: "ap-1", name: "Buy Plan", goal: "SELL" }];
const DOCS = [{ id: "d1", title: "Pricing", is_global_faq: false }];

describe("AwarenessLadderWizard", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/action-pages")) {
          return new Response(JSON.stringify({ action_pages: ACTION_PAGES }), {
            status: 200,
          });
        }
        if (url.includes("/api/knowledge-docs")) {
          return new Response(JSON.stringify({ docs: DOCS }), { status: 200 });
        }
        if (url === "/api/campaigns" || url.endsWith("/api/campaigns")) {
          return new Response(
            JSON.stringify({ campaign: { id: "c-new" } }),
            { status: 200 }
          );
        }
        return new Response("not found", { status: 404 });
      })
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("starts on step 1 (Goal & funnel)", async () => {
    render(<AwarenessLadderWizard onCreated={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/goal & funnel/i)).toBeInTheDocument()
    );
  });

  it("blocks Next on step 1 until name and primary action page are set", async () => {
    const user = userEvent.setup();
    render(<AwarenessLadderWizard onCreated={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByLabelText(/campaign name/i)).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    await user.type(screen.getByLabelText(/campaign name/i), "Test");
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText(/primary action page/i), "ap-1");
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
  });

  it("walks through all 5 steps and submits", async () => {
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<AwarenessLadderWizard onCreated={onCreated} />);
    await waitFor(() =>
      expect(screen.getByLabelText(/campaign name/i)).toBeInTheDocument()
    );

    await user.type(screen.getByLabelText(/campaign name/i), "Test Camp");
    await user.selectOptions(screen.getByLabelText(/primary action page/i), "ap-1");
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 2
    await user.type(screen.getByLabelText(/dream outcome/i), "Outcome");
    await user.type(screen.getByLabelText(/core pain/i), "Pain");
    await user.type(screen.getByLabelText(/why us/i), "Why");
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 3 — add 3 templates
    await user.click(screen.getByRole("button", { name: /money/i }));
    await user.click(screen.getByRole("button", { name: /time/i }));
    await user.click(screen.getByRole("button", { name: /trust/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 4
    await user.click(screen.getByLabelText(/pricing/i));
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 5
    await user.click(screen.getByRole("button", { name: /create campaign/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("c-new"));

    const fetchCalls = (fetch as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls;
    const post = fetchCalls.find(
      ([url, init]) => url === "/api/campaigns" && init?.method === "POST"
    );
    expect(post).toBeDefined();
    const body = JSON.parse(post![1].body as string);
    expect(body).toMatchObject({
      name: "Test Camp",
      optimization_goal: "SELL",
      funnel_type: "direct",
      primary_action_page_id: "ap-1",
      knowledge_doc_ids: ["d1"],
    });
    expect(body.top_objections).toHaveLength(3);
  });

  it("Back button moves to previous step", async () => {
    const user = userEvent.setup();
    render(<AwarenessLadderWizard onCreated={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByLabelText(/campaign name/i)).toBeInTheDocument()
    );
    await user.type(screen.getByLabelText(/campaign name/i), "X");
    await user.selectOptions(screen.getByLabelText(/primary action page/i), "ap-1");
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByLabelText(/dream outcome/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByLabelText(/campaign name/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/awareness-wizard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `AwarenessLadderWizard`**

```tsx
// src/components/dashboard/campaigns/AwarenessLadderWizard.tsx
"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import StepGoalFunnel from "./wizard/StepGoalFunnel";
import StepOfferBrief from "./wizard/StepOfferBrief";
import StepObjections from "./wizard/StepObjections";
import StepKnowledge from "./wizard/StepKnowledge";
import StepRules from "./wizard/StepRules";
import {
  EMPTY_DRAFT,
  type WizardDraft,
  type ActionPageOption,
  type KnowledgeDocOption,
} from "./wizard/types";

interface Props {
  onCreated: (campaignId: string) => void;
}

const STEP_TITLES = [
  "Goal & funnel",
  "Offer brief",
  "Top objections",
  "Knowledge",
  "Campaign rules",
] as const;

export default function AwarenessLadderWizard({ onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<WizardDraft>(EMPTY_DRAFT);
  const [actionPages, setActionPages] = useState<ActionPageOption[]>([]);
  const [docs, setDocs] = useState<KnowledgeDocOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [apRes, kdRes] = await Promise.all([
        fetch("/api/action-pages"),
        fetch("/api/knowledge-docs"),
      ]);
      if (apRes.ok) {
        const data = await apRes.json();
        setActionPages(data.action_pages ?? []);
      }
      if (kdRes.ok) {
        const data = await kdRes.json();
        setDocs(data.docs ?? []);
      }
    })();
  }, []);

  const update = (patch: Partial<WizardDraft>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const stepValid = (): boolean => {
    if (step === 0) {
      if (!draft.name.trim()) return false;
      if (!draft.primary_action_page_id) return false;
      if (draft.funnel_type === "qualify_first" && !draft.qualifier_action_page_id)
        return false;
      return true;
    }
    if (step === 1) {
      const o = draft.offer_brief;
      return Boolean(o.dream_outcome && o.core_pain && o.why_us);
    }
    if (step === 2) {
      return draft.top_objections.length >= 3;
    }
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          goal: "form_submit",
          optimization_goal: draft.optimization_goal,
          funnel_type: draft.funnel_type,
          primary_action_page_id: draft.primary_action_page_id,
          qualifier_action_page_id: draft.qualifier_action_page_id,
          offer_brief: draft.offer_brief,
          top_objections: draft.top_objections,
          campaign_rules: draft.campaign_rules.filter((r) => r.trim()),
          knowledge_doc_ids: draft.knowledge_doc_ids,
          global_faq_doc_ids: draft.global_faq_doc_ids,
        }),
      });
      if (!res.ok) {
        setError("Failed to create campaign");
        return;
      }
      const data = await res.json();
      onCreated(data.campaign.id);
    } catch {
      setError("Failed to create campaign");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        {STEP_TITLES.map((title, i) => (
          <div
            key={title}
            className={`flex-1 rounded-md px-3 py-2 text-xs font-medium ${
              i === step
                ? "bg-[var(--ws-accent)] text-white"
                : i < step
                  ? "bg-[var(--ws-accent-subtle)] text-[var(--ws-accent)]"
                  : "bg-[var(--ws-border)] text-[var(--ws-text-muted)]"
            }`}
          >
            {i + 1}. {title}
          </div>
        ))}
      </div>

      <h2 className="text-lg font-semibold text-[var(--ws-text-primary)]">
        {STEP_TITLES[step]}
      </h2>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      {step === 0 && (
        <StepGoalFunnel draft={draft} onChange={update} actionPages={actionPages} />
      )}
      {step === 1 && <StepOfferBrief draft={draft} onChange={update} />}
      {step === 2 && <StepObjections draft={draft} onChange={update} />}
      {step === 3 && <StepKnowledge draft={draft} onChange={update} docs={docs} />}
      {step === 4 && <StepRules draft={draft} onChange={update} />}

      <div className="flex items-center justify-between border-t border-[var(--ws-border)] pt-4">
        <Button
          variant="secondary"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          Back
        </Button>
        {step < STEP_TITLES.length - 1 ? (
          <Button
            variant="primary"
            onClick={() => setStep((s) => s + 1)}
            disabled={!stepValid()}
          >
            Next
          </Button>
        ) : (
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating…" : "Create Campaign"}
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/awareness-wizard.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/campaigns/AwarenessLadderWizard.tsx tests/unit/awareness-wizard.test.tsx
git commit -m "feat(ui): awareness ladder wizard orchestrator"
```

---

## Task 9: Wire wizard into the New Campaign page

**Files:**
- Modify: `src/app/(tenant)/app/campaigns/new/page.tsx` (full rewrite)

- [ ] **Step 1: Replace the page**

```tsx
// src/app/(tenant)/app/campaigns/new/page.tsx
"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AwarenessLadderWizard from "@/components/dashboard/campaigns/AwarenessLadderWizard";

export default function NewCampaignPage() {
  const router = useRouter();

  return (
    <div className="p-6 pt-14 md:pt-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/app/campaigns"
          className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold text-[var(--ws-text-primary)]">
          New Campaign
        </h1>
      </div>

      <AwarenessLadderWizard
        onCreated={(id) => router.push(`/app/campaigns/${id}`)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(tenant)/app/campaigns/new/page.tsx'
git commit -m "feat(ui): use awareness ladder wizard on /campaigns/new"
```

---

## Task 10: AwarenessStrategyPreview (read-only Layer D panel)

**Files:**
- Create: `src/components/dashboard/campaigns/AwarenessStrategyPreview.tsx`
- Test: `tests/unit/awareness-strategy-preview.test.tsx`

This component imports `renderPhaseStrategy` and `AwarenessLevel` from Plan 1. If Plan 1 has not yet exposed `renderPhaseStrategy(level, campaign)`, the engineer adds a one-line re-export to `src/lib/ai/phase-templates.ts` matching the signature below.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/awareness-strategy-preview.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AwarenessStrategyPreview from "@/components/dashboard/campaigns/AwarenessStrategyPreview";
import type { Campaign } from "@/hooks/useCampaigns";

vi.mock("@/lib/ai/phase-templates", () => ({
  renderPhaseStrategy: (level: string) => `STRATEGY for ${level}`,
}));

const baseCampaign: Campaign = {
  id: "c1",
  tenant_id: "t1",
  name: "Test",
  description: null,
  goal: "form_submit",
  goal_config: {},
  is_primary: false,
  status: "draft",
  follow_up_delay_minutes: 60,
  follow_up_message: null,
  campaign_plan: null,
  campaign_rules: [],
  phase_mode: "awareness_ladder",
  optimization_goal: "SELL",
  funnel_type: "direct",
  primary_action_page_id: "ap-1",
  qualifier_action_page_id: null,
  offer_brief: { dream_outcome: "A", core_pain: "B", why_us: "C" },
  top_objections: [],
  created_at: "",
  updated_at: "",
};

describe("AwarenessStrategyPreview", () => {
  it("renders all five awareness rungs", () => {
    render(<AwarenessStrategyPreview campaign={baseCampaign} />);
    expect(screen.getByText(/unaware/i)).toBeInTheDocument();
    expect(screen.getByText(/problem-aware/i)).toBeInTheDocument();
    expect(screen.getByText(/solution-aware/i)).toBeInTheDocument();
    expect(screen.getByText(/product-aware/i)).toBeInTheDocument();
    expect(screen.getByText(/most-aware/i)).toBeInTheDocument();
  });

  it("renders the rendered strategy text per rung", () => {
    render(<AwarenessStrategyPreview campaign={baseCampaign} />);
    expect(screen.getByText(/STRATEGY for UNAWARE/)).toBeInTheDocument();
    expect(screen.getByText(/STRATEGY for MOST_AWARE/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/awareness-strategy-preview.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `AwarenessStrategyPreview`**

```tsx
// src/components/dashboard/campaigns/AwarenessStrategyPreview.tsx
"use client";

import type { Campaign } from "@/hooks/useCampaigns";
import { renderPhaseStrategy } from "@/lib/ai/phase-templates";

const RUNGS: { level: "UNAWARE" | "PROBLEM_AWARE" | "SOLUTION_AWARE" | "PRODUCT_AWARE" | "MOST_AWARE"; label: string }[] = [
  { level: "UNAWARE", label: "Unaware" },
  { level: "PROBLEM_AWARE", label: "Problem-aware" },
  { level: "SOLUTION_AWARE", label: "Solution-aware" },
  { level: "PRODUCT_AWARE", label: "Product-aware" },
  { level: "MOST_AWARE", label: "Most-aware" },
];

export default function AwarenessStrategyPreview({ campaign }: { campaign: Campaign }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--ws-text-primary)]">
          Phase strategies (read-only)
        </h3>
        <p className="mt-1 text-xs text-[var(--ws-text-muted)]">
          Auto-generated from your offer brief, objections, and campaign rules. The bot
          will see the matching block when it labels a lead at that awareness rung.
        </p>
      </div>

      <div className="space-y-3">
        {RUNGS.map(({ level, label }) => (
          <details
            key={level}
            className="rounded-lg border border-[var(--ws-border)] bg-white p-3"
          >
            <summary className="cursor-pointer text-sm font-medium text-[var(--ws-text-primary)]">
              {label}
            </summary>
            <pre className="mt-3 whitespace-pre-wrap rounded-md bg-[var(--ws-accent-subtle)] p-3 text-xs text-[var(--ws-text-primary)]">
              {renderPhaseStrategy(level, campaign)}
            </pre>
          </details>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/awareness-strategy-preview.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/campaigns/AwarenessStrategyPreview.tsx tests/unit/awareness-strategy-preview.test.tsx
git commit -m "feat(ui): read-only awareness strategy preview panel"
```

---

## Task 11: ConvertToLadderButton

**Files:**
- Create: `src/components/dashboard/campaigns/ConvertToLadderButton.tsx`
- Test: `tests/unit/convert-to-ladder-button.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/convert-to-ladder-button.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConvertToLadderButton from "@/components/dashboard/campaigns/ConvertToLadderButton";

describe("ConvertToLadderButton", () => {
  const onConverted = vi.fn();

  beforeEach(() => {
    onConverted.mockClear();
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              campaign: { id: "c1", phase_mode: "awareness_ladder" },
            }),
            { status: 200 }
          )
      )
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders the button", () => {
    render(<ConvertToLadderButton campaignId="c1" onConverted={onConverted} />);
    expect(
      screen.getByRole("button", { name: /convert to ladder/i })
    ).toBeInTheDocument();
  });

  it("calls the convert endpoint and onConverted on success", async () => {
    const user = userEvent.setup();
    render(<ConvertToLadderButton campaignId="c1" onConverted={onConverted} />);
    await user.click(screen.getByRole("button", { name: /convert to ladder/i }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/campaigns/c1/convert-to-ladder",
        expect.objectContaining({ method: "POST" })
      )
    );
    await waitFor(() => expect(onConverted).toHaveBeenCalledOnce());
  });

  it("does not call API when confirm returns false", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const user = userEvent.setup();
    render(<ConvertToLadderButton campaignId="c1" onConverted={onConverted} />);
    await user.click(screen.getByRole("button", { name: /convert to ladder/i }));
    expect(fetch).not.toHaveBeenCalled();
    expect(onConverted).not.toHaveBeenCalled();
  });

  it("shows error when API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 }))
    );
    const user = userEvent.setup();
    render(<ConvertToLadderButton campaignId="c1" onConverted={onConverted} />);
    await user.click(screen.getByRole("button", { name: /convert to ladder/i }));
    await waitFor(() =>
      expect(screen.getByText(/failed to convert/i)).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/convert-to-ladder-button.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ConvertToLadderButton`**

```tsx
// src/components/dashboard/campaigns/ConvertToLadderButton.tsx
"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

interface Props {
  campaignId: string;
  onConverted: () => void;
}

export default function ConvertToLadderButton({ campaignId, onConverted }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    const ok = window.confirm(
      "Converting will replace this campaign's phases with the 5 awareness rungs. Existing phase content will be removed. Continue?"
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/convert-to-ladder`, {
        method: "POST",
      });
      if (!res.ok) {
        setError("Failed to convert campaign");
        return;
      }
      onConverted();
    } catch {
      setError("Failed to convert campaign");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button variant="secondary" onClick={handleClick} disabled={busy}>
        {busy ? "Converting…" : "Convert to ladder"}
      </Button>
      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/convert-to-ladder-button.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/campaigns/ConvertToLadderButton.tsx tests/unit/convert-to-ladder-button.test.tsx
git commit -m "feat(ui): convert-to-ladder action button"
```

---

## Task 12: Gate the editor based on `phase_mode`

**Files:**
- Modify: `src/app/(tenant)/app/campaigns/[id]/CampaignEditorClient.tsx` (full rewrite)

The editor:
- For `phase_mode='awareness_ladder'`: Flow tab shows `AwarenessStrategyPreview`; Settings tab shows the same wizard steps inline (offer brief, objections, knowledge, rules) reusing the step components already built.
- For `phase_mode='custom'`: keeps the existing `CampaignFlowPanel` (per-phase editor) and existing `CampaignForm`, plus shows a `ConvertToLadderButton` at the top of Settings.

For step reuse in edit-mode, we add a small wrapper `AwarenessLadderEditor` instead of a second wizard.

- [ ] **Step 1: Create the editor wrapper**

Create `src/components/dashboard/campaigns/AwarenessLadderEditor.tsx`:

```tsx
// src/components/dashboard/campaigns/AwarenessLadderEditor.tsx
"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import StepGoalFunnel from "./wizard/StepGoalFunnel";
import StepOfferBrief from "./wizard/StepOfferBrief";
import StepObjections from "./wizard/StepObjections";
import StepKnowledge from "./wizard/StepKnowledge";
import StepRules from "./wizard/StepRules";
import {
  type WizardDraft,
  type ActionPageOption,
  type KnowledgeDocOption,
} from "./wizard/types";
import type { Campaign } from "@/hooks/useCampaigns";

interface Props {
  campaign: Campaign;
  onSave: (updates: Partial<Campaign> & {
    knowledge_doc_ids?: string[];
    global_faq_doc_ids?: string[];
  }) => Promise<void>;
}

function campaignToDraft(c: Campaign, knowledgeIds: string[], globalIds: string[]): WizardDraft {
  return {
    name: c.name,
    optimization_goal: c.optimization_goal ?? "SELL",
    funnel_type: c.funnel_type,
    primary_action_page_id: c.primary_action_page_id,
    qualifier_action_page_id: c.qualifier_action_page_id,
    offer_brief: c.offer_brief ?? { dream_outcome: "", core_pain: "", why_us: "" },
    top_objections: c.top_objections ?? [],
    campaign_rules: c.campaign_rules ?? [],
    knowledge_doc_ids: knowledgeIds,
    global_faq_doc_ids: globalIds,
  };
}

export default function AwarenessLadderEditor({ campaign, onSave }: Props) {
  const [actionPages, setActionPages] = useState<ActionPageOption[]>([]);
  const [docs, setDocs] = useState<KnowledgeDocOption[]>([]);
  const [draft, setDraft] = useState<WizardDraft>(() =>
    campaignToDraft(campaign, [], [])
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [apRes, kdRes, scopedRes] = await Promise.all([
        fetch("/api/action-pages"),
        fetch("/api/knowledge-docs"),
        fetch(`/api/campaigns/${campaign.id}/knowledge-docs`),
      ]);
      const apData = apRes.ok ? await apRes.json() : { action_pages: [] };
      const kdData = kdRes.ok ? await kdRes.json() : { docs: [] };
      const scoped = scopedRes.ok
        ? await scopedRes.json()
        : { knowledge_doc_ids: [], global_faq_doc_ids: [] };
      setActionPages(apData.action_pages ?? []);
      setDocs(kdData.docs ?? []);
      setDraft(
        campaignToDraft(
          campaign,
          scoped.knowledge_doc_ids ?? [],
          scoped.global_faq_doc_ids ?? []
        )
      );
    })();
  }, [campaign]);

  const update = (patch: Partial<WizardDraft>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        name: draft.name,
        optimization_goal: draft.optimization_goal,
        funnel_type: draft.funnel_type,
        primary_action_page_id: draft.primary_action_page_id,
        qualifier_action_page_id: draft.qualifier_action_page_id,
        offer_brief: draft.offer_brief,
        top_objections: draft.top_objections,
        campaign_rules: draft.campaign_rules.filter((r) => r.trim()),
        knowledge_doc_ids: draft.knowledge_doc_ids,
        global_faq_doc_ids: draft.global_faq_doc_ids,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <h2 className="mb-3 text-base font-semibold text-[var(--ws-text-primary)]">
          Goal & funnel
        </h2>
        <StepGoalFunnel draft={draft} onChange={update} actionPages={actionPages} />
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold text-[var(--ws-text-primary)]">
          Offer brief
        </h2>
        <StepOfferBrief draft={draft} onChange={update} />
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold text-[var(--ws-text-primary)]">
          Top objections
        </h2>
        <StepObjections draft={draft} onChange={update} />
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold text-[var(--ws-text-primary)]">
          Knowledge
        </h2>
        <StepKnowledge draft={draft} onChange={update} docs={docs} />
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold text-[var(--ws-text-primary)]">
          Campaign rules
        </h2>
        <StepRules draft={draft} onChange={update} />
      </section>

      <Button variant="primary" onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save campaign"}
      </Button>
    </div>
  );
}
```

Note: `/api/campaigns/[id]/knowledge-docs` is provided by Plan 1. If it returns a different shape, swap field names; no other UI logic depends on it.

- [ ] **Step 2: Rewrite `CampaignEditorClient.tsx`**

```tsx
// src/app/(tenant)/app/campaigns/[id]/CampaignEditorClient.tsx
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, Settings, BarChart3, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";
import CampaignFlowPanel from "@/components/dashboard/campaigns/CampaignFlowPanel";
import CampaignForm from "@/components/dashboard/campaigns/CampaignForm";
import PhaseMetricsFunnel from "@/components/dashboard/campaigns/PhaseMetricsFunnel";
import AwarenessLadderEditor from "@/components/dashboard/campaigns/AwarenessLadderEditor";
import AwarenessStrategyPreview from "@/components/dashboard/campaigns/AwarenessStrategyPreview";
import ConvertToLadderButton from "@/components/dashboard/campaigns/ConvertToLadderButton";
import type { Campaign } from "@/hooks/useCampaigns";

type Tab = "flow" | "settings" | "metrics";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "flow", label: "Flow", icon: GitBranch },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "metrics", label: "Metrics", icon: BarChart3 },
];

export default function CampaignEditorClient({
  campaign: initialCampaign,
}: {
  campaign: Campaign;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("flow");
  const [campaign, setCampaign] = useState(initialCampaign);

  const handleSave = useCallback(
    async (updates: Partial<Campaign> & {
      knowledge_doc_ids?: string[];
      global_faq_doc_ids?: string[];
    }) => {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      setCampaign(data.campaign);
    },
    [campaign.id]
  );

  const isLadder = campaign.phase_mode === "awareness_ladder";

  return (
    <div className="p-6 pt-14 md:pt-6">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/app/campaigns"
          className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold text-[var(--ws-text-primary)]">
          {campaign.name}
        </h1>
        <span className="ml-2 rounded-md bg-[var(--ws-accent-subtle)] px-2 py-0.5 text-xs text-[var(--ws-accent)]">
          {isLadder ? "Awareness ladder" : "Custom phases"}
        </span>
      </div>

      <div className="mb-6 flex gap-0 border-b border-[var(--ws-border)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-b-2 border-[var(--ws-accent)] text-[var(--ws-accent)]"
                : "text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]"
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "flow" &&
        (isLadder ? (
          <AwarenessStrategyPreview campaign={campaign} />
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--ws-border)] bg-[var(--ws-accent-subtle)] p-3">
              <p className="text-sm text-[var(--ws-text-primary)]">
                This campaign runs on legacy custom phases. Convert to the awareness
                ladder for predictable, Hormozi-derived phase strategies.
              </p>
              <div className="mt-2">
                <ConvertToLadderButton
                  campaignId={campaign.id}
                  onConverted={() => router.refresh()}
                />
              </div>
            </div>
            <CampaignFlowPanel campaignId={campaign.id} />
          </div>
        ))}

      {tab === "settings" &&
        (isLadder ? (
          <AwarenessLadderEditor campaign={campaign} onSave={handleSave} />
        ) : (
          <CampaignForm campaign={campaign} onSave={handleSave} />
        ))}

      {tab === "metrics" && <PhaseMetricsFunnel campaignId={campaign.id} />}
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run all unit tests**

Run: `npm test -- tests/unit/`
Expected: PASS (existing tests + the 7 new wizard/editor tests).

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(tenant)/app/campaigns/[id]/CampaignEditorClient.tsx' src/components/dashboard/campaigns/AwarenessLadderEditor.tsx
git commit -m "feat(ui): gate campaign editor on phase_mode (ladder vs custom)"
```

---

## Task 13: E2E test — awareness ladder happy path + bug-scenario regression

**Files:**
- Create: `tests/e2e/awareness-ladder.spec.ts`

This test mirrors the spec's E2E requirement: tenant creates a `qualify_first` campaign with offer brief + 3 objections + scoped docs and publishes; a simulated Messenger conversation walks the awareness ladder; the bot does NOT drill discovery on `PROBLEM_AWARE`; the WhatStage-selling-style "I run ads" message does NOT trigger ad-setup discovery.

The test uses two seams already exposed in the codebase: the `/login` flow used by `tests/e2e/campaigns.spec.ts`, and a Messenger-simulation HTTP endpoint used by `tests/e2e/flow-builder-full.spec.ts`. If the simulation endpoint is named differently in the running branch (`/api/test-chat` is the current name in `tests/unit/test-chat-api.test.ts`), the engineer renames the URL at the call site only — the assertions stay the same.

- [ ] **Step 1: Write the E2E test**

```ts
// tests/e2e/awareness-ladder.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Awareness Ladder Campaign — end-to-end", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    // Reuse the same auth pattern used by tests/e2e/campaigns.spec.ts.
    // If that file uses storage state or a programmatic login helper,
    // the engineer wires the same here.
  });

  test("tenant builds a qualify_first ladder campaign and the bot does not drill discovery", async ({
    page,
    request,
  }) => {
    // Step A: navigate to wizard
    await page.goto("/app/campaigns/new");
    await expect(page.getByRole("heading", { name: /new campaign/i })).toBeVisible();

    // Step 1: Goal & funnel
    await page.getByLabel(/campaign name/i).fill("E2E Awareness Ladder");
    await page.getByLabel(/sell/i).check();
    await page.getByLabel(/qualify first/i).check();
    // Pick the first available primary page
    const primary = page.getByLabel(/primary action page/i);
    await primary.selectOption({ index: 1 });
    const qualifier = page.getByLabel(/qualifier action page/i);
    await qualifier.selectOption({ index: 1 });
    await page.getByRole("button", { name: /next/i }).click();

    // Step 2: Offer brief
    await page
      .getByLabel(/dream outcome/i)
      .fill("A predictable pipeline of qualified leads from Messenger.");
    await page
      .getByLabel(/core pain/i)
      .fill("Leads ghost after the first DM and there's no follow-up system.");
    await page
      .getByLabel(/why us/i)
      .fill("AI bot + action pages so every lead is captured and routed.");
    await page.getByRole("button", { name: /next/i }).click();

    // Step 3: Top objections — add three Hormozi templates
    await page.getByRole("button", { name: /money/i }).click();
    await page.getByRole("button", { name: /time/i }).click();
    await page.getByRole("button", { name: /trust/i }).click();
    await page.getByRole("button", { name: /next/i }).click();

    // Step 4: Knowledge — pick first doc
    const firstDoc = page.locator('input[type="checkbox"]').first();
    await firstDoc.check();
    await page.getByRole("button", { name: /next/i }).click();

    // Step 5: Rules — leave empty, submit
    await page.getByRole("button", { name: /create campaign/i }).click();
    await expect(page).toHaveURL(/\/app\/campaigns\/[a-f0-9-]+/);

    // Capture campaign id from URL
    const campaignId = page.url().split("/").pop()!;

    // Publish: open Settings, set status to active via PATCH
    await request.patch(`/api/campaigns/${campaignId}`, {
      data: { status: "active" },
    });

    // Step B: Simulated Messenger conversation
    // Use the /api/test-chat endpoint (same one tests/unit/test-chat-api.test.ts exercises)
    const sendChat = async (message: string) => {
      const res = await request.post(`/api/test-chat`, {
        data: { campaign_id: campaignId, message },
      });
      expect(res.ok()).toBeTruthy();
      return (await res.json()) as {
        reply: string;
        detected_awareness: string;
        action_page_id: string | null;
      };
    };

    // PROBLEM_AWARE message — should NOT drill discovery (no question stack about ad setup)
    const turn1 = await sendChat(
      "Honestly my leads ghost after the first DM and I'm losing money."
    );
    expect(turn1.detected_awareness).toBe("PROBLEM_AWARE");
    // Spec assertion: do not drill discovery on PROBLEM_AWARE
    expect(turn1.reply.toLowerCase()).not.toMatch(
      /tell me (more about|about your) (ad|funnel|targeting|audience)/
    );
    expect(turn1.action_page_id).toBeNull();

    // The exact bug scenario: "I run ads" — should NOT trigger ad-setup discovery
    const turn2 = await sendChat("I run ads on Facebook and Instagram.");
    expect(turn2.reply.toLowerCase()).not.toMatch(
      /(what (kind|type) of ads|who is your audience|what's your (cpa|budget|targeting))/
    );

    // MOST_AWARE message — bypasses qualifier even though funnel is qualify_first
    const turn3 = await sendChat("Send me the link, I'm in.");
    expect(turn3.detected_awareness).toBe("MOST_AWARE");
    expect(turn3.action_page_id).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the E2E test**

Run: `npx playwright test tests/e2e/awareness-ladder.spec.ts`
Expected: PASS. (Plan 1 wires the conversation engine; this test is the integration receipt.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/awareness-ladder.spec.ts
git commit -m "test(e2e): awareness ladder happy path + I-run-ads regression"
```

---

## Self-Review Notes

Performed against the spec's "Tenant UI" and migration-touching UI sections.

**Spec coverage:**
- 5-step form (Goal & funnel, Offer brief, Top objections, Knowledge, Rules) — Tasks 3–7 + orchestrator Task 8.
- `optimization_goal` radio + `funnel_type` radio + filtered primary dropdown + conditional qualifier dropdown — Task 3 (`StepGoalFunnel`).
- `dream_outcome`, `core_pain`, `why_us` (~1 sentence each) — Task 4 (`StepOfferBrief`).
- 3–5 objection repeating block + Hormozi 4 templates (money/time/fit/trust) — Tasks 2 + 5.
- Multi-select knowledge docs + per-doc global FAQ toggle + zero-doc warning — Task 6.
- Free-text bullet rules — Task 7.
- POST/PATCH wiring — Tasks 8 (`POST`) + 12 (`PATCH` via `AwarenessLadderEditor`).
- "Convert to ladder" button — Task 11 + integrated in Task 12 for `phase_mode='custom'` campaigns.
- Phase editor hidden in `awareness_ladder` mode — Task 12 (Flow tab branches on `isLadder`).
- Read-only "Preview phase strategies" panel — Task 10 + integrated in Task 12.
- E2E test for the bug scenario — Task 13.
- Component tests for each step — Tasks 3–7 each include a test file.

**Placeholder scan:** searched for "TBD", "TODO", "implement later", "similar to". None found. Two intentional dependency notes (`renderPhaseStrategy`, `/api/campaigns/[id]/knowledge-docs`) are explicitly attributed to Plan 1 with a fallback rename instruction if the names drift.

**Type consistency:** verified `WizardDraft` field names line up across Tasks 2–9. `onChange` patch signature `(patch: Partial<WizardDraft>) => void` is identical in every step component and the wizard. `Campaign` type extensions (Task 1) match field names referenced in `AwarenessLadderEditor` (Task 12) and `AwarenessStrategyPreview` (Task 10).

**Resolved ambiguity:** the spec did not specify the edit-mode UX for an existing ladder campaign. Resolved by introducing `AwarenessLadderEditor` (Task 12) — a flat (non-stepped) version of the wizard step components, which keeps the per-step components as the single source of truth.
