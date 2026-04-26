# Motion-First AI Campaign Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a chat-first AI campaign builder that turns a tenant's plain-language selling motion into a saved draft campaign, lets them revise that draft by chat, and gives them one-click actions to test it against the primary campaign or promote it.

**Architecture:** Add a focused AI generation module for motion-based campaign strategy and phases, API routes for draft generation/revision/testing, and a dedicated builder UI under `/app/campaigns/ai-builder`. Campaigns are persisted immediately as `draft`, strategy metadata lives in `campaigns.goal_config.strategy`, and experiments reuse the existing `experiments` and `experiment_campaigns` tables.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, Supabase service client, Zod, Vitest, React Testing Library, existing `generateResponse` LLM wrapper.

---

## File Structure

- Create `src/lib/ai/campaign-builder.ts`
  - Owns LLM prompts, response schema, JSON parsing/repair, generation, and revision.
  - Exports typed `CampaignBuilderOutput`, `BuilderStrategy`, `GeneratedCampaignPhase`, `generateCampaignDraft`, and `reviseCampaignDraft`.

- Create `tests/unit/campaign-builder.test.ts`
  - Unit tests for prompt content, JSON validation, generation, and revision context.

- Create `src/lib/ai/campaign-builder-store.ts`
  - Owns tenant context loading and draft campaign persistence.
  - Keeps DB details out of the route files.

- Create `tests/unit/campaign-builder-store.test.ts`
  - Unit tests for campaign/phase insert payloads and draft revision safety.

- Create `src/app/api/campaigns/ai-builder/generate/route.ts`
  - Authenticates tenant, generates a draft, persists it, returns preview.

- Create `src/app/api/campaigns/ai-builder/revise/route.ts`
  - Authenticates tenant, loads draft snapshot, generates revised draft, replaces draft phases safely.

- Create `tests/unit/campaigns-ai-builder-api.test.ts`
  - Route tests for auth, validation, generation, persistence, and revision blocking.

- Create `src/app/api/campaigns/[id]/test-against-primary/route.ts`
  - Creates a running 50/50 experiment between current primary and generated draft.

- Create `tests/unit/campaign-test-against-primary-api.test.ts`
  - Route tests for primary lookup, draft activation, experiment creation, and ownership errors.

- Create `src/app/(tenant)/app/campaigns/ai-builder/page.tsx`
  - Server page wrapper using existing tenant auth pattern.

- Create `src/app/(tenant)/app/campaigns/ai-builder/AiCampaignBuilderClient.tsx`
  - Client state, API calls, routing, and orchestration.

- Create `src/components/dashboard/campaigns/AiBuilderChat.tsx`
  - Chat input, message list, and suggested prompt chips.

- Create `src/components/dashboard/campaigns/AiBuilderPreview.tsx`
  - Strategy/campaign/phase preview and action buttons.

- Create `tests/unit/ai-campaign-builder-client.test.tsx`
  - Component tests for generation, revision, and action button behavior.

- Modify `src/app/(tenant)/app/campaigns/CampaignsClient.tsx`
  - Add `Build with AI` entry point.

- Modify `src/app/(tenant)/app/campaigns/new/page.tsx`
  - Add `Build with AI` link beside the manual creation flow.

---

### Task 1: Campaign Builder Generation Core

**Files:**
- Create: `src/lib/ai/campaign-builder.ts`
- Create: `tests/unit/campaign-builder.test.ts`

- [ ] **Step 1: Write the failing generator tests**

Create `tests/unit/campaign-builder.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/llm-client", () => ({
  generateResponse: vi.fn(),
}));

import {
  buildCampaignBuilderSystemPrompt,
  generateCampaignDraft,
  reviseCampaignDraft,
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
  primaryCampaign: {
    id: "primary-1",
    name: "Primary Offer",
    description: "Default lead generation offer.",
    goal: "form_submit",
  },
};

const validOutput = {
  strategy: {
    motion: "answer_first_close_later",
    motion_label: "Answer-first close later",
    buyer_stage: "Warm but unclear intent",
    friction_level: "low",
    main_behavior: "Answer direct questions first, identify what they want to buy, then guide to the right offer.",
    cta_style: "Invite them to check if they qualify.",
    reengagement_strategy: "Follow up based on silence, concern, or buying signal.",
    tone: "Human, concise, Taglish-friendly, not pushy.",
    key_constraints: ["Do not hard sell", "Ask one main question at a time"],
  },
  campaign: {
    name: "Low-Friction Qualification",
    description: "A trust-first campaign that answers questions and invites leads to check fit.",
    goal: "form_submit",
    follow_up_message: "Hi, quick check lang po. Gusto niyo pa rin po bang makita if qualified kayo for the service?",
  },
  phases: [
    {
      name: "Understand Buying Intent",
      order_index: 0,
      max_messages: 3,
      system_prompt: "Find out what the lead wants to buy or solve before recommending anything.",
      tone: "warm and direct",
      goals: "Understand the buyer's intent and desired outcome.",
      transition_hint: "Move on once the bot knows the likely offer or next step.",
    },
    {
      name: "Answer And Match Offer",
      order_index: 1,
      max_messages: 4,
      system_prompt: "Answer direct questions immediately when knowledge supports it, then connect the answer to the relevant service.",
      tone: "clear and helpful",
      goals: "Reduce friction and show the lead the right offer.",
      transition_hint: "Move on when the lead shows fit or asks about next steps.",
    },
    {
      name: "Re-engage To Close",
      order_index: 2,
      max_messages: 3,
      system_prompt: "If the lead slows down, reconnect with their last concern and make the next step feel easy.",
      tone: "calm and reassuring",
      goals: "Bring warm leads back to a clear decision.",
      transition_hint: "Final phase; close, qualify, or gracefully stop.",
    },
  ],
};

describe("campaign-builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a system prompt with motion guidance and hidden CLOSER reasoning", () => {
    const prompt = buildCampaignBuilderSystemPrompt(tenantContext);

    expect(prompt).toContain("motion-first campaign strategist");
    expect(prompt).toContain("CLOSER is hidden reasoning");
    expect(prompt).toContain("Do not turn CLOSER into literal phase names");
    expect(prompt).toContain("Acme Growth");
    expect(prompt).toContain("Lead generation service for local businesses.");
    expect(prompt.toLowerCase()).not.toContain("act like alex");
  });

  it("generates a validated campaign draft from a tenant direction", async () => {
    mockGenerateResponse.mockResolvedValue({
      content: JSON.stringify(validOutput),
      finishReason: "stop",
    });

    const result = await generateCampaignDraft({
      context: tenantContext,
      message: "I want low friction, build trust, and ask them to check if they qualify.",
    });

    expect(result.strategy.motion).toBe("answer_first_close_later");
    expect(result.campaign.status).toBe("draft");
    expect(result.campaign.is_primary).toBe(false);
    expect(result.campaign.goal_config).toEqual({ strategy: validOutput.strategy });
    expect(result.phases).toHaveLength(3);
    expect(mockGenerateResponse).toHaveBeenCalledWith(
      expect.stringContaining("motion-first campaign strategist"),
      expect.stringContaining("I want low friction"),
      expect.objectContaining({ responseFormat: "json_object", maxTokens: 2200 })
    );
  });

  it("includes the existing draft strategy and phase snapshot during revision", async () => {
    mockGenerateResponse.mockResolvedValue({
      content: JSON.stringify({
        ...validOutput,
        strategy: {
          ...validOutput.strategy,
          tone: "Softer Taglish, more trust-building.",
        },
      }),
      finishReason: "stop",
    });

    const result = await reviseCampaignDraft({
      context: tenantContext,
      message: "Make phase 1 softer and more Taglish.",
      currentDraft: {
        campaign: {
          id: "camp-1",
          name: "Low-Friction Qualification",
          description: "Old description",
          goal: "form_submit",
          goal_config: { strategy: validOutput.strategy },
          follow_up_message: "Old follow up",
        },
        phases: validOutput.phases,
      },
    });

    expect(result.strategy.tone).toContain("Softer Taglish");
    expect(mockGenerateResponse).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("Current draft campaign"),
      expect.objectContaining({ responseFormat: "json_object" })
    );
    expect(mockGenerateResponse).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("Make phase 1 softer"),
      expect.any(Object)
    );
  });

  it("repairs invalid model JSON once before failing", async () => {
    mockGenerateResponse
      .mockResolvedValueOnce({
        content: "{ invalid json",
        finishReason: "stop",
      })
      .mockResolvedValueOnce({
        content: JSON.stringify(validOutput),
        finishReason: "stop",
      });

    const result = await generateCampaignDraft({
      context: tenantContext,
      message: "Create a campaign that answers questions first.",
    });

    expect(result.campaign.name).toBe("Low-Friction Qualification");
    expect(mockGenerateResponse).toHaveBeenCalledTimes(2);
    expect(mockGenerateResponse.mock.calls[1][0]).toContain("Repair the campaign builder JSON");
  });

  it("throws when the model returns fewer than three phases", async () => {
    mockGenerateResponse.mockResolvedValue({
      content: JSON.stringify({ ...validOutput, phases: validOutput.phases.slice(0, 2) }),
      finishReason: "stop",
    });

    await expect(
      generateCampaignDraft({
        context: tenantContext,
        message: "Create a campaign.",
      })
    ).rejects.toThrow("Invalid campaign builder output");
  });
});
```

