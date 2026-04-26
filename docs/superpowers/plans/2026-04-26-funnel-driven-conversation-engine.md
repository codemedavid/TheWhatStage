# Funnel-Driven Conversation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the chatbot (test-chat + production conversation engine) from `campaign_phases` to `campaign_funnels` so that campaigns built by the AI builder run end-to-end.

**Architecture:** Add funnel state columns to `conversations`. Build a `funnel-runtime` module that loads/initializes/advances funnels. Introduce a generic `StepContext` and refactor `prompt-builder` away from `CurrentPhase`. Both `conversation-engine.ts` and `test-chat/route.ts` switch to the funnel path. `phase-machine.ts` + `phase-templates.ts` are deleted. The test-chat route auto-seeds a 1-funnel default from the tenant's first published action page when no campaign is selected.

**Tech Stack:** Next.js (App Router), Supabase (Postgres + RLS), Zod, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-26-funnel-driven-conversation-engine.md`

**Out of scope:** action-submission webhook auto-advance wiring, stage progression, dropping `campaign_phases` / `bot_flow_phases` tables, admin UI updates beyond what compilation requires.

---

## File map

**New:**
- `supabase/migrations/0022_conversations_funnel_state.sql`
- `src/lib/ai/funnel-runtime.ts`
- `src/lib/ai/step-context.ts`
- `tests/unit/conversations-funnel-state-migration.test.ts`
- `tests/unit/funnel-runtime.test.ts`
- `tests/unit/step-context.test.ts`

**Modified:**
- `src/lib/ai/prompt-builder.ts` (replace `currentPhase: CurrentPhase` with `step: StepContext`)
- `src/lib/ai/conversation-engine.ts` (use funnel-runtime instead of phase-machine)
- `src/lib/ai/test-session.ts` (funnel-shaped session state)
- `src/app/api/bot/test-chat/route.ts` (load funnels, auto-seed default, support `simulateActionCompleted`)
- `tests/unit/prompt-builder.test.ts`, `tests/unit/prompt-builder-lead-context.test.ts`
- `tests/unit/conversation-engine.test.ts`, `tests/unit/conversation-engine-handoff.test.ts`, `tests/unit/conversation-engine-images.test.ts`
- `tests/unit/test-chat-api.test.ts`
- `tests/e2e/ai-builder-funnels.spec.ts`

**Deleted:**
- `src/lib/ai/phase-machine.ts`
- `src/lib/ai/phase-templates.ts`
- `tests/unit/phase-machine.test.ts`
- `tests/unit/phase-templates.test.ts`

---

## Task 1: Conversations funnel-state migration

**Files:**
- Create: `supabase/migrations/0022_conversations_funnel_state.sql`
- Test: `tests/unit/conversations-funnel-state-migration.test.ts`

- [ ] **Step 1: Write the migration test**

```ts
// tests/unit/conversations-funnel-state-migration.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("0022_conversations_funnel_state migration", () => {
  const sql = readFileSync(
    path.join(process.cwd(), "supabase/migrations/0022_conversations_funnel_state.sql"),
    "utf-8"
  );

  it("adds current_campaign_id column", () => {
    expect(sql).toMatch(/add column current_campaign_id\s+uuid/i);
    expect(sql).toMatch(/references campaigns\(id\)/i);
  });
  it("adds current_funnel_id column with on delete set null", () => {
    expect(sql).toMatch(/add column current_funnel_id\s+uuid/i);
    expect(sql).toMatch(/references campaign_funnels\(id\) on delete set null/i);
  });
  it("adds current_funnel_position with default 0", () => {
    expect(sql).toMatch(/current_funnel_position\s+integer not null default 0/i);
  });
  it("adds funnel_message_count with default 0", () => {
    expect(sql).toMatch(/funnel_message_count\s+integer not null default 0/i);
  });
  it("indexes current_campaign_id and current_funnel_id", () => {
    expect(sql).toMatch(/create index .* on conversations \(current_campaign_id\)/i);
    expect(sql).toMatch(/create index .* on conversations \(current_funnel_id\)/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/conversations-funnel-state-migration.test.ts`
Expected: FAIL — migration file does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0022_conversations_funnel_state.sql
alter table conversations
  add column current_campaign_id     uuid null references campaigns(id) on delete set null,
  add column current_funnel_id       uuid null references campaign_funnels(id) on delete set null,
  add column current_funnel_position integer not null default 0,
  add column funnel_message_count    integer not null default 0;

create index conversations_current_campaign_id_idx on conversations (current_campaign_id);
create index conversations_current_funnel_id_idx   on conversations (current_funnel_id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/conversations-funnel-state-migration.test.ts`
Expected: PASS.

- [ ] **Step 5: Apply migration locally and regenerate types**

Run: `npx supabase migration up && npm run db:types`
(If `db:types` is absent, regenerate via Supabase MCP or `supabase gen types typescript --local > src/types/database.ts`.)
Expected: `conversations` row type includes the four new columns.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0022_conversations_funnel_state.sql tests/unit/conversations-funnel-state-migration.test.ts src/types/database.ts
git commit -m "feat(db): add funnel state columns to conversations"
```

---

## Task 2: Funnel runtime module

**Files:**
- Create: `src/lib/ai/funnel-runtime.ts`
- Test: `tests/unit/funnel-runtime.test.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/unit/funnel-runtime.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  getOrInitFunnelState,
  advanceFunnel,
  incrementFunnelMessageCount,
  markFunnelCompletedByActionPage,
} from "@/lib/ai/funnel-runtime";
import type { CampaignFunnel } from "@/types/campaign-funnel";

const funnels: CampaignFunnel[] = [
  { id: "f0", campaignId: "c1", tenantId: "t1", position: 0, actionPageId: "p0", pageDescription: null, chatRules: ["r0"], createdAt: "n", updatedAt: "n" },
  { id: "f1", campaignId: "c1", tenantId: "t1", position: 1, actionPageId: "p1", pageDescription: null, chatRules: ["r1"], createdAt: "n", updatedAt: "n" },
];

function fakeService(initial: Record<string, unknown>) {
  const state = { ...initial };
  const select = vi.fn().mockReturnThis();
  const eq = vi.fn().mockReturnThis();
  const update = vi.fn().mockImplementation((patch: Record<string, unknown>) => {
    Object.assign(state, patch);
    return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) };
  });
  const single = vi.fn().mockResolvedValue({ data: state, error: null });
  return {
    state,
    from: vi.fn(() => ({ select, eq, update, single })),
  } as any;
}

