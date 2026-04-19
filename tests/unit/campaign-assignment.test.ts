import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

function mockTable(selectResult: unknown, insertResult?: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(selectResult);
  if (insertResult !== undefined) {
    chain.insert = vi.fn().mockResolvedValue(insertResult);
  }
  return chain;
}

describe("getOrAssignCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns existing assignment when lead is already assigned", async () => {
    const assignmentChain = mockTable({ data: { campaign_id: "camp-1" }, error: null });
    mockFrom.mockReturnValue(assignmentChain);

    const { getOrAssignCampaign } = await import("@/lib/ai/campaign-assignment");
    const result = await getOrAssignCampaign("lead-1", "tenant-1");

    expect(result).toBe("camp-1");
    expect(mockFrom).toHaveBeenCalledWith("lead_campaign_assignments");
  });

  it("assigns to primary campaign when no experiment is running", async () => {
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "lead_campaign_assignments" && callCount === 0) {
        callCount++;
        return mockTable({ data: null, error: { code: "PGRST116" } });
      }
      if (table === "experiments") {
        return mockTable({ data: null, error: { code: "PGRST116" } });
      }
      if (table === "campaigns") {
        return mockTable({ data: { id: "primary-camp" }, error: null });
      }
      if (table === "lead_campaign_assignments") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return mockTable({ data: null, error: null });
    });

    const { getOrAssignCampaign } = await import("@/lib/ai/campaign-assignment");
    const result = await getOrAssignCampaign("lead-1", "tenant-1");

    expect(result).toBe("primary-camp");
  });

  it("assigns via weighted random when experiment is running", async () => {
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "lead_campaign_assignments" && callCount === 0) {
        callCount++;
        return mockTable({ data: null, error: { code: "PGRST116" } });
      }
      if (table === "experiments") {
        return mockTable({
          data: {
            id: "exp-1",
            experiment_campaigns: [
              { campaign_id: "camp-a", weight: 100 },
              { campaign_id: "camp-b", weight: 0 },
            ],
          },
          error: null,
        });
      }
      if (table === "lead_campaign_assignments") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return mockTable({ data: null, error: null });
    });

    const { getOrAssignCampaign } = await import("@/lib/ai/campaign-assignment");
    const result = await getOrAssignCampaign("lead-1", "tenant-1");

    expect(result).toBe("camp-a");
  });
});

describe("weightedRandomCampaign", () => {
  it("returns the only campaign when there is one variant", async () => {
    const { weightedRandomCampaign } = await import("@/lib/ai/campaign-assignment");
    const result = weightedRandomCampaign([{ campaign_id: "only", weight: 50 }]);
    expect(result).toBe("only");
  });

  it("always returns a valid campaign_id", async () => {
    const { weightedRandomCampaign } = await import("@/lib/ai/campaign-assignment");
    const variants = [
      { campaign_id: "a", weight: 30 },
      { campaign_id: "b", weight: 70 },
    ];
    for (let i = 0; i < 20; i++) {
      const result = weightedRandomCampaign(variants);
      expect(["a", "b"]).toContain(result);
    }
  });
});