- [ ] **Step 2: Run the generator tests to verify they fail**

Run:

```bash
npm test -- tests/unit/campaign-builder.test.ts
```

Expected result:

```text
FAIL tests/unit/campaign-builder.test.ts
Cannot find module '@/lib/ai/campaign-builder'
```

- [ ] **Step 3: Implement the campaign builder module**

Create `src/lib/ai/campaign-builder.ts`:

```ts
import { z } from "zod";
import { generateResponse } from "@/lib/ai/llm-client";

const campaignGoalSchema = z.enum([
  "form_submit",
  "appointment_booked",
  "purchase",
  "stage_reached",
]);

const builderStrategySchema = z.object({
  motion: z.string().min(1).max(80),
  motion_label: z.string().min(1).max(120),
  buyer_stage: z.string().min(1).max(160),
  friction_level: z.string().min(1).max(80),
  main_behavior: z.string().min(1).max(500),
  cta_style: z.string().min(1).max(300),
  reengagement_strategy: z.string().min(1).max(500),
  tone: z.string().min(1).max(240),
  key_constraints: z.array(z.string().min(1).max(160)).min(1).max(6),
});

const generatedPhaseSchema = z.object({
  name: z.string().min(1).max(100),
  order_index: z.number().int().min(0).max(5),
  max_messages: z.number().int().min(1).max(10),
  system_prompt: z.string().min(1).max(5000),
  tone: z.string().min(1).max(200),
  goals: z.string().min(1).max(2000),
  transition_hint: z.string().min(1).max(1000),
});

const builderResponseSchema = z.object({
  strategy: builderStrategySchema,
  campaign: z.object({
    name: z.string().min(1).max(200),
    description: z.string().min(1).max(1000),
    goal: campaignGoalSchema,
    follow_up_message: z.string().min(1).max(500),
  }),
  phases: z.array(generatedPhaseSchema).min(3).max(6),
});

export type CampaignGoal = z.infer<typeof campaignGoalSchema>;
export type BuilderStrategy = z.infer<typeof builderStrategySchema>;
export type GeneratedCampaignPhase = z.infer<typeof generatedPhaseSchema>;

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

export interface CampaignBuilderOutput {
  strategy: BuilderStrategy;
  campaign: {
    name: string;
    description: string;
    goal: CampaignGoal;
    goal_config: { strategy: BuilderStrategy };
    is_primary: false;
    status: "draft";
    follow_up_message: string;
  };
  phases: GeneratedCampaignPhase[];
}

export interface CampaignBuilderDraftSnapshot {
  campaign: {
    id: string;
    name: string;
    description: string | null;
    goal: CampaignGoal;
    goal_config: Record<string, unknown>;
    follow_up_message: string | null;
  };
  phases: GeneratedCampaignPhase[];
}

const MODEL_CONFIG = {
  responseFormat: "json_object" as const,
  temperature: 0.45,
  maxTokens: 2200,
};

export function buildCampaignBuilderSystemPrompt(
  context: CampaignBuilderTenantContext
): string {
  const primary = context.primaryCampaign
    ? `${context.primaryCampaign.name}: ${context.primaryCampaign.description ?? "No description"}`
    : "No primary campaign found.";

  return [
    "You are a motion-first campaign strategist for Messenger sales bots.",
    "",
    "Your job is to turn the tenant's plain-language direction into a draft campaign.",
    "Infer the campaign motion from what they ask for. A motion is the selling behavior, not a rigid template.",
    "",
    "CLOSER is hidden reasoning only:",
    "- Clarify why the lead is there.",
    "- Label or reflect the real problem/desire.",
    "- Overview relevant past context or pain when useful.",
    "- Sell the outcome, not only the mechanics.",
    "- Explain concerns directly.",
    "- Reinforce the next decision after the lead acts.",
    "",
    "Do not turn CLOSER into literal phase names.",
    "Do not imitate Alex Hormozi or say you are using his framework.",
    "Do not create hard-sell scripts. The phase prompts are behavioral briefings, not canned replies.",
    "Generate 3-6 phases based on the requested motion.",
    "Use concise, human Messenger behavior. Taglish is allowed when the tenant requests it.",
    "Ask at most one main question per bot reply inside phase prompts.",
    "",
    "Return ONLY valid JSON with this exact shape:",
    `{
  "strategy": {
    "motion": "internal_snake_case_motion",
    "motion_label": "Human-readable motion",
    "buyer_stage": "string",
    "friction_level": "string",
    "main_behavior": "string",
    "cta_style": "string",
    "reengagement_strategy": "string",
    "tone": "string",
    "key_constraints": ["string"]
  },
  "campaign": {
    "name": "string",
    "description": "string",
    "goal": "form_submit | appointment_booked | purchase | stage_reached",
    "follow_up_message": "string"
  },
  "phases": [
    {
      "name": "string",
      "order_index": 0,
      "max_messages": 3,
      "system_prompt": "string",
      "tone": "string",
      "goals": "string",
      "transition_hint": "string"
    }
  ]
}`,
    "",
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
    .map((message) => `${message.role === "user" ? "Tenant" : "Builder"}: ${message.text}`)
    .join("\n");
}

function normalizeOutput(parsed: z.infer<typeof builderResponseSchema>): CampaignBuilderOutput {
  const phases = [...parsed.phases]
    .sort((a, b) => a.order_index - b.order_index)
    .map((phase, index) => ({ ...phase, order_index: index }));

  return {
    strategy: parsed.strategy,
    campaign: {
      ...parsed.campaign,
      goal_config: { strategy: parsed.strategy },
      is_primary: false,
      status: "draft",
    },
    phases,
  };
}

function parseOutput(raw: string): CampaignBuilderOutput {
  try {
    const parsedJson = JSON.parse(raw);
    const parsed = builderResponseSchema.parse(parsedJson);
    return normalizeOutput(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid campaign builder output: ${message}`);
  }
}

async function parseOrRepairOutput(params: {
  raw: string;
  systemPrompt: string;
  userMessage: string;
}): Promise<CampaignBuilderOutput> {
  try {
    return parseOutput(params.raw);
  } catch (firstError) {
    const repairSystemPrompt = [
      "Repair the campaign builder JSON so it matches the required schema.",
      "Return ONLY valid JSON. Do not add explanations.",
      "Preserve the campaign strategy and phase intent when possible.",
    ].join("\n");
    const repairUserMessage = [
      "Original generation prompt:",
      params.systemPrompt,
      "",
      "Original user message:",
      params.userMessage,
      "",
      "Invalid JSON or validation error:",
      firstError instanceof Error ? firstError.message : String(firstError),
      "",
      "Invalid output:",
      params.raw,
    ].join("\n");

    const repaired = await generateResponse(repairSystemPrompt, repairUserMessage, MODEL_CONFIG);
    return parseOutput(repaired.content);
  }
}