describe("getOrInitFunnelState", () => {
  it("initializes when current_funnel_id is null", async () => {
    const svc = fakeService({
      current_campaign_id: null,
      current_funnel_id: null,
      current_funnel_position: 0,
      funnel_message_count: 0,
    });
    const state = await getOrInitFunnelState(svc, "conv1", "c1", funnels);
    expect(state.funnel.id).toBe("f0");
    expect(state.position).toBe(0);
  });

  it("re-initializes when campaign changes", async () => {
    const svc = fakeService({
      current_campaign_id: "OTHER",
      current_funnel_id: "fX",
      current_funnel_position: 2,
      funnel_message_count: 5,
    });
    const state = await getOrInitFunnelState(svc, "conv1", "c1", funnels);
    expect(state.funnel.id).toBe("f0");
    expect(state.position).toBe(0);
  });

  it("returns existing funnel when state matches", async () => {
    const svc = fakeService({
      current_campaign_id: "c1",
      current_funnel_id: "f1",
      current_funnel_position: 1,
      funnel_message_count: 3,
    });
    const state = await getOrInitFunnelState(svc, "conv1", "c1", funnels);
    expect(state.funnel.id).toBe("f1");
    expect(state.messageCount).toBe(3);
  });
});

describe("advanceFunnel", () => {
  it("advances from 0 to 1", async () => {
    const svc = fakeService({
      current_campaign_id: "c1",
      current_funnel_id: "f0",
      current_funnel_position: 0,
      funnel_message_count: 4,
    });
    const r = await advanceFunnel(svc, "conv1", funnels);
    expect(r.advanced).toBe(true);
    expect(r.completed).toBe(false);
    expect(r.funnel.id).toBe("f1");
    expect(r.position).toBe(1);
  });

  it("no-ops at last funnel and returns completed", async () => {
    const svc = fakeService({
      current_campaign_id: "c1",
      current_funnel_id: "f1",
      current_funnel_position: 1,
      funnel_message_count: 4,
    });
    const r = await advanceFunnel(svc, "conv1", funnels);
    expect(r.advanced).toBe(false);
    expect(r.completed).toBe(true);
    expect(r.funnel.id).toBe("f1");
  });
});

describe("markFunnelCompletedByActionPage", () => {
  it("advances when action page matches current funnel", async () => {
    const svc = fakeService({
      current_campaign_id: "c1",
      current_funnel_id: "f0",
      current_funnel_position: 0,
      funnel_message_count: 0,
    });
    const r = await markFunnelCompletedByActionPage(svc, "conv1", "p0", funnels);
    expect(r.advanced).toBe(true);
  });

  it("does nothing when action page does not match", async () => {
    const svc = fakeService({
      current_campaign_id: "c1",
      current_funnel_id: "f0",
      current_funnel_position: 0,
      funnel_message_count: 0,
    });
    const r = await markFunnelCompletedByActionPage(svc, "conv1", "p99", funnels);
    expect(r.advanced).toBe(false);
  });
});

