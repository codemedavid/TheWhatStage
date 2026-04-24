# Campaign Builder V2: Plan-First Sales System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-shot campaign builder with a plan-first flow: adaptive planning conversation, explicit phase generation from approved plan, smart-scoped phase refinement, and campaign-level rules injected into the conversation engine.

**Architecture:** New `campaign_plan` (jsonb) and `campaign_rules` (text[]) columns on `campaigns`. Three API endpoints replace the current two: `/plan` (adaptive planning), `/phases` (generate from plan), `/phase-edit` (smart-scoped edits). The prompt builder gains a new Layer 2.5 for campaign rules. The builder UI tracks derived state (`NO_PLAN` / `HAS_PLAN` / `HAS_PHASES`) and adapts the chat + preview panels accordingly.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, Supabase service client, Zod, Vitest, React Testing Library, existing `generateResponse` LLM wrapper.

---

## File Structure

- Create `supabase/migrations/0016_campaign_plan_and_rules.sql`
  - Adds `campaign_plan` and `campaign_rules` columns to `campaigns` table.

- Modify `src/types/database.ts`
  - Add `campaign_plan` and `campaign_rules` to the campaigns table type.

- Modify `src/lib/ai/campaign-builder.ts`
  - Replace with v2: plan prompt builder, phase generation prompt, phase edit prompt, shared types/schemas, parse/repair logic for each.
  - Exports: `generatePlan`, `generatePhasesFromPlan`, `editPhases`, `buildPlanSystemPrompt`, `buildPhaseGenSystemPrompt`, `buildPhaseEditSystemPrompt`, plus all type exports.

- Modify `tests/unit/campaign-builder.test.ts`
  - Replace with v2 tests covering plan generation (with question/plan actions), phase generation, phase editing (update/add/regenerate actions), and JSON repair.

- Modify `src/lib/ai/campaign-builder-store.ts`
  - Replace with v2: `saveCampaignPlan`, `loadCampaignForPhaseGen`, `saveGeneratedPhases`, `loadCampaignForPhaseEdit`, `applyPhaseEdit`.
  - Keeps `loadBuilderTenantContext` unchanged.

- Modify `tests/unit/campaign-builder-store.test.ts`
  - Replace with v2 tests for plan save, phase generation persistence, and phase edit persistence.

- Delete `src/app/api/campaigns/ai-builder/generate/route.ts`
  - Replaced by `/plan` and `/phases`.

- Delete `src/app/api/campaigns/ai-builder/revise/route.ts`
  - Replaced by `/phase-edit`.

- Create `src/app/api/campaigns/ai-builder/plan/route.ts`
  - Authenticates, validates, calls `generatePlan`, persists via `saveCampaignPlan`.

- Create `src/app/api/campaigns/ai-builder/phases/route.ts`
  - Authenticates, loads plan, calls `generatePhasesFromPlan`, persists via `saveGeneratedPhases`.

- Create `src/app/api/campaigns/ai-builder/phase-edit/route.ts`
  - Authenticates, loads plan + phases, calls `editPhases`, persists via `applyPhaseEdit`.

- Delete `tests/unit/campaigns-ai-builder-api.test.ts`
  - Replaced by new test file.

- Create `tests/unit/campaign-builder-v2-api.test.ts`
  - Tests for all three new API routes.

- Modify `src/lib/ai/prompt-builder.ts`
  - Add `buildCampaignRules` function and insert as Layer 2.5 between bot rules and offering context.
  - Expand `CampaignContext` to include `campaignRules: string[]`.

- Modify `tests/unit/prompt-builder.test.ts`
  - Add test for campaign rules layer.

- Modify `src/app/api/campaigns/[id]/route.ts`
  - Add `campaign_rules` to the PATCH schema.

- Modify `src/components/dashboard/campaigns/AiBuilderPreview.tsx`
  - Rewrite for three states: empty, plan card, plan summary + phase cards with focus support.

- Modify `src/components/dashboard/campaigns/AiBuilderChat.tsx`
  - Add `builderState` and `focusedPhaseName` props for adaptive placeholders.

- Modify `src/app/(tenant)/app/campaigns/ai-builder/AiCampaignBuilderClient.tsx`
  - Rewrite state management for plan-first flow: derived state, three endpoints, phase focus, action buttons.

- Modify `tests/unit/ai-campaign-builder-client.test.tsx`
  - Replace with v2 tests for plan flow, phase generation, phase editing, phase focus.

- Modify `src/components/dashboard/campaigns/CampaignForm.tsx`
  - Add campaign rules editor section.

---

### Task 1: Database Migration And Types

**Files:**
- Create: `supabase/migrations/0016_campaign_plan_and_rules.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/0016_campaign_plan_and_rules.sql`:

```sql
ALTER TABLE campaigns
  ADD COLUMN campaign_plan jsonb DEFAULT NULL,
  ADD COLUMN campaign_rules text[] DEFAULT '{}';

COMMENT ON COLUMN campaigns.campaign_plan IS 'Strategic blueprint: goal_summary, selling_approach, buyer_context, key_behaviors, phase_outline';
COMMENT ON COLUMN campaigns.campaign_rules IS 'Plain-language rules applied across all phases of this campaign';
```

- [ ] **Step 2: Update TypeScript database types**

In `src/types/database.ts`, find the campaigns table Row type and add the two new fields after `follow_up_message`:

```ts
campaign_plan: {
  goal_summary: string;
  selling_approach: string;
  buyer_context: string;
  key_behaviors: string[];
  phase_outline: { name: string; purpose: string }[];
} | null;
campaign_rules: string[];
```

Add the same fields to the Insert and Update types (both optional):

```ts
campaign_plan?: { ... } | null;
campaign_rules?: string[];
```

- [ ] **Step 3: Apply the migration**

Run:

```bash
npx supabase migration up --local
```

Or if using hosted Supabase, apply via the Supabase MCP tool.

- [ ] **Step 4: Commit migration and types**

```bash
git add supabase/migrations/0016_campaign_plan_and_rules.sql src/types/database.ts
git commit -m "feat: add campaign_plan and campaign_rules columns"
```

---

### Task 2: Campaign Plan Builder Core

**Files:**
- Modify: `src/lib/ai/campaign-builder.ts`
- Modify: `tests/unit/campaign-builder.test.ts`

- [ ] **Step 1: Write failing plan builder tests**

Replace `tests/unit/campaign-builder.test.ts` entirely:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/llm-client", () => ({
  generateResponse: vi.fn(),
}));

import {
  buildPlanSystemPrompt,
  generatePlan,
  buildPhaseGenSystemPrompt,
  generatePhasesFromPlan,
  buildPhaseEditSystemPrompt,
  editPhases,
} from "@/lib/ai/campaign-builder";
import { generateResponse } from "@/lib/ai/llm-client";

const mockGenerateResponse = vi.mocked(generateResponse);

const tenantContext = {
  tenantName: "Acme Growth",
  businessType: "services",
  botGoal: "qualify_leads",
  businessDescription: "Lead generation service for local businesses.",
  mainAction: "form",
  differentiator: "Fast qualification and no-pressure consults.",
  qualificationCriteria: "Business owners with at least 3 staff.",
  primaryCampaign: null,
};

const validPlanOutput = {
  action: "plan" as const,
  campaign_name: "Low-Friction Qualification",
  campaign_description: "A trust-first campaign that qualifies leads without pressure.",
  campaign_goal: "form_submit" as const,
  plan: {
    goal_summary: "Qualify leads through trust-building conversation",
    selling_approach: "Answer questions first, then guide toward qualification",
    buyer_context: "Warm leads from ads, unclear intent",
    key_behaviors: [
      "Lead with empathy, not features",
      "Ask one question at a time",
      "Only push qualification when trust is established",
    ],
    phase_outline: [
      { name: "Understand Intent", purpose: "Learn what the lead wants" },
      { name: "Build Trust", purpose: "Answer questions and demonstrate value" },
      { name: "Qualify", purpose: "Guide toward form submission" },
    ],
  },
  campaign_rules: [
    "Never hard sell",
    "Always mention the free consultation",
    "Ask one question at a time",
  ],
};

const validQuestionOutput = {
  action: "question" as const,
  question: "What's the main objection these leads usually have?",
};

const validPhases = [
  {
    name: "Understand Intent",
    order_index: 0,
    max_messages: 3,
    system_prompt: "Find out what the lead wants before recommending.",
    tone: "warm and direct",
    goals: "Understand buying intent.",
    transition_hint: "Move on once intent is clear.",
  },
  {
    name: "Build Trust",
    order_index: 1,
    max_messages: 4,
    system_prompt: "Answer questions, show expertise, build rapport.",
    tone: "clear and helpful",
    goals: "Reduce friction and demonstrate value.",
    transition_hint: "Move on when lead shows confidence.",
  },
  {
    name: "Qualify",
    order_index: 2,
    max_messages: 3,
    system_prompt: "Guide toward form submission without pressure.",
    tone: "calm and reassuring",
    goals: "Get the lead to check if they qualify.",
    transition_hint: "Final phase — close or gracefully stop.",
  },
];