export async function generateCampaignDraft(input: {
  context: CampaignBuilderTenantContext;
  message: string;
  history?: BuilderChatMessage[];
}): Promise<CampaignBuilderOutput> {
  const systemPrompt = buildCampaignBuilderSystemPrompt(input.context);
  const userMessage = [
    "Create a new draft campaign from this tenant direction.",
    "",
    `Tenant direction: ${input.message}`,
    "",
    "Builder chat history:",
    formatHistory(input.history),
  ].join("\n");

  const response = await generateResponse(systemPrompt, userMessage, MODEL_CONFIG);
  return parseOrRepairOutput({ raw: response.content, systemPrompt, userMessage });
}

export async function reviseCampaignDraft(input: {
  context: CampaignBuilderTenantContext;
  message: string;
  currentDraft: CampaignBuilderDraftSnapshot;
  history?: BuilderChatMessage[];
}): Promise<CampaignBuilderOutput> {
  const systemPrompt = buildCampaignBuilderSystemPrompt(input.context);
  const userMessage = [
    "Revise the existing draft campaign using the tenant's latest direction.",
    "Keep what still fits. Change the strategy, campaign metadata, and phases only where useful.",
    "",
    `Latest tenant direction: ${input.message}`,
    "",
    "Current draft campaign:",
    JSON.stringify(input.currentDraft, null, 2),
    "",
    "Builder chat history:",
    formatHistory(input.history),
  ].join("\n");

  const response = await generateResponse(systemPrompt, userMessage, MODEL_CONFIG);
  return parseOrRepairOutput({ raw: response.content, systemPrompt, userMessage });
}
```

- [ ] **Step 4: Run generator tests to verify green**

Run:

```bash
npm test -- tests/unit/campaign-builder.test.ts
```

Expected result:

```text
PASS tests/unit/campaign-builder.test.ts
```

- [ ] **Step 5: Commit generator core**

Run:

```bash
git add src/lib/ai/campaign-builder.ts tests/unit/campaign-builder.test.ts
git commit -m "feat: add ai campaign builder generator"
```

---

### Task 2: Campaign Builder Persistence Helpers

**Files:**
- Create: `src/lib/ai/campaign-builder-store.ts`
- Create: `tests/unit/campaign-builder-store.test.ts`

- [ ] **Step 1: Write failing store tests**

Create `tests/unit/campaign-builder-store.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignBuilderOutput } from "@/lib/ai/campaign-builder";
import {
  createDraftCampaign,
  loadBuilderTenantContext,
  replaceDraftCampaign,
} from "@/lib/ai/campaign-builder-store";

const strategy = {
  motion: "trust_first_qualification",
  motion_label: "Trust-first qualification",
  buyer_stage: "Warm lead",
  friction_level: "low",
  main_behavior: "Build trust before asking for the next step.",
  cta_style: "Check if you qualify.",
  reengagement_strategy: "Follow up around fit and clarity.",
  tone: "Human and concise.",
  key_constraints: ["No hard selling"],
};

const output: CampaignBuilderOutput = {
  strategy,
  campaign: {
    name: "Trust First",
    description: "Builds trust before qualification.",
    goal: "form_submit",
    goal_config: { strategy },
    is_primary: false,
    status: "draft",
    follow_up_message: "Checking in lang po, gusto niyo pa bang makita if qualified kayo?",
  },
  phases: [
    {
      name: "Low-Friction Opener",
      order_index: 0,
      max_messages: 3,
      system_prompt: "Start with low pressure and understand intent.",
      tone: "warm",
      goals: "Get a comfortable reply.",
      transition_hint: "Move on when intent is clear.",
    },
    {
      name: "Clarify Fit",
      order_index: 1,
      max_messages: 4,
      system_prompt: "Ask one fit question at a time.",
      tone: "helpful",
      goals: "Understand qualification.",
      transition_hint: "Move on when fit is clear.",
    },
    {
      name: "Qualification CTA",
      order_index: 2,
      max_messages: 3,
      system_prompt: "Invite the lead to check if they qualify.",
      tone: "clear",
      goals: "Move to form submit.",
      transition_hint: "Final step.",
    },
  ],
};

describe("campaign-builder-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads tenant context with the current primary campaign", async () => {
    const service = {
      from: vi.fn((table: string) => {
        if (table === "tenants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    name: "Acme Growth",
                    business_type: "services",
                    bot_goal: "qualify_leads",
                    business_description: "Lead gen service.",
                    main_action: "form",
                    differentiator: "No pressure.",
                    qualification_criteria: "Owners only.",
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
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "primary-1",
                    name: "Primary",
                    description: "Main offer.",
                    goal: "form_submit",
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }),
    } as any;

    const context = await loadBuilderTenantContext(service, "tenant-1");

    expect(context.tenantName).toBe("Acme Growth");
    expect(context.primaryCampaign?.name).toBe("Primary");
  });

  it("creates a draft campaign and inserts generated phases", async () => {
    const insertCampaign = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "camp-1", ...output.campaign, tenant_id: "tenant-1" },
          error: null,
        }),
      }),
    });
    const insertPhases = vi.fn().mockResolvedValue({ error: null });

    const service = {
      from: vi.fn((table: string) => {
        if (table === "campaigns") return { insert: insertCampaign };
        if (table === "campaign_phases") return { insert: insertPhases };
        throw new Error(`Unexpected table ${table}`);
      }),
    } as any;

    const result = await createDraftCampaign(service, "tenant-1", output);

    expect(result.campaign.id).toBe("camp-1");
    expect(insertCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        status: "draft",
        is_primary: false,
        goal_config: { strategy },
      })
    );
    expect(insertPhases).toHaveBeenCalledWith([
      expect.objectContaining({
        campaign_id: "camp-1",
        tenant_id: "tenant-1",
        name: "Low-Friction Opener",
        order_index: 0,
      }),
      expect.objectContaining({ order_index: 1 }),
      expect.objectContaining({ order_index: 2 }),
    ]);
  });

  it("blocks replacing a draft that already has lead assignments", async () => {
    const service = {
      from: vi.fn((table: string) => {
        if (table === "campaigns") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: "camp-1", tenant_id: "tenant-1", is_primary: false, status: "draft" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "lead_campaign_assignments") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
            }),
          };
        }
        if (table === "campaign_conversions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    } as any;

    await expect(
      replaceDraftCampaign(service, "tenant-1", "camp-1", output)
    ).rejects.toThrow("Draft campaign already has lead activity");
  });
});
```

- [ ] **Step 2: Run store tests to verify they fail**

Run:

```bash
npm test -- tests/unit/campaign-builder-store.test.ts
```

Expected result:

```text
FAIL tests/unit/campaign-builder-store.test.ts
Cannot find module '@/lib/ai/campaign-builder-store'
```

- [ ] **Step 3: Implement store helpers**

Create `src/lib/ai/campaign-builder-store.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type {
  CampaignBuilderDraftSnapshot,
  CampaignBuilderOutput,
  CampaignBuilderTenantContext,
  GeneratedCampaignPhase,
} from "@/lib/ai/campaign-builder";

type ServiceClient = SupabaseClient<Database>;