describe("incrementFunnelMessageCount", () => {
  it("calls update with funnel_message_count + 1", async () => {
    const svc = fakeService({
      current_campaign_id: "c1",
      current_funnel_id: "f0",
      current_funnel_position: 0,
      funnel_message_count: 7,
    });
    await incrementFunnelMessageCount(svc, "conv1");
    expect(svc.state.funnel_message_count).toBe(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/funnel-runtime.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the runtime**

```ts
// src/lib/ai/funnel-runtime.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { CampaignFunnel } from "@/types/campaign-funnel";

type ServiceClient = SupabaseClient<Database>;

export interface FunnelState {
  funnel: CampaignFunnel;
  position: number;
  messageCount: number;
}

interface ConversationFunnelRow {
  current_campaign_id: string | null;
  current_funnel_id: string | null;
  current_funnel_position: number;
  funnel_message_count: number;
}

async function loadConversationRow(
  service: ServiceClient,
  conversationId: string
): Promise<ConversationFunnelRow> {
  const { data, error } = await service
    .from("conversations")
    .select("current_campaign_id, current_funnel_id, current_funnel_position, funnel_message_count")
    .eq("id", conversationId)
    .single();
  if (error || !data) {
    throw new Error(`Failed to load conversation ${conversationId}: ${error?.message ?? "missing"}`);
  }
  return data as unknown as ConversationFunnelRow;
}

export async function getOrInitFunnelState(
  service: ServiceClient,
  conversationId: string,
  campaignId: string,
  funnels: CampaignFunnel[]
): Promise<FunnelState> {
  if (funnels.length === 0) {
    throw new Error("Cannot init funnel state with empty funnels");
  }
  const row = await loadConversationRow(service, conversationId);

  const sameCampaign = row.current_campaign_id === campaignId;
  const knownFunnel = funnels.find((f) => f.id === row.current_funnel_id);

  if (sameCampaign && knownFunnel) {
    return {
      funnel: knownFunnel,
      position: row.current_funnel_position,
      messageCount: row.funnel_message_count,
    };
  }

  const first = funnels[0];
  await service
    .from("conversations")
    .update({
      current_campaign_id: campaignId,
      current_funnel_id: first.id,
      current_funnel_position: 0,
      funnel_message_count: 0,
    })
    .eq("id", conversationId);

  return { funnel: first, position: 0, messageCount: 0 };
}

export async function advanceFunnel(
  service: ServiceClient,
  conversationId: string,
  funnels: CampaignFunnel[]
): Promise<{ funnel: CampaignFunnel; position: number; advanced: boolean; completed: boolean }> {
  const row = await loadConversationRow(service, conversationId);
  const currentIndex = funnels.findIndex((f) => f.id === row.current_funnel_id);
  const idx = currentIndex < 0 ? 0 : currentIndex;

  if (idx >= funnels.length - 1) {
    return { funnel: funnels[idx], position: idx, advanced: false, completed: true };
  }

  const next = funnels[idx + 1];
  await service
    .from("conversations")
    .update({
      current_funnel_id: next.id,
      current_funnel_position: idx + 1,
      funnel_message_count: 0,
    })
    .eq("id", conversationId);

  return { funnel: next, position: idx + 1, advanced: true, completed: false };
}

export async function incrementFunnelMessageCount(
  service: ServiceClient,
  conversationId: string
): Promise<void> {
  const row = await loadConversationRow(service, conversationId);
  await service
    .from("conversations")
    .update({ funnel_message_count: row.funnel_message_count + 1 })
    .eq("id", conversationId);
}

export async function markFunnelCompletedByActionPage(
  service: ServiceClient,
  conversationId: string,
  actionPageId: string,
  funnels: CampaignFunnel[]
): Promise<{ advanced: boolean }> {
  const row = await loadConversationRow(service, conversationId);
  const current = funnels.find((f) => f.id === row.current_funnel_id);
  if (!current || current.actionPageId !== actionPageId) {
    return { advanced: false };
  }
  const result = await advanceFunnel(service, conversationId, funnels);
  return { advanced: result.advanced };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/funnel-runtime.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/funnel-runtime.ts tests/unit/funnel-runtime.test.ts
git commit -m "feat(ai): funnel-runtime module for conversation funnel state"
```

---

## Task 3: StepContext + funnelToStep helper

**Files:**
- Create: `src/lib/ai/step-context.ts`
- Test: `tests/unit/step-context.test.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/unit/step-context.test.ts
import { describe, it, expect } from "vitest";
import { funnelToStep, type StepContext } from "@/lib/ai/step-context";
import type { CampaignFunnel } from "@/types/campaign-funnel";

const funnels: CampaignFunnel[] = [
  { id: "f0", campaignId: "c1", tenantId: "t1", position: 0, actionPageId: "p0", pageDescription: "Lead magnet", chatRules: ["Lead with value", "Educate"], createdAt: "n", updatedAt: "n" },
  { id: "f1", campaignId: "c1", tenantId: "t1", position: 1, actionPageId: "p1", pageDescription: null, chatRules: ["Push to call"], createdAt: "n", updatedAt: "n" },
];

describe("funnelToStep", () => {
  it("formats name as 'Step N of M — page title'", () => {
    const step = funnelToStep({
      funnel: funnels[0],
      allFunnels: funnels,
      campaign: { goal: "form_submit" },
      page: { title: "Free Guide", type: "form" },
      tone: "friendly",
      messageCount: 2,
    });
    expect(step.name).toBe("Step 1 of 2 — Free Guide");
    expect(step.position).toBe(0);
    expect(step.total).toBe(2);
  });

  it("instructions concatenate all chat rules", () => {
    const step = funnelToStep({
      funnel: funnels[0],
      allFunnels: funnels,
      campaign: { goal: "form_submit" },
      page: { title: "Free Guide", type: "form" },
      tone: "friendly",
      messageCount: 0,
    });
    expect(step.instructions).toContain("Lead with value");
    expect(step.instructions).toContain("Educate");
  });

  it("instructions include page description when present", () => {
    const step = funnelToStep({
      funnel: funnels[0],
      allFunnels: funnels,
      campaign: { goal: "form_submit" },
      page: { title: "Free Guide", type: "form" },
      tone: "friendly",
      messageCount: 0,
    });
    expect(step.instructions.toLowerCase()).toContain("lead magnet");
  });

  it("omits page description block when null", () => {
    const step = funnelToStep({
      funnel: funnels[1],
      allFunnels: funnels,
      campaign: { goal: "appointment_booked" },
      page: { title: "Book a Call", type: "calendar" },
      tone: "friendly",
      messageCount: 0,
    });
    expect(step.instructions).not.toMatch(/page context/i);
  });

  it("actionButtonIds = [funnel.actionPageId]", () => {
    const step = funnelToStep({
      funnel: funnels[1],
      allFunnels: funnels,
      campaign: { goal: "appointment_booked" },
      page: { title: "Book a Call", type: "calendar" },
      tone: "friendly",
      messageCount: 0,
    });
    expect(step.actionButtonIds).toEqual(["p1"]);
  });

  it("transitionHint mentions sending the page when type is sales", () => {
    const step = funnelToStep({
      funnel: funnels[0],
      allFunnels: funnels,
      campaign: { goal: "purchase" },
      page: { title: "Coaching Sales", type: "sales" },
      tone: "friendly",
      messageCount: 0,
    });
    expect(step.transitionHint?.toLowerCase()).toMatch(/page|advance/);
  });

  it("default maxMessages is 8", () => {
    const step = funnelToStep({
      funnel: funnels[0],
      allFunnels: funnels,
      campaign: { goal: "form_submit" },
      page: { title: "Free Guide", type: "form" },
      tone: "friendly",
      messageCount: 0,
    });
    expect(step.maxMessages).toBe(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/step-context.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement step-context**

```ts
// src/lib/ai/step-context.ts
import type { CampaignFunnel } from "@/types/campaign-funnel";
import type { ActionPageType } from "@/lib/ai/funnel-templates";

export interface StepContext {
  name: string;
  position: number;
  total: number;
  instructions: string;
  tone: string;
  goal: string | null;
  transitionHint: string | null;
  messageCount: number;
  maxMessages: number;
  actionButtonIds: string[];
}

const DEFAULT_MAX_MESSAGES = 8;

const TRANSITION_HINTS: Record<ActionPageType, string> = {
  sales: "Advance once the lead has shown buying interest and you've sent the sales page.",
  form: "Advance once the lead is willing to fill the form and you've sent the page.",
  qualification: "Advance once the lead has answered the first qualifying question.",
  calendar: "Advance once the lead has agreed to book a call and you've sent the booking page.",
  product_catalog: "Advance once the lead has indicated a category and you've sent the catalog.",
  checkout: "Advance once the lead is ready to buy and you've sent the checkout page.",
};

const GOAL_DIRECTIONS: Record<string, string> = {
  purchase: "Get the lead to buy.",
  form_submit: "Get the lead to submit the form.",
  appointment_booked: "Get the lead to book an appointment.",
  stage_reached: "Move the lead to the next stage.",
};

export interface FunnelToStepInput {
  funnel: CampaignFunnel;
  allFunnels: CampaignFunnel[];
  campaign: { goal: string };
  page: { title: string; type: ActionPageType };
  tone: string;
  messageCount: number;
}

export function funnelToStep(input: FunnelToStepInput): StepContext {
  const { funnel, allFunnels, campaign, page, tone, messageCount } = input;
  const position = allFunnels.findIndex((f) => f.id === funnel.id);
  const total = allFunnels.length;

  const ruleLines = funnel.chatRules.map((r) => `- ${r}`).join("\n");
  const descBlock = funnel.pageDescription
    ? `\n\nPage context: ${funnel.pageDescription}`
    : "";
  const instructions = `Chat rules for this step:\n${ruleLines}${descBlock}`;

  return {
    name: `Step ${position + 1} of ${total} — ${page.title}`,
    position,
    total,
    instructions,
    tone,
    goal: GOAL_DIRECTIONS[campaign.goal] ?? null,
    transitionHint: TRANSITION_HINTS[page.type] ?? null,
    messageCount,
    maxMessages: DEFAULT_MAX_MESSAGES,
    actionButtonIds: [funnel.actionPageId],
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/step-context.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/step-context.ts tests/unit/step-context.test.ts
git commit -m "feat(ai): StepContext and funnelToStep helper"
```

---

## Task 4: Refactor prompt-builder to StepContext

This task replaces `currentPhase: CurrentPhase` with `step: StepContext`. After this task the codebase will not compile — Tasks 5–7 fix the consumers. Do them back-to-back.

**Files:**
- Modify: `src/lib/ai/prompt-builder.ts`
- Modify: `tests/unit/prompt-builder.test.ts`
- Modify: `tests/unit/prompt-builder-lead-context.test.ts`

- [ ] **Step 1: Update prompt-builder types and signature**

Edit `src/lib/ai/prompt-builder.ts`:

1. Remove `import type { CurrentPhase } from "@/lib/ai/phase-machine";` and add `import type { StepContext } from "@/lib/ai/step-context";`.
2. In `PromptContext`, change `currentPhase: CurrentPhase;` to `step: StepContext;`.
3. Rename `buildPhaseContext` to `buildStepContext` and rewrite its body:

```ts
function buildStepContext(step: StepContext, testMode: boolean): string {
  if (testMode) {
    return "--- CURRENT STEP ---\nTEST MODE — no active step. Respond based on retrieved knowledge and rules only.";
  }
  const lines = [
    `--- WHERE YOU ARE IN THE FUNNEL ---`,
    `${step.name}`,
    ``,
    step.instructions,
    `Vibe: ${step.tone}`,
  ];
  if (step.goal) lines.push(`Campaign goal: ${step.goal}`);
  if (step.transitionHint) lines.push(`When to move on: ${step.transitionHint}`);
  lines.push(`(You've exchanged ${step.messageCount} messages in this step — soft limit is ${step.maxMessages}, don't rush but don't linger either)`);
  if (step.position === 0) {
    lines.push(`\nEARLY CONVERSATION — keep replies to 1-2 short lines only. No walls of text. You're just getting to know them.`);
  }
  lines.push(
    "",
    "The step is guidance, not a rule. If the lead's intent clearly belongs to another step, respond to the lead's intent first. You may advance when the conversation naturally moves forward."
  );
  return lines.join("\n");
}
```

4. In `buildSystemPrompt`, replace `const layer6 = buildPhaseContext(ctx.currentPhase, ...)` with `const layer6 = buildStepContext(ctx.step, ctx.testMode ?? false);`.
5. Replace `ctx.currentPhase.actionButtonIds` with `ctx.step.actionButtonIds` in the action button lookup. The lookup must handle the case where the array is empty (return early — no buttons).

```ts
let actionButtons: ActionButtonInfo[] = [];
if (ctx.step.actionButtonIds.length > 0) {
  const { data: actionPages } = await supabase
    .from("action_pages")
    .select("id, title, type, cta_text")
    .eq("tenant_id", ctx.tenantId)
    .in("id", ctx.step.actionButtonIds);
  if (actionPages) actionButtons = actionPages as ActionButtonInfo[];
}
```

- [ ] **Step 2: Update existing prompt-builder tests**

Open `tests/unit/prompt-builder.test.ts` and `tests/unit/prompt-builder-lead-context.test.ts`. Replace any construction of `currentPhase: { ... }` with:

```ts
step: {
  name: "Step 1 of 1 — Test Step",
  position: 0,
  total: 1,
  instructions: "Chat rules for this step:\n- Be concise.",
  tone: "friendly",
  goal: null,
  transitionHint: null,
  messageCount: 0,
  maxMessages: 8,
  actionButtonIds: [],
}
```

Update any assertions that referenced phase-specific copy (e.g. `--- CURRENT PHASE ---`) to the new `--- WHERE YOU ARE IN THE FUNNEL ---` heading and `--- CURRENT STEP ---` test-mode heading.

- [ ] **Step 3: Run prompt-builder tests**

Run: `npx vitest run tests/unit/prompt-builder.test.ts tests/unit/prompt-builder-lead-context.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/prompt-builder.ts tests/unit/prompt-builder.test.ts tests/unit/prompt-builder-lead-context.test.ts
git commit -m "refactor(ai): prompt-builder uses StepContext instead of CurrentPhase"
```

---

## Task 5: Refactor test-session to funnels

**Files:**
- Modify: `src/lib/ai/test-session.ts`

- [ ] **Step 1: Rewrite the module**

Replace the contents of `src/lib/ai/test-session.ts` with:

```ts
// src/lib/ai/test-session.ts
import type { CampaignFunnel } from "@/types/campaign-funnel";
import type { ActionPageType } from "@/lib/ai/funnel-templates";

export interface FunnelWithPage extends CampaignFunnel {
  pageTitle: string;
  pageType: ActionPageType;
}

export interface TestSession {
  id: string;
  tenantId: string;
  campaignId: string | null;
  currentFunnelIndex: number;
  funnelMessageCount: number;
  history: { role: "user" | "bot"; text: string }[];
  funnels: FunnelWithPage[];
  createdAt: number;
}

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 1000;
const sessions = new Map<string, TestSession>();

function evictExpired(): void {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) sessions.delete(key);
  }
}

function sessionKey(tenantId: string, sessionId: string): string {
  return `${tenantId}:${sessionId}`;
}

export function createSession(
  tenantId: string,
  sessionId: string,
  campaignId: string | null,
  funnels: FunnelWithPage[]
): TestSession {
  if (sessions.size > MAX_SESSIONS) evictExpired();
  const session: TestSession = {
    id: sessionId,
    tenantId,
    campaignId,
    currentFunnelIndex: 0,
    funnelMessageCount: 0,
    history: [],
    funnels,
    createdAt: Date.now(),
  };
  sessions.set(sessionKey(tenantId, sessionId), session);
  return session;
}

export function getSession(tenantId: string, sessionId: string): TestSession | null {
  const session = sessions.get(sessionKey(tenantId, sessionId));
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(sessionKey(tenantId, sessionId));
    return null;
  }
  return session;
}

export function deleteSession(tenantId: string, sessionId: string): void {
  sessions.delete(sessionKey(tenantId, sessionId));
}

export function addMessage(session: TestSession, role: "user" | "bot", text: string): void {
  session.history.push({ role, text });
  if (role === "user") session.funnelMessageCount += 1;
  session.createdAt = Date.now();
}

export function getCurrentFunnel(session: TestSession): FunnelWithPage | null {
  return session.funnels[session.currentFunnelIndex] ?? null;
}

export function advanceSessionFunnel(
  session: TestSession
): { funnel: FunnelWithPage; advanced: boolean; completed: boolean } {
  const last = session.funnels.length - 1;
  if (session.currentFunnelIndex >= last) {
    return { funnel: session.funnels[last], advanced: false, completed: true };
  }
  session.currentFunnelIndex += 1;
  session.funnelMessageCount = 0;
  return { funnel: session.funnels[session.currentFunnelIndex], advanced: true, completed: false };
}

export function jumpToFunnel(session: TestSession, funnelId: string): FunnelWithPage | null {
  const idx = session.funnels.findIndex((f) => f.id === funnelId);
  if (idx === -1) return null;
  session.currentFunnelIndex = idx;
  session.funnelMessageCount = 0;
  return session.funnels[idx];
}
```

- [ ] **Step 2: Verify the file typechecks in isolation**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "src/lib/ai/test-session" || echo "clean"`
Expected: `clean`. (Other files will still fail — that's fixed in Tasks 6 and 7.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/test-session.ts
git commit -m "refactor(ai): test-session stores funnel state instead of phases"
```

---

## Task 6: Rewrite test-chat route for funnels

**Files:**
- Modify: `src/app/api/bot/test-chat/route.ts`
- Modify: `tests/unit/test-chat-api.test.ts`

- [ ] **Step 1: Update the test**

Replace the contents of `tests/unit/test-chat-api.test.ts` with:

```ts
// tests/unit/test-chat-api.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null })) },
  })),
}));