describe("generatePlan", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds a system prompt with sales system architect role and tenant context", () => {
    const prompt = buildPlanSystemPrompt(tenantContext);

    expect(prompt).toContain("sales system architect");
    expect(prompt).toContain("campaign plan");
    expect(prompt).toContain("Acme Growth");
    expect(prompt).toContain("Lead generation service");
    expect(prompt).toContain("question");
    expect(prompt).toContain("plan");
  });

  it("returns a plan when the model generates one", async () => {
    mockGenerateResponse.mockResolvedValue({
      content: JSON.stringify(validPlanOutput),
      finishReason: "stop",
    });

    const result = await generatePlan({
      context: tenantContext,
      message: "Build a trust-first qualification campaign.",
    });

    expect(result.action).toBe("plan");
    if (result.action !== "plan") throw new Error("Expected plan");
    expect(result.plan.goal_summary).toContain("Qualify");
    expect(result.campaign_name).toBe("Low-Friction Qualification");
    expect(result.campaign_rules).toHaveLength(3);
    expect(mockGenerateResponse).toHaveBeenCalledWith(
      expect.stringContaining("sales system architect"),
      expect.stringContaining("trust-first qualification"),
      expect.objectContaining({ responseFormat: "json_object" })
    );
  });

  it("returns a question when the model asks for clarification", async () => {
    mockGenerateResponse.mockResolvedValue({
      content: JSON.stringify(validQuestionOutput),
      finishReason: "stop",
    });

    const result = await generatePlan({
      context: tenantContext,
      message: "booking campaign",
    });

    expect(result.action).toBe("question");
    if (result.action !== "question") throw new Error("Expected question");
    expect(result.question).toContain("objection");
  });

  it("repairs invalid JSON once before failing", async () => {
    mockGenerateResponse
      .mockResolvedValueOnce({ content: "{ invalid", finishReason: "stop" })
      .mockResolvedValueOnce({
        content: JSON.stringify(validPlanOutput),
        finishReason: "stop",
      });

    const result = await generatePlan({
      context: tenantContext,
      message: "Build a campaign.",
    });

    expect(result.action).toBe("plan");
    expect(mockGenerateResponse).toHaveBeenCalledTimes(2);
    expect(mockGenerateResponse.mock.calls[1][0]).toContain("Repair");
  });
});

describe("generatePhasesFromPlan", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds a phase gen prompt with plan and rules context", () => {
    const prompt = buildPhaseGenSystemPrompt(
      tenantContext,
      validPlanOutput.plan,
      validPlanOutput.campaign_rules
    );

    expect(prompt).toContain("generating conversation phases");
    expect(prompt).toContain("Qualify leads through trust-building");
    expect(prompt).toContain("Never hard sell");
    expect(prompt).toContain("Understand Intent");
  });

  it("generates phases from an approved plan", async () => {
    mockGenerateResponse.mockResolvedValue({
      content: JSON.stringify({ phases: validPhases }),
      finishReason: "stop",
    });

    const result = await generatePhasesFromPlan({
      context: tenantContext,
      plan: validPlanOutput.plan,
      rules: validPlanOutput.campaign_rules,
    });

    expect(result).toHaveLength(3);
    expect(result[0].name).toBe("Understand Intent");
    expect(result[2].order_index).toBe(2);
  });

  it("throws when fewer than 3 phases are generated", async () => {
    mockGenerateResponse.mockResolvedValue({
      content: JSON.stringify({ phases: validPhases.slice(0, 2) }),
      finishReason: "stop",
    });

    await expect(
      generatePhasesFromPlan({
        context: tenantContext,
        plan: validPlanOutput.plan,
        rules: validPlanOutput.campaign_rules,
      })
    ).rejects.toThrow("Invalid");
  });
});

describe("editPhases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds a phase edit prompt with plan, rules, phases, and focused index", () => {
    const prompt = buildPhaseEditSystemPrompt(
      tenantContext,
      validPlanOutput.plan,
      validPlanOutput.campaign_rules,
      validPhases,
      1
    );

    expect(prompt).toContain("refining phases");
    expect(prompt).toContain("Build Trust");
    expect(prompt).toContain("FOCUSED PHASE: index 1");
  });

  it("returns an update action with changed indices", async () => {
    const editResult = {
      action: "update" as const,
      phases: validPhases.map((p, i) =>
        i === 1 ? { ...p, tone: "softer and warmer" } : p
      ),
      updatedIndices: [1],
    };
    mockGenerateResponse.mockResolvedValue({
      content: JSON.stringify(editResult),
      finishReason: "stop",
    });

    const result = await editPhases({
      context: tenantContext,
      plan: validPlanOutput.plan,
      rules: validPlanOutput.campaign_rules,
      currentPhases: validPhases,
      message: "Make phase 2 softer.",
      focusedPhaseIndex: 1,
    });

    expect(result.action).toBe("update");
    expect(result.updatedIndices).toEqual([1]);
    expect(result.phases[1].tone).toBe("softer and warmer");
  });

  it("returns an add action with the new phase index", async () => {
    const newPhase = {
      name: "Handle Objections",
      order_index: 2,
      max_messages: 3,
      system_prompt: "Address concerns directly.",
      tone: "calm",
      goals: "Resolve objections.",
      transition_hint: "Move to close when resolved.",
    };
    const reindexedPhases = [
      validPhases[0],
      validPhases[1],
      newPhase,
      { ...validPhases[2], order_index: 3 },
    ];
    mockGenerateResponse.mockResolvedValue({
      content: JSON.stringify({
        action: "add",
        phases: reindexedPhases,
        addedIndex: 2,
      }),
      finishReason: "stop",
    });

    const result = await editPhases({
      context: tenantContext,
      plan: validPlanOutput.plan,
      rules: validPlanOutput.campaign_rules,
      currentPhases: validPhases,
      message: "Add an objection-handling phase after Build Trust.",
    });

    expect(result.action).toBe("add");
    expect(result.addedIndex).toBe(2);
    expect(result.phases).toHaveLength(4);
  });

  it("returns a regenerate action for full rebuilds", async () => {
    mockGenerateResponse.mockResolvedValue({
      content: JSON.stringify({
        action: "regenerate",
        phases: validPhases,
      }),
      finishReason: "stop",
    });

    const result = await editPhases({
      context: tenantContext,
      plan: validPlanOutput.plan,
      rules: validPlanOutput.campaign_rules,
      currentPhases: validPhases,
      message: "Start over with the phases.",
    });

    expect(result.action).toBe("regenerate");
    expect(result.phases).toHaveLength(3);
  });

  it("returns updated rules when the edit affects campaign rules", async () => {
    mockGenerateResponse.mockResolvedValue({
      content: JSON.stringify({
        action: "update",
        phases: validPhases,
        updatedIndices: [0],
        rulesUpdate: ["Never hard sell", "Always mention the free consultation", "Never discuss pricing until phase 2"],
      }),
      finishReason: "stop",
    });

    const result = await editPhases({
      context: tenantContext,
      plan: validPlanOutput.plan,
      rules: validPlanOutput.campaign_rules,
      currentPhases: validPhases,
      message: "Actually we should never mention pricing until phase 2.",
    });

    expect(result.rulesUpdate).toContain("Never discuss pricing until phase 2");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/unit/campaign-builder.test.ts
```

Expected: FAIL — `generatePlan` not found in exports.

- [ ] **Step 3: Implement campaign builder v2**

Replace `src/lib/ai/campaign-builder.ts` entirely:

```ts
import { z } from "zod";
import { generateResponse } from "@/lib/ai/llm-client";

// --- Shared schemas ---

const campaignGoalSchema = z.enum([
  "form_submit",
  "appointment_booked",
  "purchase",
  "stage_reached",
]);

const phaseOutlineSchema = z.object({
  name: z.string().min(1).max(100),
  purpose: z.string().min(1).max(300),
});

const campaignPlanSchema = z.object({
  goal_summary: z.string().min(1).max(500),
  selling_approach: z.string().min(1).max(500),
  buyer_context: z.string().min(1).max(500),
  key_behaviors: z.array(z.string().min(1).max(300)).min(1).max(8),
  phase_outline: z.array(phaseOutlineSchema).min(2).max(6),
});

const generatedPhaseSchema = z.object({
  name: z.string().min(1).max(100),
  order_index: z.number().int().min(0).max(7),
  max_messages: z.number().int().min(1).max(10),
  system_prompt: z.string().min(1).max(5000),
  tone: z.string().min(1).max(200),
  goals: z.string().min(1).max(2000),
  transition_hint: z.string().min(1).max(1000),
});

// --- Plan prompt schemas ---

const planResponseSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("question"),
    question: z.string().min(1).max(1000),
  }),
  z.object({
    action: z.literal("plan"),
    campaign_name: z.string().min(1).max(200),
    campaign_description: z.string().min(1).max(1000),
    campaign_goal: campaignGoalSchema,
    plan: campaignPlanSchema,
    campaign_rules: z.array(z.string().min(1).max(300)).max(10).default([]),
  }),
]);

// --- Phase edit schemas ---

const phaseEditResponseSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    phases: z.array(generatedPhaseSchema).min(3).max(8),
    updatedIndices: z.array(z.number().int().min(0)).min(1),
    rulesUpdate: z.array(z.string().min(1).max(300)).optional(),
  }),
  z.object({
    action: z.literal("add"),
    phases: z.array(generatedPhaseSchema).min(3).max(8),
    addedIndex: z.number().int().min(0),
    rulesUpdate: z.array(z.string().min(1).max(300)).optional(),
  }),
  z.object({
    action: z.literal("regenerate"),
    phases: z.array(generatedPhaseSchema).min(3).max(8),
    rulesUpdate: z.array(z.string().min(1).max(300)).optional(),
  }),
]);

// --- Exported types ---

export type CampaignGoal = z.infer<typeof campaignGoalSchema>;
export type CampaignPlan = z.infer<typeof campaignPlanSchema>;
export type GeneratedCampaignPhase = z.infer<typeof generatedPhaseSchema>;
export type PlanResponse = z.infer<typeof planResponseSchema>;
export type PhaseEditResponse = z.infer<typeof phaseEditResponseSchema>;

export interface CampaignBuilderTenantContext {
  tenantName: string;
  businessType: string;
  botGoal: string;
  businessDescription: string | null;
  mainAction: string | null;
  differentiator: string | null;
  qualificationCriteria: string | null;
  primaryCampaign?: {
    id: string;
    name: string;
    description: string | null;
    goal: string;
  } | null;
}

export interface BuilderChatMessage {
  role: "user" | "assistant";
  text: string;
}

// --- Config ---

const MODEL_CONFIG = {
  responseFormat: "json_object" as const,
  temperature: 0.45,
  maxTokens: 2200,
};

// --- Tenant context block (shared) ---

