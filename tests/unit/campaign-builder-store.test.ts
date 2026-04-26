import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignPlan, GeneratedCampaignPhase, PhaseEditResponse } from "@/lib/ai/campaign-builder";
import {
  loadBuilderTenantContext,
  loadCampaignPlanForRevision,
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

function campaignSelect(data: Record<string, unknown>) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data, error: null }),
        }),
      }),
    }),
  };
}

function zeroActivityCount() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
    }),
  };
}

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
      from: vi.fn((table: string) => {
        if (table === "campaigns") {
          return {
            ...campaignSelect({ id: "camp-1", status: "draft", is_primary: false }),
            update: updateCampaign,
          };
        }
        return zeroActivityCount();
      }),
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

  it("loads an existing plan and rules for plan revision", async () => {
    const service = {
      from: vi.fn((table: string) => {
        if (table === "campaigns") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: "camp-1",
                      status: "draft",
                      is_primary: false,
                      campaign_plan: plan,
                      campaign_rules: ["Rule 1"],
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
          }),
        };
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await loadCampaignPlanForRevision(service, "t-1", "camp-1");

    expect(result.plan).toEqual(plan);
    expect(result.rules).toEqual(["Rule 1"]);
  });

  it("loads campaign plan and rules for phase generation", async () => {
    const service = {
      from: vi.fn((table: string) => {
        if (table === "campaigns") {
          return campaignSelect({
            id: "camp-1",
            campaign_plan: plan,
            campaign_rules: ["Rule"],
            status: "draft",
            is_primary: false,
          });
        }
        return zeroActivityCount();
      }),
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
        if (table === "campaigns") {
          return campaignSelect({ id: "camp-1", status: "draft", is_primary: false });
        }
        if (table === "lead_campaign_assignments" || table === "campaign_conversions") {
          return zeroActivityCount();
        }
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
        if (table === "campaigns") {
          return {
            ...campaignSelect({ id: "camp-1", status: "draft", is_primary: false }),
            update: updateRules,
          };
        }
        if (table === "lead_campaign_assignments" || table === "campaign_conversions") {
          return zeroActivityCount();
        }
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