const fromMock = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: fromMock }),
}));

vi.mock("@/lib/ai/retriever", () => ({
  retrieveKnowledge: vi.fn(async () => ({ chunks: [], queryTarget: "kb", retrievalPass: 1 })),
}));

vi.mock("@/lib/ai/prompt-builder", () => ({
  buildSystemPrompt: vi.fn(async () => "SYSTEM_PROMPT"),
}));

vi.mock("@/lib/ai/llm-client", () => ({
  generateResponse: vi.fn(async () => ({ content: JSON.stringify({ message: "hi", phase_action: "stay", confidence: 0.9, image_ids: [], cited_chunks: [] }) })),
}));

vi.mock("@/lib/ai/decision-parser", () => ({
  parseDecision: (raw: string) => {
    const j = JSON.parse(raw);
    return { message: j.message, phaseAction: j.phase_action, confidence: j.confidence, imageIds: j.image_ids, citedChunks: j.cited_chunks, actionButtonId: undefined, ctaText: undefined };
  },
}));

import { POST } from "@/app/api/bot/test-chat/route";

beforeEach(() => {
  fromMock.mockReset();
});

function configureFrom(handlers: Record<string, () => unknown>) {
  fromMock.mockImplementation((table: string) => {
    if (!handlers[table]) throw new Error(`Unexpected table: ${table}`);
    return handlers[table]();
  });
}