function tenantBlock(context: CampaignBuilderTenantContext): string {
  const primary = context.primaryCampaign
    ? `${context.primaryCampaign.name}: ${context.primaryCampaign.description ?? "No description"}`
    : "No primary campaign found.";

  return [
    "Tenant context:",
    `Business: ${context.tenantName}`,
    `Business type: ${context.businessType}`,
    `Bot goal: ${context.botGoal}`,
    `Business description: ${context.businessDescription ?? "Not provided"}`,
    `Main action: ${context.mainAction ?? "Not provided"}`,
    `Differentiator: ${context.differentiator ?? "Not provided"}`,
    `Qualification criteria: ${context.qualificationCriteria ?? "Not provided"}`,
    `Current primary campaign: ${primary}`,
  ].join("\n");
}

function formatHistory(history?: BuilderChatMessage[]): string {
  if (!history?.length) return "No previous builder chat.";
  return history
    .slice(-8)
    .map((m) => `${m.role === "user" ? "Tenant" : "Builder"}: ${m.text}`)
    .join("\n");
}

// --- Plan prompt ---

export function buildPlanSystemPrompt(
  context: CampaignBuilderTenantContext
): string {
  return [
    "You are a sales system architect for Messenger bots.",
    "Your job is to understand what the tenant wants to achieve and design a campaign plan — not phases yet, just the strategic blueprint.",
    "",
    "If the tenant gives detailed direction, produce the plan immediately.",
    "If vague, ask 1-2 focused questions before producing the plan.",
    "Never ask more than 2 questions in a row — if you already have enough context, produce the plan.",
    "",
    "Return ONLY valid JSON with one of these shapes:",
    "",
    'Question: { "action": "question", "question": "string" }',
    "",
    "Plan:",
    '{',
    '  "action": "plan",',
    '  "campaign_name": "string",',
    '  "campaign_description": "string",',
    '  "campaign_goal": "form_submit | appointment_booked | purchase | stage_reached",',
    '  "plan": {',
    '    "goal_summary": "string",',
    '    "selling_approach": "string",',
    '    "buyer_context": "string",',
    '    "key_behaviors": ["string"],',
    '    "phase_outline": [{ "name": "string", "purpose": "string" }]',
    '  },',
    '  "campaign_rules": ["string"]',
    '}',
    "",
    tenantBlock(context),
  ].join("\n");
}

export async function generatePlan(input: {
  context: CampaignBuilderTenantContext;
  message: string;
  history?: BuilderChatMessage[];
  existingPlan?: CampaignPlan | null;
}): Promise<PlanResponse> {
  const systemPrompt = buildPlanSystemPrompt(input.context);
  const parts = [
    input.existingPlan
      ? `Current campaign plan:\n${JSON.stringify(input.existingPlan, null, 2)}\n\nRevise the plan using the tenant's latest direction.`
      : "Create a new campaign plan from this tenant direction.",
    "",
    `Tenant direction: ${input.message}`,
    "",
    "Builder chat history:",
    formatHistory(input.history),
  ];
  const userMessage = parts.join("\n");

  const response = await generateResponse(systemPrompt, userMessage, MODEL_CONFIG);
  return parseOrRepair(response.content, systemPrompt, userMessage, planResponseSchema);
}

// --- Phase generation prompt ---

export function buildPhaseGenSystemPrompt(
  context: CampaignBuilderTenantContext,
  plan: CampaignPlan,
  rules: string[]
): string {
  return [
    "You are generating conversation phases from an approved campaign plan.",
    "Each phase is a behavioral briefing for a Messenger sales bot, not a canned script.",
    "",
    "Use CLOSER as hidden reasoning only:",
    "- Clarify why the lead is there.",
    "- Label the real problem/desire.",
    "- Overview relevant context.",
    "- Sell the outcome, not mechanics.",
    "- Explain concerns directly.",
    "- Reinforce the next decision.",
    "",
    "Do not turn CLOSER into literal phase names or mention any framework.",
    "Generate 3-6 phases based on the phase outline in the plan.",
    "Use concise, human Messenger behavior.",
    "",
    'Return ONLY valid JSON: { "phases": [{ "name", "order_index", "max_messages", "system_prompt", "tone", "goals", "transition_hint" }] }',
    "",
    "Approved campaign plan:",
    `Goal: ${plan.goal_summary}`,
    `Approach: ${plan.selling_approach}`,
    `Buyer context: ${plan.buyer_context}`,
    `Key behaviors: ${plan.key_behaviors.join("; ")}`,
    `Phase outline: ${plan.phase_outline.map((p, i) => `${i + 1}. ${p.name} — ${p.purpose}`).join("; ")}`,
    "",
    rules.length > 0 ? `Campaign rules:\n${rules.map((r) => `- ${r}`).join("\n")}` : "",
    "",
    tenantBlock(context),
  ].join("\n");
}

const phaseGenResponseSchema = z.object({
  phases: z.array(generatedPhaseSchema).min(3).max(8),
});

export async function generatePhasesFromPlan(input: {
  context: CampaignBuilderTenantContext;
  plan: CampaignPlan;
  rules: string[];
}): Promise<GeneratedCampaignPhase[]> {
  const systemPrompt = buildPhaseGenSystemPrompt(input.context, input.plan, input.rules);
  const userMessage = "Generate the full conversation phases from the approved campaign plan.";

  const response = await generateResponse(systemPrompt, userMessage, MODEL_CONFIG);
  const parsed = await parseOrRepair(response.content, systemPrompt, userMessage, phaseGenResponseSchema);
  return normalizePhases(parsed.phases);
}

// --- Phase edit prompt ---

export function buildPhaseEditSystemPrompt(
  context: CampaignBuilderTenantContext,
  plan: CampaignPlan,
  rules: string[],
  currentPhases: GeneratedCampaignPhase[],
  focusedPhaseIndex?: number
): string {
  const phaseSummary = currentPhases
    .map((p) => `  [${p.order_index}] ${p.name}: ${p.goals} (tone: ${p.tone})`)
    .join("\n");

  const focusLine =
    focusedPhaseIndex !== undefined
      ? `\nFOCUSED PHASE: index ${focusedPhaseIndex} — "${currentPhases[focusedPhaseIndex]?.name}". The tenant is talking about this phase unless they say otherwise.`
      : "";

  return [
    "You are refining phases of an existing campaign. Decide the minimal scope of change needed.",
    "",
    "If the change only affects one phase, return action=update with only that phase changed.",
    "If it affects the flow (adding/removing/reordering), return action=add or action=regenerate.",
    "If it fundamentally changes the approach, return action=regenerate.",
    "If the change also affects campaign rules, include rulesUpdate.",
    "",
    "Return ONLY valid JSON with one of these shapes:",
    '{ "action": "update", "phases": [...all phases...], "updatedIndices": [1], "rulesUpdate?": ["string"] }',
    '{ "action": "add", "phases": [...all phases with new one inserted...], "addedIndex": 2, "rulesUpdate?": ["string"] }',
    '{ "action": "regenerate", "phases": [...all new phases...], "rulesUpdate?": ["string"] }',
    "",
    "Campaign plan:",
    JSON.stringify(plan, null, 2),
    "",
    rules.length > 0 ? `Campaign rules:\n${rules.map((r) => `- ${r}`).join("\n")}` : "",
    "",
    "Current phases:",
    phaseSummary,
    focusLine,
    "",
    tenantBlock(context),
  ].join("\n");
}

export async function editPhases(input: {
  context: CampaignBuilderTenantContext;
  plan: CampaignPlan;
  rules: string[];
  currentPhases: GeneratedCampaignPhase[];
  message: string;
  focusedPhaseIndex?: number;
  history?: BuilderChatMessage[];
}): Promise<PhaseEditResponse> {
  const systemPrompt = buildPhaseEditSystemPrompt(
    input.context,
    input.plan,
    input.rules,
    input.currentPhases,
    input.focusedPhaseIndex
  );
  const userMessage = [
    `Tenant direction: ${input.message}`,
    "",
    "Builder chat history:",
    formatHistory(input.history),
  ].join("\n");

  const response = await generateResponse(systemPrompt, userMessage, MODEL_CONFIG);
  const result = await parseOrRepair(response.content, systemPrompt, userMessage, phaseEditResponseSchema);
  return { ...result, phases: normalizePhases(result.phases) };
}

// --- Shared helpers ---

function normalizePhases(phases: GeneratedCampaignPhase[]): GeneratedCampaignPhase[] {
  return [...phases]
    .sort((a, b) => a.order_index - b.order_index)
    .map((phase, index) => ({ ...phase, order_index: index }));
}