export async function loadBuilderTenantContext(
  service: ServiceClient,
  tenantId: string
): Promise<CampaignBuilderTenantContext> {
  const { data: tenant, error } = await service
    .from("tenants")
    .select(
      "name, business_type, bot_goal, business_description, main_action, differentiator, qualification_criteria"
    )
    .eq("id", tenantId)
    .single();

  if (error || !tenant) {
    throw new Error("Tenant context not found");
  }

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

function phaseRows(
  tenantId: string,
  campaignId: string,
  phases: GeneratedCampaignPhase[]
) {
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

export async function createDraftCampaign(
  service: ServiceClient,
  tenantId: string,
  output: CampaignBuilderOutput
) {
  const { data: campaign, error: campaignError } = await service
    .from("campaigns")
    .insert({
      tenant_id: tenantId,
      name: output.campaign.name,
      description: output.campaign.description,
      goal: output.campaign.goal,
      goal_config: output.campaign.goal_config,
      is_primary: false,
      status: "draft",
      follow_up_message: output.campaign.follow_up_message,
    })
    .select("*")
    .single();

  if (campaignError || !campaign) {
    throw new Error("Failed to create draft campaign");
  }

  const { error: phasesError } = await service
    .from("campaign_phases")
    .insert(phaseRows(tenantId, campaign.id, output.phases));

  if (phasesError) {
    await service.from("campaigns").delete().eq("id", campaign.id).eq("tenant_id", tenantId);
    throw new Error("Failed to create draft campaign phases");
  }

  return { campaign, phases: output.phases, strategy: output.strategy };
}

export async function loadDraftSnapshot(
  service: ServiceClient,
  tenantId: string,
  campaignId: string
): Promise<CampaignBuilderDraftSnapshot> {
  const { data: campaign, error: campaignError } = await service
    .from("campaigns")
    .select("id, name, description, goal, goal_config, follow_up_message, status, is_primary")
    .eq("id", campaignId)
    .eq("tenant_id", tenantId)
    .single();

  if (campaignError || !campaign) {
    throw new Error("Draft campaign not found");
  }
  if (campaign.is_primary || campaign.status !== "draft") {
    throw new Error("Only non-primary draft campaigns can be revised");
  }

  const { data: phases, error: phasesError } = await service
    .from("campaign_phases")
    .select("name, order_index, max_messages, system_prompt, tone, goals, transition_hint")
    .eq("campaign_id", campaignId)
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: true });

  if (phasesError) {
    throw new Error("Failed to load draft phases");
  }

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      goal: campaign.goal,
      goal_config: campaign.goal_config,
      follow_up_message: campaign.follow_up_message,
    },
    phases: (phases ?? []).map((phase) => ({
      name: phase.name,
      order_index: phase.order_index,
      max_messages: phase.max_messages,
      system_prompt: phase.system_prompt,
      tone: phase.tone ?? "friendly and helpful",
      goals: phase.goals ?? "",
      transition_hint: phase.transition_hint ?? "",
    })),
  };
}

async function countCampaignRows(
  service: ServiceClient,
  table: "lead_campaign_assignments" | "campaign_conversions",
  campaignId: string
) {
  const { count, error } = await service
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  if (error) {
    throw new Error("Failed to check campaign activity");
  }
  return count ?? 0;
}

export async function replaceDraftCampaign(
  service: ServiceClient,
  tenantId: string,
  campaignId: string,
  output: CampaignBuilderOutput
) {
  await loadDraftSnapshot(service, tenantId, campaignId);

  const [assignments, conversions] = await Promise.all([
    countCampaignRows(service, "lead_campaign_assignments", campaignId),
    countCampaignRows(service, "campaign_conversions", campaignId),
  ]);

  if (assignments > 0 || conversions > 0) {
    throw new Error("Draft campaign already has lead activity");
  }

  const { data: campaign, error: updateError } = await service
    .from("campaigns")
    .update({
      name: output.campaign.name,
      description: output.campaign.description,
      goal: output.campaign.goal,
      goal_config: output.campaign.goal_config,
      follow_up_message: output.campaign.follow_up_message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();

  if (updateError || !campaign) {
    throw new Error("Failed to update draft campaign");
  }

  const { error: deleteError } = await service
    .from("campaign_phases")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("tenant_id", tenantId);

  if (deleteError) {
    throw new Error("Failed to replace draft phases");
  }

  const { error: insertError } = await service
    .from("campaign_phases")
    .insert(phaseRows(tenantId, campaignId, output.phases));

  if (insertError) {
    throw new Error("Failed to insert revised draft phases");
  }

  return { campaign, phases: output.phases, strategy: output.strategy };
}
```

- [ ] **Step 4: Run store tests to verify green**

Run:

```bash
npm test -- tests/unit/campaign-builder-store.test.ts
```

Expected result:

```text
PASS tests/unit/campaign-builder-store.test.ts
```

- [ ] **Step 5: Commit store helpers**

Run:

```bash
git add src/lib/ai/campaign-builder-store.ts tests/unit/campaign-builder-store.test.ts
git commit -m "feat: persist ai campaign builder drafts"
```

---

### Task 3: Generate And Revise API Routes

**Files:**
- Create: `src/app/api/campaigns/ai-builder/generate/route.ts`
- Create: `src/app/api/campaigns/ai-builder/revise/route.ts`
- Create: `tests/unit/campaigns-ai-builder-api.test.ts`

- [ ] **Step 1: Write failing API route tests**

Create `tests/unit/campaigns-ai-builder-api.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSession } from "@/lib/auth/session";

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: vi.fn() })),
}));

vi.mock("@/lib/ai/campaign-builder-store", () => ({
  loadBuilderTenantContext: vi.fn(),
  createDraftCampaign: vi.fn(),
  loadDraftSnapshot: vi.fn(),
  replaceDraftCampaign: vi.fn(),
}));

vi.mock("@/lib/ai/campaign-builder", () => ({
  generateCampaignDraft: vi.fn(),
  reviseCampaignDraft: vi.fn(),
}));

import {
  createDraftCampaign,
  loadBuilderTenantContext,
  loadDraftSnapshot,
  replaceDraftCampaign,
} from "@/lib/ai/campaign-builder-store";
import {
  generateCampaignDraft,
  reviseCampaignDraft,
} from "@/lib/ai/campaign-builder";

const mockResolveSession = vi.mocked(resolveSession);
const mockLoadContext = vi.mocked(loadBuilderTenantContext);
const mockCreateDraft = vi.mocked(createDraftCampaign);
const mockLoadSnapshot = vi.mocked(loadDraftSnapshot);
const mockReplaceDraft = vi.mocked(replaceDraftCampaign);
const mockGenerateDraft = vi.mocked(generateCampaignDraft);
const mockReviseDraft = vi.mocked(reviseCampaignDraft);

const context = {
  tenantName: "Acme Growth",
  businessType: "services",
  botGoal: "qualify_leads",
  businessDescription: "Lead gen.",
  mainAction: "form",
  differentiator: null,
  qualificationCriteria: "Owners only.",
  primaryCampaign: null,
};

const output = {
  strategy: {
    motion: "answer_first_close_later",
    motion_label: "Answer-first close later",
    buyer_stage: "Warm",
    friction_level: "low",
    main_behavior: "Answer first.",
    cta_style: "Check fit.",
    reengagement_strategy: "Follow up.",
    tone: "Human.",
    key_constraints: ["One question"],
  },
  campaign: {
    name: "AI Draft",
    description: "Generated draft.",
    goal: "form_submit",
    goal_config: { strategy: {} },
    is_primary: false,
    status: "draft",
    follow_up_message: "Follow up.",
  },
  phases: [
    { name: "Intent", order_index: 0, max_messages: 3, system_prompt: "Ask.", tone: "warm", goals: "Know intent.", transition_hint: "Intent clear." },
    { name: "Answer", order_index: 1, max_messages: 3, system_prompt: "Answer.", tone: "clear", goals: "Answer.", transition_hint: "Concern clear." },
    { name: "Close", order_index: 2, max_messages: 3, system_prompt: "Close.", tone: "calm", goals: "Next step.", transition_hint: "Final." },
  ],
} as any;