describe("POST /api/bot/test-chat", () => {
  it("auto-seeds a 1-funnel session when no campaign is selected", async () => {
    configureFrom({
      tenant_members: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { tenant_id: "t1" } }) }),
      action_pages: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [{ id: "p1", type: "form", title: "Lead Form", published: true }], error: null }),
        in: vi.fn().mockReturnThis(),
      }),
      tenants: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { name: "Acme", persona_tone: "friendly" } }) }),
    });

    const req = new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi", sessionId: "s1", campaignId: null }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe("hi");
    expect(body.currentFunnel.total).toBe(1);
    expect(body.currentFunnel.pageType).toBe("form");
  });

  it("returns 400 when no campaign and no published action pages", async () => {
    configureFrom({
      tenant_members: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { tenant_id: "t1" } }) }),
      action_pages: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    const req = new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi", sessionId: "s2", campaignId: null }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("loads funnels for an explicit campaign", async () => {
    configureFrom({
      tenant_members: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { tenant_id: "t1" } }) }),
      campaign_funnels: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [
          { id: "f0", campaign_id: "c1", tenant_id: "t1", position: 0, action_page_id: "p1", page_description: null, chat_rules: ["r"], created_at: "n", updated_at: "n" },
        ], error: null }),
      }),
      action_pages: () => ({
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [{ id: "p1", title: "Sales", type: "sales" }], error: null }),
      }),
      campaigns: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { name: "C", description: "", goal: "purchase", campaign_rules: [] } }) }),
      tenants: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { name: "Acme", persona_tone: "friendly" } }) }),
    });
    const req = new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi", sessionId: "s3", campaignId: "00000000-0000-0000-0000-000000000001" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currentFunnel.pageTitle).toBe("Sales");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/test-chat-api.test.ts`