async function parseOrRepair<T>(
  raw: string,
  systemPrompt: string,
  userMessage: string,
  schema: z.ZodType<T>
): Promise<T> {
  try {
    return schema.parse(JSON.parse(raw));
  } catch (firstError) {
    const repairSystemPrompt = [
      "Repair the JSON so it matches the required schema.",
      "Return ONLY valid JSON. Do not add explanations.",
      "",
      "Original system prompt:",
      systemPrompt,
    ].join("\n");
    const repairUserMessage = [
      "Original user message:",
      userMessage,
      "",
      "Invalid output:",
      raw,
      "",
      "Validation error:",
      firstError instanceof Error ? firstError.message : String(firstError),
    ].join("\n");

    const repaired = await generateResponse(repairSystemPrompt, repairUserMessage, MODEL_CONFIG);
    try {
      return schema.parse(JSON.parse(repaired.content));
    } catch (secondError) {
      const message = secondError instanceof Error ? secondError.message : String(secondError);
      throw new Error(`Invalid campaign builder output: ${message}`);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify green**

```bash
npm test -- tests/unit/campaign-builder.test.ts
```

Expected: all 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/campaign-builder.ts tests/unit/campaign-builder.test.ts
git commit -m "feat: campaign builder v2 core with plan, phase gen, and phase edit"
```

---

### Task 3: Campaign Builder Store V2

**Files:**
- Modify: `src/lib/ai/campaign-builder-store.ts`
- Modify: `tests/unit/campaign-builder-store.test.ts`

- [ ] **Step 1: Write failing store tests**

Replace `tests/unit/campaign-builder-store.test.ts` entirely:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignPlan, GeneratedCampaignPhase, PhaseEditResponse } from "@/lib/ai/campaign-builder";
import {
  loadBuilderTenantContext,
  saveCampaignPlan,
  loadCampaignForPhaseGen,
  saveGeneratedPhases,
  loadCampaignForPhaseEdit,
  applyPhaseEdit,
} from "@/lib/ai/campaign-builder-store";

const plan: CampaignPlan = {
  goal_summary: "Qualify leads through trust",
  selling_approach: "Trust-first",
  buyer_context: "Warm leads",
  key_behaviors: ["Lead with empathy"],
  phase_outline: [
    { name: "Intent", purpose: "Understand what they want" },
    { name: "Trust", purpose: "Build rapport" },
    { name: "Qualify", purpose: "Guide to form" },
  ],
};

const phases: GeneratedCampaignPhase[] = [
  { name: "Intent", order_index: 0, max_messages: 3, system_prompt: "Ask.", tone: "warm", goals: "Know intent.", transition_hint: "Intent clear." },
  { name: "Trust", order_index: 1, max_messages: 4, system_prompt: "Build.", tone: "helpful", goals: "Build trust.", transition_hint: "Trust built." },
  { name: "Qualify", order_index: 2, max_messages: 3, system_prompt: "Guide.", tone: "calm", goals: "Qualify.", transition_hint: "Final." },
];

describe("campaign-builder-store v2", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads tenant context with primary campaign", async () => {
    const service = {
      from: vi.fn((table: string) => {
        if (table === "tenants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    name: "Acme", business_type: "services", bot_goal: "qualify_leads",
                    business_description: "Lead gen.", main_action: "form",
                    differentiator: null, qualification_criteria: null,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        };
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const ctx = await loadBuilderTenantContext(service, "t-1");
    expect(ctx.tenantName).toBe("Acme");
  });

  it("creates a new draft campaign with plan and rules", async () => {
    const insertCampaign = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "camp-1", name: "Trust First", status: "draft" },
          error: null,
        }),
      }),
    });
    const service = {
      from: vi.fn(() => ({ insert: insertCampaign })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await saveCampaignPlan(service, "t-1", {
      campaignName: "Trust First",
      campaignDescription: "Trust-first campaign.",
      campaignGoal: "form_submit",
      plan,
      rules: ["Never hard sell"],
    });

    expect(result.id).toBe("camp-1");
    expect(insertCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "t-1",
        status: "draft",
        campaign_plan: plan,
        campaign_rules: ["Never hard sell"],
      })
    );
  });

  it("updates an existing campaign's plan and rules", async () => {
    const updateCampaign = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "camp-1", name: "Updated", status: "draft" },
              error: null,
            }),
          }),
        }),
      }),
    });
    const service = {
      from: vi.fn(() => ({ update: updateCampaign })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await saveCampaignPlan(service, "t-1", {
      campaignId: "camp-1",
      campaignName: "Updated",
      campaignDescription: "Updated desc.",
      campaignGoal: "form_submit",
      plan,
      rules: ["Rule 1"],
    });

    expect(result.id).toBe("camp-1");
    expect(updateCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ campaign_plan: plan, campaign_rules: ["Rule 1"] })
    );
  });

  it("loads campaign plan and rules for phase generation", async () => {
    const service = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "camp-1", campaign_plan: plan, campaign_rules: ["Rule"],
                  status: "draft", is_primary: false,
                },
                error: null,
              }),
            }),
          }),
        }),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await loadCampaignForPhaseGen(service, "t-1", "camp-1");
    expect(result.plan.goal_summary).toContain("Qualify");
    expect(result.rules).toEqual(["Rule"]);
  });

  it("throws when campaign has no plan for phase generation", async () => {
    const service = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "camp-1", campaign_plan: null, campaign_rules: [], status: "draft", is_primary: false },
                error: null,
              }),
            }),
          }),
        }),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(loadCampaignForPhaseGen(service, "t-1", "camp-1")).rejects.toThrow("No campaign plan");
  });

  it("saves generated phases, replacing any existing ones", async () => {
    const deleteFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    const insertFn = vi.fn().mockResolvedValue({ error: null });

    const service = {
      from: vi.fn((table: string) => {
        if (table === "campaign_phases") {
          return { delete: deleteFn, insert: insertFn };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await saveGeneratedPhases(service, "t-1", "camp-1", phases);

    expect(deleteFn).toHaveBeenCalled();
    expect(insertFn).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ campaign_id: "camp-1", name: "Intent", order_index: 0 }),
      ])
    );
  });

  it("applies a phase edit update action", async () => {
    const deleteFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const updateRules = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const service = {
      from: vi.fn((table: string) => {
        if (table === "campaign_phases") return { delete: deleteFn, insert: insertFn };
        if (table === "campaigns") return { update: updateRules };
        throw new Error(`Unexpected table ${table}`);
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const editResult: PhaseEditResponse = {
      action: "update",
      phases,
      updatedIndices: [1],
      rulesUpdate: ["New rule"],
    };

    await applyPhaseEdit(service, "t-1", "camp-1", editResult);

    expect(deleteFn).toHaveBeenCalled();
    expect(insertFn).toHaveBeenCalled();
    expect(updateRules).toHaveBeenCalledWith(
      expect.objectContaining({ campaign_rules: ["New rule"] })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/campaign-builder-store.test.ts
```

Expected: FAIL — `saveCampaignPlan` not found in exports.

- [ ] **Step 3: Implement store v2**

Replace `src/lib/ai/campaign-builder-store.ts` entirely:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type {
  CampaignBuilderTenantContext,
  CampaignGoal,
  CampaignPlan,
  GeneratedCampaignPhase,
  PhaseEditResponse,
} from "@/lib/ai/campaign-builder";

type ServiceClient = SupabaseClient<Database>;

export async function loadBuilderTenantContext(
  service: ServiceClient,
  tenantId: string
): Promise<CampaignBuilderTenantContext> {
  const { data: tenant, error } = await service
    .from("tenants")
    .select("name, business_type, bot_goal, business_description, main_action, differentiator, qualification_criteria")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) throw new Error("Tenant context not found");

  const { data: primary } = await service
    .from("campaigns")
    .select("id, name, description, goal")
    .eq("tenant_id", tenantId)
    .eq("is_primary", true)
    .maybeSingle();

  return {
    tenantName: tenant.name,
    businessType: tenant.business_type,
    botGoal: tenant.bot_goal,
    businessDescription: tenant.business_description,
    mainAction: tenant.main_action,
    differentiator: tenant.differentiator,
    qualificationCriteria: tenant.qualification_criteria,
    primaryCampaign: primary ?? null,
  };
}

// --- Plan persistence ---

export async function saveCampaignPlan(
  service: ServiceClient,
  tenantId: string,
  input: {
    campaignId?: string;
    campaignName: string;
    campaignDescription: string;
    campaignGoal: CampaignGoal;
    plan: CampaignPlan;
    rules: string[];
  }
) {
  if (input.campaignId) {
    const { data, error } = await service
      .from("campaigns")
      .update({
        name: input.campaignName,
        description: input.campaignDescription,
        goal: input.campaignGoal,
        campaign_plan: input.plan,
        campaign_rules: input.rules,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.campaignId)
      .eq("tenant_id", tenantId)
      .select("id, name, status")
      .single();

    if (error || !data) throw new Error("Failed to update campaign plan");
    return data;
  }

  const { data, error } = await service
    .from("campaigns")
    .insert({
      tenant_id: tenantId,
      name: input.campaignName,
      description: input.campaignDescription,
      goal: input.campaignGoal,
      campaign_plan: input.plan,
      campaign_rules: input.rules,
      is_primary: false,
      status: "draft",
    })
    .select("id, name, status")
    .single();

  if (error || !data) throw new Error("Failed to create campaign with plan");
  return data;
}

// --- Phase generation persistence ---

export async function loadCampaignForPhaseGen(
  service: ServiceClient,
  tenantId: string,
  campaignId: string
): Promise<{ plan: CampaignPlan; rules: string[] }> {
  const { data, error } = await service
    .from("campaigns")
    .select("id, campaign_plan, campaign_rules, status, is_primary")
    .eq("id", campaignId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !data) throw new Error("Campaign not found");
  if (data.is_primary) throw new Error("Cannot generate phases for primary campaign");
  if (!data.campaign_plan) throw new Error("No campaign plan found");

  return {
    plan: data.campaign_plan as CampaignPlan,
    rules: (data.campaign_rules ?? []) as string[],
  };
}

function phaseRows(tenantId: string, campaignId: string, phases: GeneratedCampaignPhase[]) {
  return phases.map((phase, index) => ({
    campaign_id: campaignId,
    tenant_id: tenantId,
    name: phase.name,
    order_index: index,
    max_messages: phase.max_messages,
    system_prompt: phase.system_prompt,
    tone: phase.tone,
    goals: phase.goals,
    transition_hint: phase.transition_hint,
    action_button_ids: [],
    image_attachment_ids: [],
  }));
}

export async function saveGeneratedPhases(
  service: ServiceClient,
  tenantId: string,
  campaignId: string,
  phases: GeneratedCampaignPhase[]
) {
  const { error: deleteError } = await service
    .from("campaign_phases")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("tenant_id", tenantId);

  if (deleteError) throw new Error("Failed to clear existing phases");

  const { error: insertError } = await service
    .from("campaign_phases")
    .insert(phaseRows(tenantId, campaignId, phases));

  if (insertError) throw new Error("Failed to save generated phases");
}

// --- Phase edit persistence ---

export async function loadCampaignForPhaseEdit(
  service: ServiceClient,
  tenantId: string,
  campaignId: string
): Promise<{ plan: CampaignPlan; rules: string[]; phases: GeneratedCampaignPhase[] }> {
  const { plan, rules } = await loadCampaignForPhaseGen(service, tenantId, campaignId);

  const { data: phaseData, error } = await service
    .from("campaign_phases")
    .select("name, order_index, max_messages, system_prompt, tone, goals, transition_hint")
    .eq("campaign_id", campaignId)
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: true });

  if (error) throw new Error("Failed to load phases");

  const phases: GeneratedCampaignPhase[] = (phaseData ?? []).map((p) => ({
    name: p.name,
    order_index: p.order_index,
    max_messages: p.max_messages,
    system_prompt: p.system_prompt,
    tone: p.tone ?? "friendly and helpful",
    goals: p.goals ?? "",
    transition_hint: p.transition_hint ?? "",
  }));

  return { plan, rules, phases };
}

export async function applyPhaseEdit(
  service: ServiceClient,
  tenantId: string,
  campaignId: string,
  editResult: PhaseEditResponse
) {
  const { error: deleteError } = await service
    .from("campaign_phases")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("tenant_id", tenantId);

  if (deleteError) throw new Error("Failed to clear phases for edit");

  const { error: insertError } = await service
    .from("campaign_phases")
    .insert(phaseRows(tenantId, campaignId, editResult.phases));

  if (insertError) throw new Error("Failed to save edited phases");

  if (editResult.rulesUpdate) {
    const { error: rulesError } = await service
      .from("campaigns")
      .update({ campaign_rules: editResult.rulesUpdate, updated_at: new Date().toISOString() })
      .eq("id", campaignId)
      .eq("tenant_id", tenantId);

    if (rulesError) throw new Error("Failed to update campaign rules");
  }
}
```

- [ ] **Step 4: Run tests to verify green**

```bash
npm test -- tests/unit/campaign-builder-store.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/campaign-builder-store.ts tests/unit/campaign-builder-store.test.ts
git commit -m "feat: campaign builder store v2 with plan and phase edit persistence"
```

---

### Task 4: Plan, Phases, And Phase-Edit API Routes

**Files:**
- Delete: `src/app/api/campaigns/ai-builder/generate/route.ts`
- Delete: `src/app/api/campaigns/ai-builder/revise/route.ts`
- Create: `src/app/api/campaigns/ai-builder/plan/route.ts`
- Create: `src/app/api/campaigns/ai-builder/phases/route.ts`
- Create: `src/app/api/campaigns/ai-builder/phase-edit/route.ts`
- Delete: `tests/unit/campaigns-ai-builder-api.test.ts`
- Create: `tests/unit/campaign-builder-v2-api.test.ts`

- [ ] **Step 1: Write failing API route tests**

Create `tests/unit/campaign-builder-v2-api.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSession } from "@/lib/auth/session";

