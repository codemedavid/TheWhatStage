import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSession } from "@/lib/auth/session";

vi.mock("@/lib/auth/session", () => ({ resolveSession: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: vi.fn() })),
}));
vi.mock("@/lib/ai/campaign-builder-store", () => ({
  loadBuilderTenantContext: vi.fn(),
  loadCampaignPlanForRevision: vi.fn(),
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
  loadCampaignPlanForRevision,
  saveCampaignPlan,
  loadCampaignForPhaseGen,
  saveGeneratedPhases,
  loadCampaignForPhaseEdit,
  applyPhaseEdit,
} from "@/lib/ai/campaign-builder-store";
import { generatePlan, generatePhasesFromPlan, editPhases } from "@/lib/ai/campaign-builder";

const mockSession = vi.mocked(resolveSession);
const mockLoadContext = vi.mocked(loadBuilderTenantContext);
const mockLoadPlanRevision = vi.mocked(loadCampaignPlanForRevision);
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

  it("passes an existing plan when revising a draft campaign", async () => {
    mockSession.mockResolvedValue({ userId: "u-1", tenantId: "t-1" });
    mockLoadContext.mockResolvedValue(context);
    mockLoadPlanRevision.mockResolvedValue({ plan, rules: ["Rule 1"] });
    mockGeneratePlan.mockResolvedValue({
      action: "plan", campaign_name: "Trust First v2", campaign_description: "Desc.",
      campaign_goal: "form_submit", plan, campaign_rules: ["Rule 1", "Rule 2"],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockSavePlan.mockResolvedValue({ id: "camp-1", name: "Trust First v2", status: "draft" } as any);

    const { POST } = await import("@/app/api/campaigns/ai-builder/plan/route");
    const res = await POST(new Request("http://localhost/api/campaigns/ai-builder/plan", {
      method: "POST", body: JSON.stringify({ campaignId: "camp-1", message: "Make it softer." }),
    }));

    expect(res.status).toBe(201);
    expect(mockGeneratePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        existingPlan: plan,
        existingRules: ["Rule 1"],
      })
    );
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