Expected: FAIL — current route still loads phases.

- [ ] **Step 3: Rewrite the route**

Replace the contents of `src/app/api/bot/test-chat/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";
import { retrieveKnowledge } from "@/lib/ai/retriever";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import { generateResponse } from "@/lib/ai/llm-client";
import { parseDecision } from "@/lib/ai/decision-parser";
import { listFunnelsForCampaign } from "@/lib/db/campaign-funnels";
import {
  ACTION_PAGE_TYPES,
  defaultRulesForPageType,
  type ActionPageType,
} from "@/lib/ai/funnel-templates";
import { funnelToStep } from "@/lib/ai/step-context";
import {
  addMessage,
  advanceSessionFunnel,
  createSession,
  deleteSession,
  getCurrentFunnel,
  getSession,
  jumpToFunnel,
  type FunnelWithPage,
} from "@/lib/ai/test-session";

const schema = z.object({
  message: z.string().min(1).max(500),
  sessionId: z.string().min(1).max(100),
  campaignId: z.string().uuid().nullable().default(null),
  jumpToFunnelId: z.string().uuid().optional(),
  simulateActionCompleted: z.boolean().optional(),
  reset: z.boolean().optional(),
});

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const MAX_RATE_LIMIT_ENTRIES = 10_000;

function checkRateLimit(tenantId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(tenantId);
  if (!entry || now > entry.resetAt) {
    if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
      for (const [key, val] of rateLimitMap) if (now > val.resetAt) rateLimitMap.delete(key);
    }
    rateLimitMap.set(tenantId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

async function loadFunnelsWithPages(
  service: ReturnType<typeof createServiceClient>,
  campaignId: string
): Promise<FunnelWithPage[]> {
  const funnels = await listFunnelsForCampaign(service as never, campaignId);
  if (funnels.length === 0) return [];
  const pageIds = funnels.map((f) => f.actionPageId);
  const { data: pages } = await service
    .from("action_pages")
    .select("id, title, type")
    .in("id", pageIds);
  const map = new Map((pages ?? []).map((p) => [p.id as string, p as { id: string; title: string; type: string }]));
  return funnels.map((f) => {
    const page = map.get(f.actionPageId);
    if (!page) throw new Error(`Action page missing for funnel ${f.id}`);
    if (!ACTION_PAGE_TYPES.includes(page.type as ActionPageType)) {
      throw new Error(`Unsupported page type: ${page.type}`);
    }
    return { ...f, pageTitle: page.title, pageType: page.type as ActionPageType };
  });
}

async function autoSeedFunnel(
  service: ReturnType<typeof createServiceClient>,
  tenantId: string
): Promise<FunnelWithPage[]> {
  const { data } = await service
    .from("action_pages")
    .select("id, type, title, published")
    .eq("tenant_id", tenantId)
    .eq("published", true)
    .order("created_at", { ascending: true });
  if (!data || data.length === 0) return [];
  const page = data[0] as { id: string; type: string; title: string };
  if (!ACTION_PAGE_TYPES.includes(page.type as ActionPageType)) return [];
  const pageType = page.type as ActionPageType;
  const now = new Date().toISOString();
  return [
    {
      id: "auto-seed",
      campaignId: "auto-seed",
      tenantId,
      position: 0,
      actionPageId: page.id,
      pageDescription: null,
      chatRules: defaultRulesForPageType(pageType),
      createdAt: now,
      updatedAt: now,
      pageTitle: page.title,
      pageType,
    },
  ];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: membership } = await service
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No tenant membership" }, { status: 403 });
  }

  const tenantId = membership.tenant_id as string;
  const { message, sessionId, campaignId, jumpToFunnelId, simulateActionCompleted, reset } = parsed.data;

  if (!checkRateLimit(tenantId)) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
  }

  if (reset) {
    deleteSession(tenantId, sessionId);
    return NextResponse.json({ status: "reset" });
  }

  let session = getSession(tenantId, sessionId);
  if (!session) {
    const funnels = campaignId
      ? await loadFunnelsWithPages(service, campaignId)
      : await autoSeedFunnel(service, tenantId);
    if (funnels.length === 0) {
      return NextResponse.json(
        { error: campaignId
            ? "This campaign has no funnels — rebuild via the AI builder."
            : "No published action pages — build one first." },
        { status: 400 }
      );
    }
    session = createSession(tenantId, sessionId, campaignId, funnels);
  }

  if (jumpToFunnelId) {
    const jumped = jumpToFunnel(session, jumpToFunnelId);
    if (!jumped) return NextResponse.json({ error: "Funnel not found" }, { status: 404 });
  }

  if (simulateActionCompleted) {
    advanceSessionFunnel(session);
  }

  const currentFunnel = getCurrentFunnel(session);
  if (!currentFunnel) return NextResponse.json({ error: "No active funnel" }, { status: 500 });

  const tenantPromise = service.from("tenants").select("name, persona_tone").eq("id", tenantId).single();
  const campaignPromise = session.campaignId
    ? service.from("campaigns").select("name, description, goal, campaign_rules").eq("id", session.campaignId).single()
    : Promise.resolve({ data: null });

  const [{ data: tenant }, { data: campaignData }] = await Promise.all([tenantPromise, campaignPromise]);
  const businessName = (tenant as { name?: string } | null)?.name ?? "Your Business";
  const personaTone = (tenant as { persona_tone?: string } | null)?.persona_tone ?? "friendly";
  const campaignContext = campaignData
    ? {
        name: (campaignData as { name: string }).name,
        description: (campaignData as { description: string | null }).description,
        goal: (campaignData as { goal: string }).goal,
        campaignRules: ((campaignData as { campaign_rules: string[] | null }).campaign_rules ?? []) as string[],
      }
    : undefined;

  addMessage(session, "user", message);

  const retrieval = await retrieveKnowledge({ query: message, tenantId });

  const step = funnelToStep({
    funnel: currentFunnel,
    allFunnels: session.funnels,
    campaign: { goal: campaignContext?.goal ?? "stage_reached" },
    page: { title: currentFunnel.pageTitle, type: currentFunnel.pageType },
    tone: personaTone,
    messageCount: session.funnelMessageCount,
  });

  const systemPrompt = await buildSystemPrompt({
    tenantId,
    businessName,
    step,
    conversationId: `test-${sessionId}`,
    ragChunks: retrieval.chunks,
    testMode: false,
    historyOverride: session.history,
    campaign: campaignContext,
  });

  const llmResponse = await generateResponse(systemPrompt, message);
  const decision = parseDecision(llmResponse.content);
  addMessage(session, "bot", decision.message);

  let funnelAdvanced = false;
  if (decision.phaseAction === "advance") {
    const r = advanceSessionFunnel(session);
    funnelAdvanced = r.advanced;
  }

  const after = getCurrentFunnel(session)!;
  return NextResponse.json({
    reply: decision.message,
    confidence: decision.confidence,
    phaseAction: decision.phaseAction,
    funnelAdvanced,
    currentFunnel: {
      id: after.id,
      pageTitle: after.pageTitle,
      pageType: after.pageType,
      index: session.currentFunnelIndex,
      total: session.funnels.length,
      messageCount: session.funnelMessageCount,
      maxMessages: 8,
    },
    queryTarget: retrieval.queryTarget,
    retrievalPass: retrieval.retrievalPass,
    chunks: retrieval.chunks.map((c) => ({
      content: c.content,
      similarity: c.similarity,
      source: (c.metadata?.kb_type as string) ?? "general",
    })),
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/test-chat-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/bot/test-chat/route.ts tests/unit/test-chat-api.test.ts
git commit -m "feat(api): test-chat route uses funnels with auto-seed fallback"
```