vi.mock("@/lib/auth/session", () => ({ resolveSession: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: vi.fn() })),
}));
vi.mock("@/lib/ai/campaign-builder-store", () => ({
  loadBuilderTenantContext: vi.fn(),
  saveCampaignPlan: vi.fn(),
  loadCampaignForPhaseGen: vi.fn(),
  saveGeneratedPhases: vi.fn(),
  loadCampaignForPhaseEdit: vi.fn(),
  applyPhaseEdit: vi.fn(),
}));
vi.mock("@/lib/ai/campaign-builder", () => ({
  generatePlan: vi.fn(),
  generatePhasesFromPlan: vi.fn(),
  editPhases: vi.fn(),
}));

import {
  loadBuilderTenantContext,
  saveCampaignPlan,
  loadCampaignForPhaseGen,
  saveGeneratedPhases,
  loadCampaignForPhaseEdit,
  applyPhaseEdit,
} from "@/lib/ai/campaign-builder-store";
import { generatePlan, generatePhasesFromPlan, editPhases } from "@/lib/ai/campaign-builder";

const mockSession = vi.mocked(resolveSession);
const mockLoadContext = vi.mocked(loadBuilderTenantContext);
const mockSavePlan = vi.mocked(saveCampaignPlan);
const mockLoadPhaseGen = vi.mocked(loadCampaignForPhaseGen);
const mockSavePhases = vi.mocked(saveGeneratedPhases);
const mockLoadPhaseEdit = vi.mocked(loadCampaignForPhaseEdit);
const mockApplyEdit = vi.mocked(applyPhaseEdit);
const mockGeneratePlan = vi.mocked(generatePlan);
const mockGenPhasesFromPlan = vi.mocked(generatePhasesFromPlan);
const mockEditPhases = vi.mocked(editPhases);

const context = {
  tenantName: "Acme", businessType: "services", botGoal: "qualify_leads",
  businessDescription: "Lead gen.", mainAction: "form",
  differentiator: null, qualificationCriteria: null, primaryCampaign: null,
};

const plan = {
  goal_summary: "Qualify leads", selling_approach: "Trust-first",
  buyer_context: "Warm leads", key_behaviors: ["Empathy"],
  phase_outline: [{ name: "Intent", purpose: "Understand" }, { name: "Trust", purpose: "Build" }, { name: "Qualify", purpose: "Guide" }],
};

const phases = [
  { name: "Intent", order_index: 0, max_messages: 3, system_prompt: "Ask.", tone: "warm", goals: "Intent.", transition_hint: "Clear." },
  { name: "Trust", order_index: 1, max_messages: 4, system_prompt: "Build.", tone: "helpful", goals: "Trust.", transition_hint: "Built." },
  { name: "Qualify", order_index: 2, max_messages: 3, system_prompt: "Guide.", tone: "calm", goals: "Qualify.", transition_hint: "Final." },
];

