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
    if (result.action !== "update") throw new Error("Expected update");
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
    if (result.action !== "add") throw new Error("Expected add");
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