---

## Task 7: Refactor conversation-engine to funnels

**Files:**
- Modify: `src/lib/ai/conversation-engine.ts`
- Modify: `tests/unit/conversation-engine.test.ts`
- Modify: `tests/unit/conversation-engine-handoff.test.ts`
- Modify: `tests/unit/conversation-engine-images.test.ts`

- [ ] **Step 1: Update existing tests to mock funnel-runtime**

In each of the three engine test files, replace any mock of `@/lib/ai/phase-machine` with mocks of `@/lib/ai/funnel-runtime` and `@/lib/db/campaign-funnels`.

Pattern to apply (adapt per file):

```ts
vi.mock("@/lib/db/campaign-funnels", () => ({
  listFunnelsForCampaign: vi.fn(async () => [
    { id: "f0", campaignId: "c1", tenantId: "t1", position: 0, actionPageId: "p0", pageDescription: null, chatRules: ["r"], createdAt: "n", updatedAt: "n" },
  ]),
}));
vi.mock("@/lib/ai/funnel-runtime", () => ({
  getOrInitFunnelState: vi.fn(async () => ({
    funnel: { id: "f0", campaignId: "c1", tenantId: "t1", position: 0, actionPageId: "p0", pageDescription: null, chatRules: ["r"], createdAt: "n", updatedAt: "n" },
    position: 0,
    messageCount: 0,
  })),
  advanceFunnel: vi.fn(async () => ({
    funnel: { id: "f0", campaignId: "c1", tenantId: "t1", position: 0, actionPageId: "p0", pageDescription: null, chatRules: ["r"], createdAt: "n", updatedAt: "n" },
    position: 0, advanced: false, completed: true,
  })),
  incrementFunnelMessageCount: vi.fn(async () => undefined),
}));
```

Make the existing service-client mocks return action-page lookups (`action_pages` `.in("id", ...)` returning `[{ id: "p0", title: "Page", type: "form" }]`).

Update assertions: `currentPhase` field on `EngineOutput` is replaced with the same name but populated by `step.name`. Add a `completedFunnel` boolean check where the test exercises last-funnel advancement.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/conversation-engine.test.ts tests/unit/conversation-engine-handoff.test.ts tests/unit/conversation-engine-images.test.ts`
Expected: FAIL — engine still imports `phase-machine`.

- [ ] **Step 3: Rewrite engine logic**

Edit `src/lib/ai/conversation-engine.ts`:

1. Remove imports of `getCurrentPhase`, `advancePhase`, `incrementMessageCount` from `@/lib/ai/phase-machine`.
2. Add imports:

```ts
import { listFunnelsForCampaign } from "@/lib/db/campaign-funnels";
import {
  getOrInitFunnelState,
  advanceFunnel,
  incrementFunnelMessageCount,
} from "@/lib/ai/funnel-runtime";
import { funnelToStep } from "@/lib/ai/step-context";
import { ACTION_PAGE_TYPES, type ActionPageType } from "@/lib/ai/funnel-templates";
```

3. Add `completedFunnel?: boolean` to `EngineOutput`.

4. Replace the phase block (Step 1 + the campaign read) with:

```ts
// Step 0: Get or assign campaign for this lead
const campaignId = await getOrAssignCampaign(leadId, tenantId);

// Step 1: Load funnels + campaign data
const funnels = await listFunnelsForCampaign(supabase, campaignId);
if (funnels.length === 0) {
  return {
    message: "",
    phaseAction: "stay",
    confidence: 0,
    imageIds: [],
    currentPhase: "",
    escalated: false,
    paused: true,
    completedFunnel: false,
  };
}

const { data: campaignData } = await supabase
  .from("campaigns")
  .select("name, description, goal, campaign_rules")
  .eq("id", campaignId)
  .single();

const campaignContext: CampaignContext | undefined = campaignData
  ? {
      name: campaignData.name,
      description: campaignData.description,
      goal: campaignData.goal,
      campaignRules: (campaignData.campaign_rules as string[] | null) ?? [],
    }
  : undefined;

// Step 1b: Funnel state
const funnelState = await getOrInitFunnelState(supabase, conversationId, campaignId, funnels);

// Step 1c: Action page metadata for the current funnel
const { data: pageRow } = await supabase
  .from("action_pages")
  .select("title, type")
  .eq("id", funnelState.funnel.actionPageId)
  .single();