describe("POST /api/campaigns/ai-builder/plan", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("returns 401 when unauthenticated", async () => {
    mockSession.mockResolvedValue(null);
    const { POST } = await import("@/app/api/campaigns/ai-builder/plan/route");
    const res = await POST(new Request("http://localhost/api/campaigns/ai-builder/plan", {
      method: "POST", body: JSON.stringify({ message: "Build a campaign" }),
    }));
    expect(res.status).toBe(401);
  });

  it("returns a plan response with campaign id", async () => {
    mockSession.mockResolvedValue({ userId: "u-1", tenantId: "t-1" });
    mockLoadContext.mockResolvedValue(context);
    mockGeneratePlan.mockResolvedValue({
      action: "plan", campaign_name: "Trust First", campaign_description: "Desc.",
      campaign_goal: "form_submit", plan, campaign_rules: ["Rule 1"],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockSavePlan.mockResolvedValue({ id: "camp-1", name: "Trust First", status: "draft" } as any);

    const { POST } = await import("@/app/api/campaigns/ai-builder/plan/route");
    const res = await POST(new Request("http://localhost/api/campaigns/ai-builder/plan", {
      method: "POST", body: JSON.stringify({ message: "Build a trust-first campaign" }),
    }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.action).toBe("plan");
    expect(body.campaign.id).toBe("camp-1");
    expect(body.plan.goal_summary).toContain("Qualify");
  });

  it("returns a question response without creating a campaign", async () => {
    mockSession.mockResolvedValue({ userId: "u-1", tenantId: "t-1" });
    mockLoadContext.mockResolvedValue(context);
    mockGeneratePlan.mockResolvedValue({
      action: "question", question: "What objections do they have?",
    });

    const { POST } = await import("@/app/api/campaigns/ai-builder/plan/route");
    const res = await POST(new Request("http://localhost/api/campaigns/ai-builder/plan", {
      method: "POST", body: JSON.stringify({ message: "booking campaign" }),
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.action).toBe("question");
    expect(body.question).toContain("objections");
    expect(mockSavePlan).not.toHaveBeenCalled();
  });
});

describe("POST /api/campaigns/ai-builder/phases", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("generates and saves phases from the campaign plan", async () => {
    mockSession.mockResolvedValue({ userId: "u-1", tenantId: "t-1" });
    mockLoadContext.mockResolvedValue(context);
    mockLoadPhaseGen.mockResolvedValue({ plan, rules: ["Rule 1"] });
    mockGenPhasesFromPlan.mockResolvedValue(phases);

    const { POST } = await import("@/app/api/campaigns/ai-builder/phases/route");
    const res = await POST(new Request("http://localhost/api/campaigns/ai-builder/phases", {
      method: "POST", body: JSON.stringify({ campaignId: "camp-1" }),
    }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.phases).toHaveLength(3);
    expect(mockSavePhases).toHaveBeenCalledWith(expect.anything(), "t-1", "camp-1", phases);
  });
});

describe("POST /api/campaigns/ai-builder/phase-edit", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("edits phases and returns the result with updated indices", async () => {
    mockSession.mockResolvedValue({ userId: "u-1", tenantId: "t-1" });
    mockLoadContext.mockResolvedValue(context);
    mockLoadPhaseEdit.mockResolvedValue({ plan, rules: ["Rule"], phases });
    const editResult = { action: "update" as const, phases, updatedIndices: [1] };
    mockEditPhases.mockResolvedValue(editResult);

    const { POST } = await import("@/app/api/campaigns/ai-builder/phase-edit/route");
    const res = await POST(new Request("http://localhost/api/campaigns/ai-builder/phase-edit", {
      method: "POST", body: JSON.stringify({ campaignId: "camp-1", message: "Make phase 2 softer." }),
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.action).toBe("update");
    expect(body.updatedIndices).toEqual([1]);
    expect(mockApplyEdit).toHaveBeenCalledWith(expect.anything(), "t-1", "camp-1", editResult);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/campaign-builder-v2-api.test.ts
```

Expected: FAIL — route modules not found.

- [ ] **Step 3: Delete old routes and test file**

```bash
rm src/app/api/campaigns/ai-builder/generate/route.ts
rm src/app/api/campaigns/ai-builder/revise/route.ts
rmdir src/app/api/campaigns/ai-builder/generate
rmdir src/app/api/campaigns/ai-builder/revise
rm tests/unit/campaigns-ai-builder-api.test.ts
```

- [ ] **Step 4: Create plan route**

Create `src/app/api/campaigns/ai-builder/plan/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import { generatePlan } from "@/lib/ai/campaign-builder";
import { loadBuilderTenantContext, saveCampaignPlan } from "@/lib/ai/campaign-builder-store";

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(2000),
});

const planSchema = z.object({
  message: z.string().trim().min(3).max(2000),
  history: z.array(chatMessageSchema).max(20).optional(),
  campaignId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = planSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const service = createServiceClient();
    const context = await loadBuilderTenantContext(service, session.tenantId);

    const result = await generatePlan({
      context,
      message: parsed.data.message,
      history: parsed.data.history,
    });

    if (result.action === "question") {
      return NextResponse.json({
        action: "question",
        question: result.question,
        campaign: parsed.data.campaignId ? { id: parsed.data.campaignId } : null,
      });
    }

    const campaign = await saveCampaignPlan(service, session.tenantId, {
      campaignId: parsed.data.campaignId,
      campaignName: result.campaign_name,
      campaignDescription: result.campaign_description,
      campaignGoal: result.campaign_goal,
      plan: result.plan,
      rules: result.campaign_rules,
    });

    return NextResponse.json({
      action: "plan",
      campaign,
      plan: result.plan,
      rules: result.campaign_rules,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 5: Create phases route**

Create `src/app/api/campaigns/ai-builder/phases/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import { generatePhasesFromPlan } from "@/lib/ai/campaign-builder";
import {
  loadBuilderTenantContext,
  loadCampaignForPhaseGen,
  saveGeneratedPhases,
} from "@/lib/ai/campaign-builder-store";

const phasesSchema = z.object({
  campaignId: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = phasesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const service = createServiceClient();
    const [context, { plan, rules }] = await Promise.all([
      loadBuilderTenantContext(service, session.tenantId),
      loadCampaignForPhaseGen(service, session.tenantId, parsed.data.campaignId),
    ]);

    const phases = await generatePhasesFromPlan({ context, plan, rules });
    await saveGeneratedPhases(service, session.tenantId, parsed.data.campaignId, phases);

    return NextResponse.json({ phases }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate phases";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 6: Create phase-edit route**

Create `src/app/api/campaigns/ai-builder/phase-edit/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import { editPhases } from "@/lib/ai/campaign-builder";
import {
  loadBuilderTenantContext,
  loadCampaignForPhaseEdit,
  applyPhaseEdit,
} from "@/lib/ai/campaign-builder-store";

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(2000),
});

const phaseEditSchema = z.object({
  campaignId: z.string().min(1),
  message: z.string().trim().min(3).max(2000),
  history: z.array(chatMessageSchema).max(20).optional(),
  focusedPhaseIndex: z.number().int().min(0).optional(),
});

export async function POST(request: Request) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = phaseEditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const service = createServiceClient();
    const [context, campaignData] = await Promise.all([
      loadBuilderTenantContext(service, session.tenantId),
      loadCampaignForPhaseEdit(service, session.tenantId, parsed.data.campaignId),
    ]);

    const result = await editPhases({
      context,
      plan: campaignData.plan,
      rules: campaignData.rules,
      currentPhases: campaignData.phases,
      message: parsed.data.message,
      focusedPhaseIndex: parsed.data.focusedPhaseIndex,
      history: parsed.data.history,
    });

    await applyPhaseEdit(service, session.tenantId, parsed.data.campaignId, result);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to edit phases";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 7: Run tests to verify green**

```bash
npm test -- tests/unit/campaign-builder-v2-api.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 8: Commit**

```bash
git add -A src/app/api/campaigns/ai-builder/ tests/unit/campaign-builder-v2-api.test.ts
git rm tests/unit/campaigns-ai-builder-api.test.ts 2>/dev/null || true
git commit -m "feat: replace generate/revise api with plan/phases/phase-edit"
```

---

### Task 5: Prompt Builder Campaign Rules Layer

**Files:**
- Modify: `src/lib/ai/prompt-builder.ts`
- Modify: `tests/unit/prompt-builder.test.ts`

- [ ] **Step 1: Write failing test for campaign rules layer**

Add this test to the existing `tests/unit/prompt-builder.test.ts` describe block:

```ts
it("includes campaign rules as Layer 2.5 when provided", async () => {
  // Use the same test setup pattern as existing tests in this file.
  // Set campaign context with campaignRules:
  const ctx = {
    ...baseCtx,
    campaign: {
      name: "Trust First",
      description: "Trust-first campaign.",
      goal: "form_submit",
      campaignRules: ["Always mention the free consultation", "Never discuss pricing until phase 2"],
    },
  };

  const prompt = await buildSystemPrompt(ctx);

  expect(prompt).toContain("--- CAMPAIGN RULES ---");
  expect(prompt).toContain("Always mention the free consultation");
  expect(prompt).toContain("Never discuss pricing until phase 2");
});

it("skips campaign rules layer when rules are empty", async () => {
  const ctx = {
    ...baseCtx,
    campaign: {
      name: "Trust First",
      description: "Trust-first campaign.",
      goal: "form_submit",
      campaignRules: [],
    },
  };

  const prompt = await buildSystemPrompt(ctx);

  expect(prompt).not.toContain("--- CAMPAIGN RULES ---");
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/prompt-builder.test.ts
```

Expected: FAIL — `campaignRules` not recognized / layer not present.

- [ ] **Step 3: Update CampaignContext and add buildCampaignRules**

In `src/lib/ai/prompt-builder.ts`:

1. Add `campaignRules` to the `CampaignContext` interface:

```ts
export interface CampaignContext {
  name: string;
  description: string | null;
  goal: string;
  campaignRules?: string[];
}
```

2. Add the `buildCampaignRules` function after `buildBotRules`:

```ts
function buildCampaignRules(rules?: string[]): string {
  if (!rules || rules.length === 0) return "";
  return [
    "--- CAMPAIGN RULES ---",
    "These rules apply to this specific campaign. Follow them in every phase:",
    ...rules.map((r) => `- ${r}`),
  ].join("\n");
}
```

3. In the main `buildSystemPrompt` function, insert the campaign rules layer between `layer2` (bot rules) and `layer3` (offering context). Find the line that assembles the layers and add:

```ts
const campaignRulesLayer = buildCampaignRules(ctx.campaign?.campaignRules);
```

Then include `campaignRulesLayer` in the final join between `layer2` and `layer3`.

- [ ] **Step 4: Run tests to verify green**

```bash
npm test -- tests/unit/prompt-builder.test.ts
```

Expected: all tests pass including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/prompt-builder.ts tests/unit/prompt-builder.test.ts
git commit -m "feat: add campaign rules layer to prompt builder"
```

---

### Task 6: Campaign PATCH API — Support Campaign Rules

**Files:**
- Modify: `src/app/api/campaigns/[id]/route.ts`

- [ ] **Step 1: Add `campaign_rules` to the PATCH schema**

In `src/app/api/campaigns/[id]/route.ts`, find the Zod schema for the PATCH handler and add:

```ts
campaign_rules: z.array(z.string().min(1).max(300)).max(10).optional(),
```

- [ ] **Step 2: Verify the update payload passes `campaign_rules` through**

Check that the PATCH handler spreads validated fields into the Supabase update call. Since it already does this pattern, `campaign_rules` should flow through automatically. If it constructs the update object field by field, add `campaign_rules: parsed.data.campaign_rules` to the update object.

- [ ] **Step 3: Run existing campaign PATCH tests**

```bash
npm test -- tests/unit/campaigns-detail-api.test.ts
```

Expected: existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/api/campaigns/[id]/route.ts'
git commit -m "feat: support campaign_rules in campaign patch api"
```

---

### Task 7: Conversation Engine — Pass Campaign Rules

**Files:**
- Modify: `src/lib/ai/conversation-engine.ts`

- [ ] **Step 1: Update campaign context loading to include rules**

In `conversation-engine.ts`, find where the campaign context is fetched (the query that loads campaign name, description, goal). Add `campaign_rules` to the select.

- [ ] **Step 2: Pass `campaignRules` to `buildSystemPrompt`**

Find where the `campaign` field is set on the `PromptContext` object and add the `campaignRules` field:

```ts
campaign: {
  name: campaignRecord.name,
  description: campaignRecord.description,
  goal: campaignRecord.goal,
  campaignRules: campaignRecord.campaign_rules ?? [],
},
```

- [ ] **Step 3: Run conversation engine tests**

```bash
npm test -- tests/unit/conversation-engine.test.ts
```

Expected: existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/conversation-engine.ts
git commit -m "feat: pass campaign rules to prompt builder in conversation engine"
```

---

### Task 8: Builder UI — Preview And Chat Components

**Files:**
- Modify: `src/components/dashboard/campaigns/AiBuilderPreview.tsx`
- Modify: `src/components/dashboard/campaigns/AiBuilderChat.tsx`

- [ ] **Step 1: Rewrite AiBuilderPreview for three states**

Replace `src/components/dashboard/campaigns/AiBuilderPreview.tsx` entirely:

```tsx
"use client";

import { ArrowRight, CheckCircle2, FlaskConical, Pencil, Plus, Rocket } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import type { CampaignPlan, GeneratedCampaignPhase } from "@/lib/ai/campaign-builder";

interface PreviewCampaign {
  id: string;
  name: string;
  description?: string | null;
  goal?: string;
}

interface AiBuilderPreviewProps {
  campaign: PreviewCampaign | null;
  plan: CampaignPlan | null;
  rules: string[];
  phases: GeneratedCampaignPhase[];
  focusedPhaseIndex: number | null;
  actionLoading: string | null;
  onGeneratePhases: () => void;
  onAddPhase: () => void;
  onFocusPhase: (index: number | null) => void;
  onTestAgainstPrimary: () => void;
  onMakePrimary: () => void;
}

const GOAL_LABELS: Record<string, string> = {
  form_submit: "Form Submitted",
  appointment_booked: "Appointment Booked",
  purchase: "Purchase",
  stage_reached: "Stage Reached",
};

export default function AiBuilderPreview({
  campaign,
  plan,
  rules,
  phases,
  focusedPhaseIndex,
  actionLoading,
  onGeneratePhases,
  onAddPhase,
  onFocusPhase,
  onTestAgainstPrimary,
  onMakePrimary,
}: AiBuilderPreviewProps) {
  if (!plan) {
    return (
      <section className="flex min-h-[620px] flex-1 items-center justify-center bg-[var(--ws-page)] p-8">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ws-accent-subtle)]">
            <Rocket className="h-5 w-5 text-[var(--ws-accent)]" />
          </div>
          <h2 className="text-base font-semibold text-[var(--ws-text-primary)]">
            Draft preview appears here
          </h2>
          <p className="mt-2 text-sm text-[var(--ws-text-muted)]">
            Describe the campaign you want to build. The AI will design a plan before generating phases.
          </p>
        </div>
      </section>
    );
  }

  const hasPhases = phases.length > 0;

  return (
    <section className="flex-1 overflow-y-auto bg-[var(--ws-page)] p-6">
      {campaign && (
        <div className="mb-5">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="default">DRAFT</Badge>
            {campaign.goal && (
              <Badge variant="success">{GOAL_LABELS[campaign.goal] ?? campaign.goal}</Badge>
            )}
          </div>
          <h1 className="text-xl font-semibold text-[var(--ws-text-primary)]">{campaign.name}</h1>
          {campaign.description && (
            <p className="mt-1 max-w-2xl text-sm text-[var(--ws-text-muted)]">{campaign.description}</p>
          )}
        </div>
      )}

      <div className={`mb-5 rounded-lg border border-[var(--ws-border)] bg-white p-4 ${hasPhases ? "" : ""}`}>
        <h2 className="mb-3 text-sm font-semibold text-[var(--ws-text-primary)]">
          Campaign Plan
        </h2>
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <span className="text-xs text-[var(--ws-text-muted)]">Goal</span>
            <p className="font-medium text-[var(--ws-text-primary)]">{plan.goal_summary}</p>
          </div>
          <div>
            <span className="text-xs text-[var(--ws-text-muted)]">Approach</span>
            <p className="font-medium text-[var(--ws-text-primary)]">{plan.selling_approach}</p>
          </div>
          <div>
            <span className="text-xs text-[var(--ws-text-muted)]">Buyer Context</span>
            <p className="font-medium text-[var(--ws-text-primary)]">{plan.buyer_context}</p>
          </div>
        </div>
        <div className="mt-4">
          <span className="text-xs text-[var(--ws-text-muted)]">Key Behaviors</span>
          <ul className="mt-1 list-inside list-disc text-sm text-[var(--ws-text-secondary)]">
            {plan.key_behaviors.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </div>
        {!hasPhases && (
          <div className="mt-4">
            <span className="text-xs text-[var(--ws-text-muted)]">Phase Outline</span>
            <ol className="mt-1 list-inside list-decimal text-sm text-[var(--ws-text-secondary)]">
              {plan.phase_outline.map((p) => (
                <li key={p.name}><strong>{p.name}</strong> — {p.purpose}</li>
              ))}
            </ol>
          </div>
        )}
        {rules.length > 0 && (
          <div className="mt-4">
            <span className="text-xs text-[var(--ws-text-muted)]">Campaign Rules</span>
            <ul className="mt-1 list-inside list-disc text-sm text-[var(--ws-text-secondary)]">
              {rules.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        )}
      </div>

      {!hasPhases && (
        <Button
          variant="primary"
          onClick={onGeneratePhases}
          disabled={actionLoading !== null}
        >
          {actionLoading === "phases" ? "Generating Phases..." : "Generate Phases"}
        </Button>
      )}

      {hasPhases && (
        <>
          <div className="mb-5 rounded-lg border border-[var(--ws-border)] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-[var(--ws-text-primary)]">
              Generated Phases
            </h2>
            <div className="space-y-3">
              {phases.map((phase, index) => (
                <button
                  key={`${phase.name}-${index}`}
                  type="button"
                  onClick={() => onFocusPhase(focusedPhaseIndex === index ? null : index)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    focusedPhaseIndex === index
                      ? "border-[var(--ws-accent)] bg-[var(--ws-accent-subtle)]"
                      : "border-[var(--ws-border)] hover:border-[var(--ws-accent)]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ws-accent-subtle)] text-xs font-semibold text-[var(--ws-accent)]">
                      {index + 1}
                    </span>
                    <h3 className="text-sm font-semibold text-[var(--ws-text-primary)]">{phase.name}</h3>
                  </div>
                  <p className="mt-2 text-sm text-[var(--ws-text-secondary)]">{phase.goals}</p>
                  <p className="mt-1 text-xs text-[var(--ws-text-muted)]">Tone: {phase.tone}</p>
                </button>
              ))}
            </div>
            <div className="mt-3">
              <Button variant="secondary" onClick={onAddPhase} disabled={actionLoading !== null}>
                <Plus className="h-4 w-4" />
                Add Phase
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {campaign && (
              <Link href={`/app/campaigns/${campaign.id}`}>
                <Button variant="secondary">
                  <Pencil className="h-4 w-4" />
                  Edit Draft
                </Button>
              </Link>
            )}
            <Button variant="secondary" onClick={onTestAgainstPrimary} disabled={actionLoading !== null}>
              <FlaskConical className="h-4 w-4" />
              {actionLoading === "test" ? "Creating Test..." : "Test Against Primary"}
            </Button>
            <Button variant="primary" onClick={onMakePrimary} disabled={actionLoading !== null}>
              <CheckCircle2 className="h-4 w-4" />
              {actionLoading === "primary" ? "Promoting..." : "Make Primary"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Update AiBuilderChat for adaptive placeholders**

In `src/components/dashboard/campaigns/AiBuilderChat.tsx`:

1. Update the props interface:

```tsx
interface AiBuilderChatProps {
  messages: BuilderMessage[];
  value: string;
  builderState: "no_plan" | "has_plan" | "has_phases";
  focusedPhaseName: string | null;
  loading: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
}
```

2. Replace the `hasDraft` prop usage. Update the placeholder logic:

```tsx
const placeholder = (() => {
  if (focusedPhaseName) return `Describe changes for ${focusedPhaseName}...`;
  switch (builderState) {
    case "no_plan": return "Describe the campaign you want to build...";
    case "has_plan": return "Revise the plan or click Generate Phases...";
    case "has_phases": return "Describe changes to the campaign...";
  }
})();
```

3. Change the button label from the conditional `hasDraft ? "Revise Draft" : "Generate Draft"` to just `"Send"`.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/campaigns/AiBuilderPreview.tsx src/components/dashboard/campaigns/AiBuilderChat.tsx
git commit -m "feat: update builder preview and chat for plan-first flow"
```

---

### Task 9: Builder Client Orchestration

**Files:**
- Modify: `src/app/(tenant)/app/campaigns/ai-builder/AiCampaignBuilderClient.tsx`
- Modify: `tests/unit/ai-campaign-builder-client.test.tsx`

- [ ] **Step 1: Write failing client tests**

Replace `tests/unit/ai-campaign-builder-client.test.tsx` entirely:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AiCampaignBuilderClient from "@/app/(tenant)/app/campaigns/ai-builder/AiCampaignBuilderClient";

const push = vi.fn();
const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const planResponse = {
  action: "plan",
  campaign: { id: "camp-1", name: "Trust First", status: "draft", goal: "form_submit" },
  plan: {
    goal_summary: "Qualify leads through trust",
    selling_approach: "Trust-first approach",
    buyer_context: "Warm leads from ads",
    key_behaviors: ["Lead with empathy"],
    phase_outline: [
      { name: "Intent", purpose: "Understand what they want" },
      { name: "Trust", purpose: "Build rapport" },
      { name: "Qualify", purpose: "Guide to form" },
    ],
  },
  rules: ["Never hard sell"],
};

const questionResponse = {
  action: "question",
  question: "What objections do your leads usually have?",
  campaign: null,
};

const phasesResponse = {
  phases: [
    { name: "Intent", order_index: 0, max_messages: 3, system_prompt: "Ask.", tone: "warm", goals: "Understand intent.", transition_hint: "Clear." },
    { name: "Trust", order_index: 1, max_messages: 4, system_prompt: "Build.", tone: "helpful", goals: "Build trust.", transition_hint: "Built." },
    { name: "Qualify", order_index: 2, max_messages: 3, system_prompt: "Guide.", tone: "calm", goals: "Qualify lead.", transition_hint: "Final." },
  ],
};

describe("AiCampaignBuilderClient v2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("shows a question from the AI without generating a plan", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(questionResponse),
    });

    render(<AiCampaignBuilderClient />);
    await userEvent.type(screen.getByPlaceholderText(/Describe the campaign/i), "booking campaign");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText(/objections/i)).toBeInTheDocument();
    });

    expect(screen.queryByText("Generate Phases")).not.toBeInTheDocument();
  });

  it("generates a plan and shows the Generate Phases button", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(planResponse),
    });

    render(<AiCampaignBuilderClient />);
    await userEvent.type(screen.getByPlaceholderText(/Describe the campaign/i), "trust-first qualification");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText("Trust First")).toBeInTheDocument();
      expect(screen.getByText("Qualify leads through trust")).toBeInTheDocument();
      expect(screen.getByText("Generate Phases")).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/campaigns/ai-builder/plan",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("generates phases when the button is clicked", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(planResponse) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(phasesResponse) });

    render(<AiCampaignBuilderClient />);
    await userEvent.type(screen.getByPlaceholderText(/Describe the campaign/i), "trust-first");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));
    await screen.findByText("Generate Phases");

    await userEvent.click(screen.getByRole("button", { name: /Generate Phases/i }));

    await waitFor(() => {
      expect(screen.getByText("Intent")).toBeInTheDocument();
      expect(screen.getByText("Trust")).toBeInTheDocument();
      expect(screen.getByText("Qualify")).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenLastCalledWith(
      "/api/campaigns/ai-builder/phases",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("focuses a phase when its card is clicked", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(planResponse) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(phasesResponse) });

    render(<AiCampaignBuilderClient />);
    await userEvent.type(screen.getByPlaceholderText(/Describe the campaign/i), "trust-first");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));
    await screen.findByText("Generate Phases");
    await userEvent.click(screen.getByRole("button", { name: /Generate Phases/i }));
    await screen.findByText("Intent");

    await userEvent.click(screen.getByText("Trust").closest("button")!);

    expect(screen.getByPlaceholderText(/Describe changes for Trust/i)).toBeInTheDocument();
  });

  it("routes to experiment after testing against primary", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(planResponse) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(phasesResponse) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ experiment: { id: "exp-1" } }),
      });

    render(<AiCampaignBuilderClient />);
    await userEvent.type(screen.getByPlaceholderText(/Describe the campaign/i), "trust-first");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));
    await screen.findByText("Generate Phases");
    await userEvent.click(screen.getByRole("button", { name: /Generate Phases/i }));
    await screen.findByText("Intent");

    await userEvent.click(screen.getByRole("button", { name: /Test Against Primary/i }));

    expect(push).toHaveBeenCalledWith("/app/campaigns/experiments/exp-1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/ai-campaign-builder-client.test.tsx
```

Expected: FAIL — component doesn't match new API.

- [ ] **Step 3: Rewrite the client component**

Replace `src/app/(tenant)/app/campaigns/ai-builder/AiCampaignBuilderClient.tsx` entirely:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import AiBuilderChat, { type BuilderMessage } from "@/components/dashboard/campaigns/AiBuilderChat";
import AiBuilderPreview from "@/components/dashboard/campaigns/AiBuilderPreview";
import type { CampaignPlan, GeneratedCampaignPhase } from "@/lib/ai/campaign-builder";

interface CampaignRef {
  id: string;
  name: string;
  description?: string | null;
  goal?: string;
}

type BuilderState = "no_plan" | "has_plan" | "has_phases";

export default function AiCampaignBuilderClient() {
  const router = useRouter();
  const [messages, setMessages] = useState<BuilderMessage[]>([]);
  const [input, setInput] = useState("");
  const [campaign, setCampaign] = useState<CampaignRef | null>(null);
  const [plan, setPlan] = useState<CampaignPlan | null>(null);
  const [rules, setRules] = useState<string[]>([]);
  const [phases, setPhases] = useState<GeneratedCampaignPhase[]>([]);
  const [focusedPhaseIndex, setFocusedPhaseIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const builderState: BuilderState = !plan ? "no_plan" : phases.length > 0 ? "has_phases" : "has_plan";

  const submit = async () => {
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    const nextMessages: BuilderMessage[] = [...messages, { role: "user", text: userMessage }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      if (builderState === "has_phases") {
        const res = await fetch("/api/campaigns/ai-builder/phase-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: campaign!.id,
            message: userMessage,
            history: messages,
            focusedPhaseIndex: focusedPhaseIndex ?? undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to edit phases");

        setPhases(data.phases);
        if (data.rulesUpdate) setRules(data.rulesUpdate);
        setFocusedPhaseIndex(null);
        setMessages([...nextMessages, { role: "assistant", text: `Phases updated (${data.action}).` }]);
      } else {
        const res = await fetch("/api/campaigns/ai-builder/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: campaign?.id,
            message: userMessage,
            history: messages,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to generate plan");

        if (data.action === "question") {
          setMessages([...nextMessages, { role: "assistant", text: data.question }]);
        } else {
          setCampaign(data.campaign);
          setPlan(data.plan);
          setRules(data.rules ?? []);
          setMessages([...nextMessages, { role: "assistant", text: "Campaign plan generated. Review it and click Generate Phases when ready." }]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  };

  const generatePhases = async () => {
    if (!campaign) return;
    setActionLoading("phases");
    setError(null);
    try {
      const res = await fetch("/api/campaigns/ai-builder/phases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate phases");
      setPhases(data.phases);
      setMessages((prev) => [...prev, { role: "assistant", text: "Phases generated. Click a phase to focus on it, or describe changes." }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate phases");
    } finally {
      setActionLoading(null);
    }
  };

  const addPhase = () => {
    setFocusedPhaseIndex(null);
    setInput("Add a new phase ");
  };

  const testAgainstPrimary = async () => {
    if (!campaign) return;
    if (!window.confirm("Start a 50/50 test between your primary campaign and this draft?")) return;
    setActionLoading("test");
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/test-against-primary`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create experiment");
      router.push(`/app/campaigns/experiments/${data.experiment.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create experiment");
    } finally {
      setActionLoading(null);
    }
  };

  const makePrimary = async () => {
    if (!campaign) return;
    setActionLoading("primary");
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_primary: true, status: "active" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to promote");
      router.push(`/app/campaigns/${campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to promote");
    } finally {
      setActionLoading(null);
    }
  };

  const focusedPhaseName = focusedPhaseIndex !== null ? phases[focusedPhaseIndex]?.name ?? null : null;

  return (
    <div className="min-h-screen bg-[var(--ws-page)]">
      <div className="border-b border-[var(--ws-border)] bg-white px-6 py-4 pt-14 md:pt-4">
        <div className="flex items-center gap-3">
          <Link href="/app/campaigns" className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-[var(--ws-text-primary)]">Build Campaign With AI</h1>
            <p className="text-sm text-[var(--ws-text-muted)]">Design the sales system. Generate phases. Refine until ready.</p>
          </div>
        </div>
      </div>
      <div className="grid min-h-[calc(100vh-96px)] grid-cols-1 md:grid-cols-[420px_1fr]">
        <AiBuilderChat
          messages={messages}
          value={input}
          builderState={builderState}
          focusedPhaseName={focusedPhaseName}
          loading={loading}
          error={error}
          onChange={setInput}
          onSubmit={submit}
        />
        <AiBuilderPreview
          campaign={campaign}
          plan={plan}
          rules={rules}
          phases={phases}
          focusedPhaseIndex={focusedPhaseIndex}
          actionLoading={actionLoading}
          onGeneratePhases={generatePhases}
          onAddPhase={addPhase}
          onFocusPhase={setFocusedPhaseIndex}
          onTestAgainstPrimary={testAgainstPrimary}
          onMakePrimary={makePrimary}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify green**

```bash
npm test -- tests/unit/ai-campaign-builder-client.test.tsx
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(tenant)/app/campaigns/ai-builder/AiCampaignBuilderClient.tsx' tests/unit/ai-campaign-builder-client.test.tsx
git commit -m "feat: rewrite builder client for plan-first flow"
```

---

### Task 10: Campaign Rules Settings Editor

**Files:**
- Modify: `src/components/dashboard/campaigns/CampaignForm.tsx`

- [ ] **Step 1: Add campaign rules section to CampaignForm**

In `src/components/dashboard/campaigns/CampaignForm.tsx`, after the follow-up message section and before the save button:

1. Add state for rules (read from `campaign.campaign_rules ?? []`).

2. Add the rules editor UI:

```tsx
<div>
  <label className={labelClass}>Campaign Rules</label>
  <p className="mb-2 text-xs text-[var(--ws-text-muted)]">
    Rules the bot follows across all phases of this campaign.
  </p>
  <div className="space-y-2">
    {localRules.map((rule, index) => (
      <div key={index} className="flex items-center gap-2">
        <input
          className={inputClass}
          value={rule}
          onChange={(e) => {
            const updated = [...localRules];
            updated[index] = e.target.value;
            setLocalRules(updated);
          }}
          placeholder="e.g. Always mention the free consultation"
        />
        <button
          type="button"
          onClick={() => setLocalRules(localRules.filter((_, i) => i !== index))}
          className="text-sm text-red-500 hover:text-red-700"
        >
          Remove
        </button>
      </div>
    ))}
  </div>
  <button
    type="button"
    onClick={() => setLocalRules([...localRules, ""])}
    className="mt-2 text-sm text-[var(--ws-accent)] hover:underline"
  >
    + Add Rule
  </button>
</div>
```

3. Include `campaign_rules: localRules.filter((r) => r.trim())` in the save payload sent to `PATCH /api/campaigns/{id}`.

- [ ] **Step 2: Run the dev server and manually verify**

```bash
npm run dev
```

Navigate to `/app/campaigns/{id}` → Settings tab. Verify:
- Campaign rules section appears
- Can add/remove/edit rules
- Save persists rules

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/campaigns/CampaignForm.tsx
git commit -m "feat: add campaign rules editor to campaign settings"
```

---

### Task 11: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all targeted tests**

```bash
npm test -- tests/unit/campaign-builder.test.ts tests/unit/campaign-builder-store.test.ts tests/unit/campaign-builder-v2-api.test.ts tests/unit/campaign-test-against-primary-api.test.ts tests/unit/ai-campaign-builder-client.test.tsx tests/unit/prompt-builder.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no new TypeScript errors in our files.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no new lint errors in our files.

- [ ] **Step 4: Start dev server for manual verification**

```bash
npm run dev
```

- [ ] **Step 5: Manual browser verification**

Open `/app/campaigns` and click "Build with AI":

1. **Vague input test**: Type "booking campaign" → AI should ask a clarifying question (no plan generated yet).
2. **Detailed input test**: Type "trust-first qualification for nervous dental patients, never hard-sell, always mention the free consult" → AI should generate a plan immediately.
3. **Plan review**: Campaign plan card appears with goal, approach, behaviors, phase outline, rules.
4. **Generate Phases**: Click "Generate Phases" → phase cards appear below the plan.
5. **Phase focus**: Click a phase card → placeholder changes to "Describe changes for [Phase Name]..."
6. **Phase edit**: Type "make this phase softer" → only the focused phase updates.
7. **Add phase**: Click "Add Phase" → type "add an objection handling phase" → new phase appears.
8. **Test Against Primary**: Creates experiment and routes correctly.
9. **Campaign Settings**: Navigate to `/app/campaigns/{id}` → Settings → verify campaign rules section works.

- [ ] **Step 6: Commit any fixes from manual verification**

```bash
git add -A
git commit -m "fix: address issues from manual verification"
```

---

## Final Completion Checklist

- [ ] All new tests pass.
- [ ] Existing campaign and experiment tests pass.
- [ ] `npm run typecheck` passes (no new errors).
- [ ] `npm run lint` passes (no new errors).
- [ ] Manual builder flow works: plan → phases → edit → test.
- [ ] Campaign rules appear in conversation engine system prompt.
- [ ] Campaign rules are editable in campaign settings.
- [ ] Old generate/revise routes are removed.
- [ ] No unrelated dirty worktree changes were reverted.