describe("POST /api/campaigns/ai-builder/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when unauthenticated", async () => {
    mockResolveSession.mockResolvedValue(null);

    const { POST } = await import("@/app/api/campaigns/ai-builder/generate/route");
    const req = new Request("http://localhost/api/campaigns/ai-builder/generate", {
      method: "POST",
      body: JSON.stringify({ message: "Create a campaign" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("creates and returns a draft campaign preview", async () => {
    mockResolveSession.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1" });
    mockLoadContext.mockResolvedValue(context);
    mockGenerateDraft.mockResolvedValue(output);
    mockCreateDraft.mockResolvedValue({
      campaign: { id: "camp-1", ...output.campaign },
      phases: output.phases,
      strategy: output.strategy,
    } as any);

    const { POST } = await import("@/app/api/campaigns/ai-builder/generate/route");
    const req = new Request("http://localhost/api/campaigns/ai-builder/generate", {
      method: "POST",
      body: JSON.stringify({
        message: "Answer questions first, then re-engage to close.",
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.campaign.id).toBe("camp-1");
    expect(body.strategy.motion).toBe("answer_first_close_later");
    expect(mockGenerateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        context,
        message: "Answer questions first, then re-engage to close.",
      })
    );
  });

  it("returns 400 for an empty message", async () => {
    mockResolveSession.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1" });

    const { POST } = await import("@/app/api/campaigns/ai-builder/generate/route");
    const req = new Request("http://localhost/api/campaigns/ai-builder/generate", {
      method: "POST",
      body: JSON.stringify({ message: "" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/campaigns/ai-builder/revise", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("revises a draft campaign and returns preview", async () => {
    mockResolveSession.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1" });
    mockLoadContext.mockResolvedValue(context);
    mockLoadSnapshot.mockResolvedValue({
      campaign: {
        id: "camp-1",
        name: "AI Draft",
        description: "Generated draft.",
        goal: "form_submit",
        goal_config: { strategy: output.strategy },
        follow_up_message: "Follow up.",
      },
      phases: output.phases,
    });
    mockReviseDraft.mockResolvedValue(output);
    mockReplaceDraft.mockResolvedValue({
      campaign: { id: "camp-1", ...output.campaign },
      phases: output.phases,
      strategy: output.strategy,
    } as any);

    const { POST } = await import("@/app/api/campaigns/ai-builder/revise/route");
    const req = new Request("http://localhost/api/campaigns/ai-builder/revise", {
      method: "POST",
      body: JSON.stringify({
        campaignId: "camp-1",
        message: "Make phase 1 softer and Taglish.",
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.campaign.id).toBe("camp-1");
    expect(mockReviseDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Make phase 1 softer and Taglish.",
      })
    );
  });
});
```

- [ ] **Step 2: Run API route tests to verify they fail**

Run:

```bash
npm test -- tests/unit/campaigns-ai-builder-api.test.ts
```

Expected result:

```text
FAIL tests/unit/campaigns-ai-builder-api.test.ts
Cannot find module '@/app/api/campaigns/ai-builder/generate/route'
```

- [ ] **Step 3: Implement generate route**

Create `src/app/api/campaigns/ai-builder/generate/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import { generateCampaignDraft } from "@/lib/ai/campaign-builder";
import {
  createDraftCampaign,
  loadBuilderTenantContext,
} from "@/lib/ai/campaign-builder-store";

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(2000),
});

const generateSchema = z.object({
  message: z.string().trim().min(5).max(2000),
  history: z.array(chatMessageSchema).max(20).optional(),
});

export async function POST(request: Request) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const service = createServiceClient();
    const context = await loadBuilderTenantContext(service, session.tenantId);
    const generated = await generateCampaignDraft({
      context,
      message: parsed.data.message,
      history: parsed.data.history,
    });
    const draft = await createDraftCampaign(service, session.tenantId, generated);

    return NextResponse.json(
      {
        campaign: draft.campaign,
        phases: draft.phases,
        strategy: draft.strategy,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate campaign";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Implement revise route**

Create `src/app/api/campaigns/ai-builder/revise/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import { reviseCampaignDraft } from "@/lib/ai/campaign-builder";
import {
  loadBuilderTenantContext,
  loadDraftSnapshot,
  replaceDraftCampaign,
} from "@/lib/ai/campaign-builder-store";

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(2000),
});

const reviseSchema = z.object({
  campaignId: z.string().uuid().or(z.string().min(1)),
  message: z.string().trim().min(3).max(2000),
  history: z.array(chatMessageSchema).max(20).optional(),
});

export async function POST(request: Request) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = reviseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const service = createServiceClient();
    const [context, currentDraft] = await Promise.all([
      loadBuilderTenantContext(service, session.tenantId),
      loadDraftSnapshot(service, session.tenantId, parsed.data.campaignId),
    ]);

    const generated = await reviseCampaignDraft({
      context,
      message: parsed.data.message,
      currentDraft,
      history: parsed.data.history,
    });
    const draft = await replaceDraftCampaign(
      service,
      session.tenantId,
      parsed.data.campaignId,
      generated
    );

    return NextResponse.json({
      campaign: draft.campaign,
      phases: draft.phases,
      strategy: draft.strategy,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to revise campaign";
    const status = message.includes("lead activity") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
```

- [ ] **Step 5: Run API route tests to verify green**

Run:

```bash
npm test -- tests/unit/campaigns-ai-builder-api.test.ts
```

Expected result:

```text
PASS tests/unit/campaigns-ai-builder-api.test.ts
```

- [ ] **Step 6: Commit generate/revise APIs**

Run:

```bash
git add src/app/api/campaigns/ai-builder/generate/route.ts src/app/api/campaigns/ai-builder/revise/route.ts tests/unit/campaigns-ai-builder-api.test.ts
git commit -m "feat: add ai campaign builder api"
```

---

### Task 4: One-Click Test Against Primary API

**Files:**
- Create: `src/app/api/campaigns/[id]/test-against-primary/route.ts`
- Create: `tests/unit/campaign-test-against-primary-api.test.ts`

- [ ] **Step 1: Write failing test-against-primary tests**

Create `tests/unit/campaign-test-against-primary-api.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSession } from "@/lib/auth/session";

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

const mockResolveSession = vi.mocked(resolveSession);
const params = Promise.resolve({ id: "draft-1" });

describe("POST /api/campaigns/[id]/test-against-primary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when unauthenticated", async () => {
    mockResolveSession.mockResolvedValue(null);

    const { POST } = await import("@/app/api/campaigns/[id]/test-against-primary/route");
    const req = new Request("http://localhost/api/campaigns/draft-1/test-against-primary", {
      method: "POST",
    });

    const res = await POST(req, { params });
    expect(res.status).toBe(401);
  });

  it("activates the draft and creates a running 50/50 experiment", async () => {
    mockResolveSession.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1" });

    const experiment = { id: "exp-1", name: "Primary vs AI Draft", status: "running" };
    const updateDraft = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    const insertExperiment = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: experiment, error: null }),
      }),
    });
    const insertVariants = vi.fn().mockResolvedValue({ error: null });
    let campaignLookupCount = 0;

    mockFrom.mockImplementation((table: string) => {
      if (table === "campaigns") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockImplementation(async () => {
                  campaignLookupCount += 1;
                  if (campaignLookupCount === 1) {
                    return {
                      data: { id: "draft-1", name: "AI Draft", is_primary: false, status: "draft" },
                      error: null,
                    };
                  }
                  return {
                    data: { id: "primary-1", name: "Primary", is_primary: true, status: "active" },
                    error: null,
                  };
                }),
              }),
            }),
          }),
          update: updateDraft,
        };
      }
      if (table === "experiments") {
        return { insert: insertExperiment };
      }
      if (table === "experiment_campaigns") {
        return { insert: insertVariants };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const { POST } = await import("@/app/api/campaigns/[id]/test-against-primary/route");
    const req = new Request("http://localhost/api/campaigns/draft-1/test-against-primary", {
      method: "POST",
    });

    const res = await POST(req, { params });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.experiment.id).toBe("exp-1");
    expect(updateDraft).toHaveBeenCalledWith({ status: "active", updated_at: expect.any(String) });
    expect(insertVariants).toHaveBeenCalledWith([
      { experiment_id: "exp-1", campaign_id: "primary-1", weight: 50 },
      { experiment_id: "exp-1", campaign_id: "draft-1", weight: 50 },
    ]);
  });

  it("returns 400 when no primary campaign exists", async () => {
    mockResolveSession.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1" });
    let campaignLookupCount = 0;

    mockFrom.mockImplementation((table: string) => {
      if (table === "campaigns") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockImplementation(async () => {
                  campaignLookupCount += 1;
                  if (campaignLookupCount === 1) {
                    return {
                      data: { id: "draft-1", name: "AI Draft", is_primary: false, status: "draft" },
                      error: null,
                    };
                  }
                  return { data: null, error: { message: "No rows" } };
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const { POST } = await import("@/app/api/campaigns/[id]/test-against-primary/route");
    const req = new Request("http://localhost/api/campaigns/draft-1/test-against-primary", {
      method: "POST",
    });

    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/unit/campaign-test-against-primary-api.test.ts
```

Expected result:

```text
FAIL tests/unit/campaign-test-against-primary-api.test.ts
Cannot find module '@/app/api/campaigns/[id]/test-against-primary/route'
```

- [ ] **Step 3: Implement test-against-primary route**

Create `src/app/api/campaigns/[id]/test-against-primary/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: draftCampaignId } = await context.params;
  const service = createServiceClient();

  const { data: draft, error: draftError } = await service
    .from("campaigns")
    .select("id, name, is_primary, status")
    .eq("id", draftCampaignId)
    .eq("tenant_id", session.tenantId)
    .single();

  if (draftError || !draft) {
    return NextResponse.json({ error: "Draft campaign not found" }, { status: 404 });
  }

  if (draft.is_primary) {
    return NextResponse.json({ error: "Primary campaign is already the control" }, { status: 400 });
  }

  const { data: primary, error: primaryError } = await service
    .from("campaigns")
    .select("id, name, is_primary, status")
    .eq("tenant_id", session.tenantId)
    .eq("is_primary", true)
    .single();

  if (primaryError || !primary) {
    return NextResponse.json({ error: "No primary campaign configured" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { error: activateError } = await service
    .from("campaigns")
    .update({ status: "active", updated_at: now })
    .eq("id", draftCampaignId)
    .eq("tenant_id", session.tenantId);

  if (activateError) {
    return NextResponse.json({ error: "Failed to activate draft campaign" }, { status: 500 });
  }

  const { data: experiment, error: experimentError } = await service
    .from("experiments")
    .insert({
      tenant_id: session.tenantId,
      name: `${primary.name} vs ${draft.name}`,
      status: "running",
      min_sample_size: 50,
      started_at: now,
    })
    .select("*")
    .single();

  if (experimentError || !experiment) {
    return NextResponse.json({ error: "Failed to create experiment" }, { status: 500 });
  }

  const { error: variantsError } = await service.from("experiment_campaigns").insert([
    { experiment_id: experiment.id, campaign_id: primary.id, weight: 50 },
    { experiment_id: experiment.id, campaign_id: draft.id, weight: 50 },
  ]);

  if (variantsError) {
    await service.from("experiments").delete().eq("id", experiment.id).eq("tenant_id", session.tenantId);
    return NextResponse.json({ error: "Failed to create experiment variants" }, { status: 500 });
  }

  return NextResponse.json({ experiment }, { status: 201 });
}
```

- [ ] **Step 4: Run tests to verify green**

Run:

```bash
npm test -- tests/unit/campaign-test-against-primary-api.test.ts
```

Expected result:

```text
PASS tests/unit/campaign-test-against-primary-api.test.ts
```

- [ ] **Step 5: Commit test-against-primary API**

Run:

```bash
git add 'src/app/api/campaigns/[id]/test-against-primary/route.ts' tests/unit/campaign-test-against-primary-api.test.ts
git commit -m "feat: test ai campaign against primary"
```

---

### Task 5: AI Campaign Builder UI

**Files:**
- Create: `src/app/(tenant)/app/campaigns/ai-builder/page.tsx`
- Create: `src/app/(tenant)/app/campaigns/ai-builder/AiCampaignBuilderClient.tsx`
- Create: `src/components/dashboard/campaigns/AiBuilderChat.tsx`
- Create: `src/components/dashboard/campaigns/AiBuilderPreview.tsx`
- Create: `tests/unit/ai-campaign-builder-client.test.tsx`

- [ ] **Step 1: Write failing builder UI tests**

Create `tests/unit/ai-campaign-builder-client.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AiCampaignBuilderClient from "@/app/(tenant)/app/campaigns/ai-builder/AiCampaignBuilderClient";

const push = vi.fn();
const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const preview = {
  strategy: {
    motion: "answer_first_close_later",
    motion_label: "Answer-first close later",
    buyer_stage: "Warm but unclear intent",
    friction_level: "low",
    main_behavior: "Answer direct questions first.",
    cta_style: "Check fit.",
    reengagement_strategy: "Follow up based on concern.",
    tone: "Human and concise.",
    key_constraints: ["One question at a time"],
  },
  campaign: {
    id: "camp-1",
    name: "AI Draft",
    description: "Generated campaign.",
    goal: "form_submit",
    follow_up_message: "Checking in lang po.",
  },
  phases: [
    { name: "Intent", tone: "warm", goals: "Understand intent.", order_index: 0, max_messages: 3, system_prompt: "Ask.", transition_hint: "Intent clear." },
    { name: "Answer", tone: "clear", goals: "Answer directly.", order_index: 1, max_messages: 3, system_prompt: "Answer.", transition_hint: "Next step clear." },
    { name: "Close", tone: "calm", goals: "Close or re-engage.", order_index: 2, max_messages: 3, system_prompt: "Close.", transition_hint: "Final." },
  ],
};

describe("AiCampaignBuilderClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("generates a draft campaign from chat input and renders the preview", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(preview),
    });

    render(<AiCampaignBuilderClient />);

    await userEvent.type(
      screen.getByPlaceholderText(/Describe the campaign/i),
      "Answer questions first, then re-engage to close."
    );
    await userEvent.click(screen.getByRole("button", { name: /Generate Draft/i }));

    await waitFor(() => {
      expect(screen.getByText("AI Draft")).toBeInTheDocument();
      expect(screen.getByText("Answer-first close later")).toBeInTheDocument();
      expect(screen.getByText("Intent")).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/campaigns/ai-builder/generate",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("revises an existing draft after the first generation", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(preview) })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ...preview,
            strategy: { ...preview.strategy, tone: "Softer Taglish." },
          }),
      });

    render(<AiCampaignBuilderClient />);

    await userEvent.type(screen.getByPlaceholderText(/Describe the campaign/i), "Create draft");
    await userEvent.click(screen.getByRole("button", { name: /Generate Draft/i }));
    await screen.findByText("AI Draft");

    await userEvent.clear(screen.getByPlaceholderText(/Ask for a revision/i));
    await userEvent.type(screen.getByPlaceholderText(/Ask for a revision/i), "Make it softer.");
    await userEvent.click(screen.getByRole("button", { name: /Revise Draft/i }));

    await waitFor(() => {
      expect(screen.getByText("Softer Taglish.")).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenLastCalledWith(
      "/api/campaigns/ai-builder/revise",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("routes to the experiment after testing against primary", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(preview) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ experiment: { id: "exp-1" } }),
      });

    render(<AiCampaignBuilderClient />);

    await userEvent.type(screen.getByPlaceholderText(/Describe the campaign/i), "Create draft");
    await userEvent.click(screen.getByRole("button", { name: /Generate Draft/i }));
    await screen.findByText("AI Draft");

    await userEvent.click(screen.getByRole("button", { name: /Test Against Primary/i }));

    expect(push).toHaveBeenCalledWith("/app/campaigns/experiments/exp-1");
  });
});
```

- [ ] **Step 2: Run builder UI tests to verify they fail**

Run:

```bash
npm test -- tests/unit/ai-campaign-builder-client.test.tsx
```

Expected result:

```text
FAIL tests/unit/ai-campaign-builder-client.test.tsx
Cannot find module '@/app/(tenant)/app/campaigns/ai-builder/AiCampaignBuilderClient'
```

- [ ] **Step 3: Create AI builder page**

Create `src/app/(tenant)/app/campaigns/ai-builder/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/queries/tenant";
import AiCampaignBuilderClient from "./AiCampaignBuilderClient";

export default async function AiCampaignBuilderPage() {
  try {
    await requireTenantContext();
  } catch {
    redirect("/login");
  }

  return <AiCampaignBuilderClient />;
}
```

- [ ] **Step 4: Create chat component**

Create `src/components/dashboard/campaigns/AiBuilderChat.tsx`:

```tsx
"use client";

import { Sparkles, Send } from "lucide-react";
import Button from "@/components/ui/Button";

export interface BuilderMessage {
  role: "user" | "assistant";
  text: string;
}

interface AiBuilderChatProps {
  messages: BuilderMessage[];
  value: string;
  hasDraft: boolean;
  loading: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

const EXAMPLE_PROMPTS = [
  "Low-friction qualification",
  "Answer questions first",
  "Re-engage silent leads",
  "Product matching",
  "Soft booking campaign",
];

export default function AiBuilderChat({
  messages,
  value,
  hasDraft,
  loading,
  error,
  onChange,
  onSubmit,
}: AiBuilderChatProps) {
  const placeholder = hasDraft
    ? "Ask for a revision..."
    : "Describe the campaign you want to test...";

  return (
    <section className="flex min-h-[620px] flex-col border-r border-[var(--ws-border)] bg-white">
      <div className="border-b border-[var(--ws-border)] p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--ws-accent)]" />
          <h2 className="text-sm font-semibold text-[var(--ws-text-primary)]">
            AI Campaign Builder
          </h2>
        </div>
        <p className="mt-1 text-xs text-[var(--ws-text-muted)]">
          Describe the selling motion. The builder creates a draft you can edit, test, or promote.
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--ws-text-muted)]">
              Try a direction like "answer questions first, understand what they want to buy, then re-engage to close."
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onChange(prompt)}
                  className="rounded-full border border-[var(--ws-border)] px-3 py-1.5 text-xs text-[var(--ws-text-secondary)] hover:border-[var(--ws-accent)]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-lg px-3 py-2 text-sm ${
              message.role === "user"
                ? "ml-8 bg-[var(--ws-accent)] text-white"
                : "mr-8 bg-[var(--ws-page)] text-[var(--ws-text-primary)]"
            }`}
          >
            {message.text}
          </div>
        ))}
      </div>

      {error && (
        <div className="mx-4 mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="border-t border-[var(--ws-border)] p-4">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full resize-none rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]"
        />
        <div className="mt-3 flex justify-end">
          <Button variant="primary" onClick={onSubmit} disabled={loading || !value.trim()}>
            <Send className="h-4 w-4" />
            {loading ? "Working..." : hasDraft ? "Revise Draft" : "Generate Draft"}
          </Button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Create preview component**

Create `src/components/dashboard/campaigns/AiBuilderPreview.tsx`:

```tsx
"use client";

import { ArrowRight, CheckCircle2, FlaskConical, Pencil, Rocket } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

interface Strategy {
  motion_label: string;
  buyer_stage: string;
  friction_level: string;
  main_behavior: string;
  cta_style: string;
  reengagement_strategy: string;
  tone: string;
  key_constraints: string[];
}

interface CampaignPreview {
  campaign: {
    id: string;
    name: string;
    description: string | null;
    goal: string;
    follow_up_message: string | null;
  };
  strategy: Strategy;
  phases: {
    name: string;
    tone: string;
    goals: string;
    order_index: number;
  }[];
}

interface AiBuilderPreviewProps {
  preview: CampaignPreview | null;
  actionLoading: string | null;
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
  preview,
  actionLoading,
  onTestAgainstPrimary,
  onMakePrimary,
}: AiBuilderPreviewProps) {
  if (!preview) {
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
            The AI will generate the strategy, campaign settings, and phases before anything becomes primary.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex-1 overflow-y-auto bg-[var(--ws-page)] p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="default">DRAFT</Badge>
            <Badge variant="success">{GOAL_LABELS[preview.campaign.goal] ?? preview.campaign.goal}</Badge>
          </div>
          <h1 className="text-xl font-semibold text-[var(--ws-text-primary)]">
            {preview.campaign.name}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--ws-text-muted)]">
            {preview.campaign.description}
          </p>
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-[var(--ws-border)] bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--ws-text-primary)]">
          Strategy Brief
        </h2>
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <span className="text-xs text-[var(--ws-text-muted)]">Motion</span>
            <p className="font-medium text-[var(--ws-text-primary)]">{preview.strategy.motion_label}</p>
          </div>
          <div>
            <span className="text-xs text-[var(--ws-text-muted)]">Buyer stage</span>
            <p className="font-medium text-[var(--ws-text-primary)]">{preview.strategy.buyer_stage}</p>
          </div>
          <div>
            <span className="text-xs text-[var(--ws-text-muted)]">Friction</span>
            <p className="font-medium text-[var(--ws-text-primary)]">{preview.strategy.friction_level}</p>
          </div>
          <div>
            <span className="text-xs text-[var(--ws-text-muted)]">Tone</span>
            <p className="font-medium text-[var(--ws-text-primary)]">{preview.strategy.tone}</p>
          </div>
        </div>
        <div className="mt-4 space-y-3 text-sm text-[var(--ws-text-secondary)]">
          <p>{preview.strategy.main_behavior}</p>
          <p>{preview.strategy.cta_style}</p>
          <p>{preview.strategy.reengagement_strategy}</p>
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-[var(--ws-border)] bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--ws-text-primary)]">
          Generated Phases
        </h2>
        <div className="space-y-3">
          {preview.phases.map((phase, index) => (
            <div key={`${phase.name}-${index}`} className="rounded-lg border border-[var(--ws-border)] p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ws-accent-subtle)] text-xs font-semibold text-[var(--ws-accent)]">
                  {index + 1}
                </span>
                <h3 className="text-sm font-semibold text-[var(--ws-text-primary)]">{phase.name}</h3>
              </div>
              <p className="mt-2 text-sm text-[var(--ws-text-secondary)]">{phase.goals}</p>
              <p className="mt-1 text-xs text-[var(--ws-text-muted)]">Tone: {phase.tone}</p>
            </div>
          ))}
        </div>
      </div>

      {preview.campaign.follow_up_message && (
        <div className="mb-5 rounded-lg border border-[var(--ws-border)] bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-[var(--ws-text-primary)]">
            Follow-up Message
          </h2>
          <p className="text-sm text-[var(--ws-text-secondary)]">{preview.campaign.follow_up_message}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href={`/app/campaigns/${preview.campaign.id}`}>
          <Button variant="secondary">
            <Pencil className="h-4 w-4" />
            Edit Draft
          </Button>
        </Link>
        <Button
          variant="secondary"
          onClick={onTestAgainstPrimary}
          disabled={actionLoading !== null}
        >
          <FlaskConical className="h-4 w-4" />
          {actionLoading === "test" ? "Creating Test..." : "Test Against Primary"}
        </Button>
        <Button
          variant="primary"
          onClick={onMakePrimary}
          disabled={actionLoading !== null}
        >
          <CheckCircle2 className="h-4 w-4" />
          {actionLoading === "primary" ? "Promoting..." : "Make Primary"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Create client orchestration component**

Create `src/app/(tenant)/app/campaigns/ai-builder/AiCampaignBuilderClient.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import AiBuilderChat, {
  type BuilderMessage,
} from "@/components/dashboard/campaigns/AiBuilderChat";
import AiBuilderPreview from "@/components/dashboard/campaigns/AiBuilderPreview";

interface BuilderPreview {
  campaign: {
    id: string;
    name: string;
    description: string | null;
    goal: string;
    follow_up_message: string | null;
  };
  strategy: {
    motion: string;
    motion_label: string;
    buyer_stage: string;
    friction_level: string;
    main_behavior: string;
    cta_style: string;
    reengagement_strategy: string;
    tone: string;
    key_constraints: string[];
  };
  phases: {
    name: string;
    tone: string;
    goals: string;
    order_index: number;
  }[];
}

export default function AiCampaignBuilderClient() {
  const router = useRouter();
  const [messages, setMessages] = useState<BuilderMessage[]>([]);
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<BuilderPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    const nextMessages: BuilderMessage[] = [...messages, { role: "user", text: userMessage }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const endpoint = preview
        ? "/api/campaigns/ai-builder/revise"
        : "/api/campaigns/ai-builder/generate";
      const body = preview
        ? { campaignId: preview.campaign.id, message: userMessage, history: messages }
        : { message: userMessage, history: messages };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to build campaign");
      }

      setPreview(data);
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          text: preview
            ? "Updated the draft. Review the revised strategy and phases."
            : "Draft generated. Review the strategy, phases, and next actions.",
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to build campaign";
      setError(message);
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  };

  const testAgainstPrimary = async () => {
    if (!preview) return;
    const confirmed = window.confirm(
      "Start a 50/50 test between your current primary campaign and this draft for new leads?"
    );
    if (!confirmed) return;

    setActionLoading("test");
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${preview.campaign.id}/test-against-primary`, {
        method: "POST",
      });
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
    if (!preview) return;
    setActionLoading("primary");
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${preview.campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_primary: true, status: "active" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to promote campaign");
      router.push(`/app/campaigns/${preview.campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to promote campaign");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--ws-page)]">
      <div className="border-b border-[var(--ws-border)] bg-white px-6 py-4 pt-14 md:pt-4">
        <div className="flex items-center gap-3">
          <Link href="/app/campaigns" className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-[var(--ws-text-primary)]">
              Build Campaign With AI
            </h1>
            <p className="text-sm text-[var(--ws-text-muted)]">
              Describe the motion. Generate a draft. Test or promote only when ready.
            </p>
          </div>
        </div>
      </div>

      <div className="grid min-h-[calc(100vh-96px)] grid-cols-1 md:grid-cols-[420px_1fr]">
        <AiBuilderChat
          messages={messages}
          value={input}
          hasDraft={preview !== null}
          loading={loading}
          error={error}
          onChange={setInput}
          onSubmit={submit}
        />
        <AiBuilderPreview
          preview={preview}
          actionLoading={actionLoading}
          onTestAgainstPrimary={testAgainstPrimary}
          onMakePrimary={makePrimary}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run builder UI tests to verify green**

Run:

```bash
npm test -- tests/unit/ai-campaign-builder-client.test.tsx
```

Expected result:

```text
PASS tests/unit/ai-campaign-builder-client.test.tsx
```

- [ ] **Step 8: Commit builder UI**

Run:

```bash
git add 'src/app/(tenant)/app/campaigns/ai-builder/page.tsx' 'src/app/(tenant)/app/campaigns/ai-builder/AiCampaignBuilderClient.tsx' src/components/dashboard/campaigns/AiBuilderChat.tsx src/components/dashboard/campaigns/AiBuilderPreview.tsx tests/unit/ai-campaign-builder-client.test.tsx
git commit -m "feat: add ai campaign builder ui"
```

---

### Task 6: Entry Points And Final Verification

**Files:**
- Modify: `src/app/(tenant)/app/campaigns/CampaignsClient.tsx`
- Modify: `src/app/(tenant)/app/campaigns/new/page.tsx`
- Test: existing targeted tests plus lint/typecheck

- [ ] **Step 1: Add the campaign list entry point**

Modify the import and button group in `src/app/(tenant)/app/campaigns/CampaignsClient.tsx`.

Change:

```tsx
import { Plus, FlaskConical } from "lucide-react";
```

to:

```tsx
import { Plus, FlaskConical, Sparkles } from "lucide-react";
```

Inside the header action group, add this link before `New Campaign`:

```tsx
<Link href="/app/campaigns/ai-builder">
  <Button variant="secondary">
    <Sparkles className="h-4 w-4" />
    Build with AI
  </Button>
</Link>
```

- [ ] **Step 2: Add the new campaign page entry point**

Modify the import in `src/app/(tenant)/app/campaigns/new/page.tsx`.

Change:

```tsx
import { ArrowLeft } from "lucide-react";
```

to:

```tsx
import { ArrowLeft, Sparkles } from "lucide-react";
```

After the page title block and before the manual form, add:

```tsx
<div className="mb-6 rounded-lg border border-[var(--ws-border)] bg-[var(--ws-accent-subtle)] p-4">
  <div className="flex items-start justify-between gap-4">
    <div>
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[var(--ws-accent)]" />
        <h2 className="text-sm font-semibold text-[var(--ws-text-primary)]">
          Build from a sales motion
        </h2>
      </div>
      <p className="mt-1 text-sm text-[var(--ws-text-muted)]">
        Describe how the bot should sell and let AI create a draft campaign with phases.
      </p>
    </div>
    <Link href="/app/campaigns/ai-builder">
      <Button variant="primary">Build with AI</Button>
    </Link>
  </div>
</div>
```

- [ ] **Step 3: Run all targeted tests**

Run:

```bash
npm test -- tests/unit/campaign-builder.test.ts tests/unit/campaign-builder-store.test.ts tests/unit/campaigns-ai-builder-api.test.ts tests/unit/campaign-test-against-primary-api.test.ts tests/unit/ai-campaign-builder-client.test.tsx tests/unit/campaigns-api.test.ts tests/unit/campaigns-detail-api.test.ts tests/unit/experiments-api.test.ts
```

Expected result:

```text
PASS tests/unit/campaign-builder.test.ts
PASS tests/unit/campaign-builder-store.test.ts
PASS tests/unit/campaigns-ai-builder-api.test.ts
PASS tests/unit/campaign-test-against-primary-api.test.ts
PASS tests/unit/ai-campaign-builder-client.test.tsx
PASS tests/unit/campaigns-api.test.ts
PASS tests/unit/campaigns-detail-api.test.ts
PASS tests/unit/experiments-api.test.ts
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected result:

```text
> whatstage@0.1.0 typecheck
> tsc --noEmit
```

No TypeScript errors.

- [ ] **Step 5: Run lint**

Run:

```bash
npm run lint
```

Expected result:

```text
> whatstage@0.1.0 lint
> eslint
```

No ESLint errors.

- [ ] **Step 6: Start the dev server for manual verification**

Run:

```bash
npm run dev
```

Expected result:

```text
Local: http://localhost:3000
```

If port 3000 is already occupied, Next.js will offer another port. Use that local URL for the manual checks.

- [ ] **Step 7: Manual browser verification**

Open the app and verify:

```text
/app/campaigns
```

Checks:

- `Build with AI` appears beside `Experiments` and `New Campaign`.
- Clicking it opens `/app/campaigns/ai-builder`.
- Enter: `I want a straightforward campaign that answers questions immediately, understands what they want to buy, then re-engages them to close.`
- A draft campaign preview appears with a strategy brief and 3-6 motion-based phases.
- The phase names are not literal CLOSER labels.
- `Edit Draft` opens `/app/campaigns/<id>`.
- `Test Against Primary` asks for confirmation and routes to `/app/campaigns/experiments/<id>`.
- `Make Primary` promotes the draft and routes to `/app/campaigns/<id>`.

- [ ] **Step 8: Commit entry points and verification fixes**

Run:

```bash
git add 'src/app/(tenant)/app/campaigns/CampaignsClient.tsx' 'src/app/(tenant)/app/campaigns/new/page.tsx'
git commit -m "feat: wire ai campaign builder entry points"
```

---

## Final Completion Checklist

- [ ] All new tests pass.
- [ ] Existing targeted campaign and experiment tests pass.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] Manual builder flow works.
- [ ] The draft generator never mutates the primary campaign.
- [ ] Strategy is persisted in `campaigns.goal_config.strategy`.
- [ ] One-click testing creates a running 50/50 experiment after confirmation.
- [ ] No unrelated dirty worktree changes were reverted or reformatted.