if (!pageRow) {
  throw new Error(`Action page missing for funnel ${funnelState.funnel.id}`);
}
const pageType = pageRow.type as string;
if (!ACTION_PAGE_TYPES.includes(pageType as ActionPageType)) {
  throw new Error(`Unsupported page type: ${pageType}`);
}

// Step 1d: Tenant tone
const { data: toneRow } = await supabase
  .from("tenants")
  .select("persona_tone")
  .eq("id", tenantId)
  .single();
const tone = (toneRow?.persona_tone as string | undefined) ?? "friendly";

const step = funnelToStep({
  funnel: funnelState.funnel,
  allFunnels: funnels,
  campaign: { goal: campaignData?.goal ?? "stage_reached" },
  page: { title: pageRow.title as string, type: pageType as ActionPageType },
  tone,
  messageCount: funnelState.messageCount,
});
```

5. In the `buildSystemPrompt` call, replace `currentPhase` with `step`.

6. Replace `selectImages({ ..., currentPhaseName: currentPhase.name, ... })` with `currentPhaseName: step.name`.

7. In the action-button validation, change `currentPhase.actionButtonIds !== null && currentPhase.actionButtonIds.includes(...)` to `step.actionButtonIds.includes(decision.actionButtonId)`.

8. Replace the side-effects block:

```ts
let escalated = false;
let completedFunnel = false;

if (decision.phaseAction === "advance") {
  const r = await advanceFunnel(supabase, conversationId, funnels);
  completedFunnel = r.completed && !r.advanced;
} else if (decision.phaseAction === "escalate") {
  // ... existing escalation block unchanged
}

await incrementFunnelMessageCount(supabase, conversationId);
```

9. In the final `return`, replace `currentPhase: currentPhase.name` with `currentPhase: step.name` and add `completedFunnel`.

- [ ] **Step 4: Run engine tests**

Run: `npx vitest run tests/unit/conversation-engine.test.ts tests/unit/conversation-engine-handoff.test.ts tests/unit/conversation-engine-images.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/conversation-engine.ts tests/unit/conversation-engine.test.ts tests/unit/conversation-engine-handoff.test.ts tests/unit/conversation-engine-images.test.ts
git commit -m "feat(ai): conversation engine reads campaign_funnels"
```

---

## Task 8: Delete phase-machine and phase-templates

**Files:**
- Delete: `src/lib/ai/phase-machine.ts`
- Delete: `src/lib/ai/phase-templates.ts`
- Delete: `tests/unit/phase-machine.test.ts`
- Delete: `tests/unit/phase-templates.test.ts`

- [ ] **Step 1: Confirm no remaining imports**

Run: `grep -rE "from \"@/lib/ai/phase-machine\"|from \"@/lib/ai/phase-templates\"" src tests || echo "clean"`
Expected: `clean`. If any matches remain, fix them before deleting (probably an admin/UI surface — adapt or remove the import to a local copy of the type if needed).

- [ ] **Step 2: Delete the files**

```bash
git rm src/lib/ai/phase-machine.ts src/lib/ai/phase-templates.ts tests/unit/phase-machine.test.ts tests/unit/phase-templates.test.ts
```

If any of those test files don't exist, drop them from the command.

- [ ] **Step 3: Typecheck and run all unit tests**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

If typecheck fails because an admin route imports `CurrentPhase` from `phase-machine`, replace that import with `StepContext` (or restore a tiny local type — but only if absolutely needed).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(ai): remove phase-machine and phase-templates"
```

---

## Task 9: Extend e2e — chat after save

**Files:**
- Modify: `tests/e2e/ai-builder-funnels.spec.ts`

- [ ] **Step 1: Inspect current e2e**

Run: `cat tests/e2e/ai-builder-funnels.spec.ts`. Note the selectors and the seed assumption from Task 11 of the previous plan.

- [ ] **Step 2: Append the chat step**

After the existing `await expect(page.getByText(/campaign saved/i)).toBeVisible();` line, append:

```ts
  // Sanity-test the new campaign in test-chat
  await page.goto("/app/test-chat");

  // Pick the campaign we just created, if a selector exists. Otherwise default flow auto-seeds.
  const campaignSelect = page.getByRole("combobox", { name: /campaign/i });
  if (await campaignSelect.count()) {
    await campaignSelect.selectOption({ label: /coaching|new campaign/i });
  }

  await page.getByPlaceholder(/type a message|message/i).fill("Hi, I'm interested.");
  await page.getByRole("button", { name: /send/i }).click();

  // Expect a non-empty bot reply within 15s
  const botReply = page.locator('[data-role="bot-message"]').last();
  await expect(botReply).toBeVisible({ timeout: 15_000 });
  await expect(botReply).not.toHaveText(/^\s*$/);
```

If the test-chat UI uses different selectors, adapt the selectors but keep the assertion: a bot reply appears.

- [ ] **Step 3: Run the e2e**

Run: `npx playwright test tests/e2e/ai-builder-funnels.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/ai-builder-funnels.spec.ts
git commit -m "test(e2e): chat with newly-created funnel campaign"
```

---

## Task 10: Final verification

- [ ] **Step 1: Full check**

Run: `npm run lint && npm run typecheck && npx vitest run && npx playwright test`
Expected: PASS.

- [ ] **Step 2: Manual smoke**

Run: `npm run dev`. In a browser:
1. Visit `/app/campaigns/ai-builder`. Walk the four steps. Save.
2. Visit `/app/test-chat`. Pick the new campaign (or none — should auto-seed). Send a few messages. Confirm:
   - The bot reply respects at least one of the funnel's chat rules.
   - When you click an "advance" / "simulate completed" control (if present), the `currentFunnel.index` increments.
3. In Supabase, run `select id, current_campaign_id, current_funnel_id, current_funnel_position, funnel_message_count from conversations order by updated_at desc limit 5;` — values should reflect the active session for any prod conversations.

- [ ] **Step 3: Commit any fixes from manual smoke**

```bash
git add -A
git commit -m "fix: smoke-test follow-ups for funnel engine"
```
