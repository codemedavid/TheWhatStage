import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

function selectChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.single = vi.fn().mockResolvedValue(result);
  return chain;
}

function insertChain(result: unknown) {
  return { insert: vi.fn().mockResolvedValue(result) };
}

function updateChain(result: unknown = { error: null }) {
  const chain: Record<string, unknown> = {};
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockResolvedValue(result);
  // resolve when awaited directly after .eq()
  (chain as unknown as { then: unknown }).then = (
    onFulfilled: (v: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled);
  return chain;
}

describe("getOrAssignCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns existing assignment when lead is already assigned", async () => {
    mockFrom
      .mockReturnValueOnce(
        selectChain({ data: { campaign_id: "camp-1" }, error: null })
      )
      .mockReturnValueOnce(updateChain()); // self-heal mirror

    const { getOrAssignCampaign } = await import("@/lib/ai/campaign-assignment");
    const result = await getOrAssignCampaign("lead-1", "tenant-1");

    expect(result).toBe("camp-1");
    expect(mockFrom).toHaveBeenCalledWith("lead_campaign_assignments");
  });

  it("assigns to primary campaign when no experiment is running", async () => {
    mockFrom
      .mockReturnValueOnce(selectChain({ data: null, error: null })) // assignment lookup
      .mockReturnValueOnce(selectChain({ data: null, error: null })) // experiment lookup
      .mockReturnValueOnce(selectChain({ data: { id: "primary-camp" }, error: null })) // primary
      .mockReturnValueOnce(insertChain({ error: null })) // assignment insert
      .mockReturnValueOnce(updateChain()) // mirror to leads
      .mockReturnValueOnce(insertChain({ error: null })); // lead_events insert

    const { getOrAssignCampaign } = await import("@/lib/ai/campaign-assignment");
    const result = await getOrAssignCampaign("lead-1", "tenant-1");

    expect(result).toBe("primary-camp");
  });

  it("falls back to oldest active campaign when no primary flag is set", async () => {
    mockFrom
      .mockReturnValueOnce(selectChain({ data: null, error: null })) // assignment lookup
      .mockReturnValueOnce(selectChain({ data: null, error: null })) // experiment lookup
      .mockReturnValueOnce(selectChain({ data: null, error: null })) // primary lookup (no row)
      .mockReturnValueOnce(selectChain({ data: { id: "active-camp" }, error: null })) // oldest active
      .mockReturnValueOnce(insertChain({ error: null }))
      .mockReturnValueOnce(updateChain())
      .mockReturnValueOnce(insertChain({ error: null }));

    const { getOrAssignCampaign } = await import("@/lib/ai/campaign-assignment");
    const result = await getOrAssignCampaign("lead-1", "tenant-1");

    expect(result).toBe("active-camp");
  });

  it("falls back to oldest campaign of any status when nothing is active", async () => {
    mockFrom
      .mockReturnValueOnce(selectChain({ data: null, error: null }))
      .mockReturnValueOnce(selectChain({ data: null, error: null }))
      .mockReturnValueOnce(selectChain({ data: null, error: null })) // no primary
      .mockReturnValueOnce(selectChain({ data: null, error: null })) // no active
      .mockReturnValueOnce(selectChain({ data: { id: "any-camp" }, error: null })) // any
      .mockReturnValueOnce(insertChain({ error: null }))
      .mockReturnValueOnce(updateChain())
      .mockReturnValueOnce(insertChain({ error: null }));

    const { getOrAssignCampaign } = await import("@/lib/ai/campaign-assignment");
    const result = await getOrAssignCampaign("lead-1", "tenant-1");

    expect(result).toBe("any-camp");
  });

  it("assigns via weighted random when experiment is running", async () => {
    mockFrom
      .mockReturnValueOnce(selectChain({ data: null, error: null }))
      .mockReturnValueOnce(
        selectChain({
          data: {
            id: "exp-1",
            experiment_campaigns: [
              { campaign_id: "camp-a", weight: 100 },
              { campaign_id: "camp-b", weight: 0 },
            ],
          },
          error: null,
        })
      )
      .mockReturnValueOnce(insertChain({ error: null }))
      .mockReturnValueOnce(updateChain())
      .mockReturnValueOnce(insertChain({ error: null }));

    const { getOrAssignCampaign } = await import("@/lib/ai/campaign-assignment");
    const result = await getOrAssignCampaign("lead-1", "tenant-1");

    expect(result).toBe("camp-a");
  });

  it("returns null when tenant has zero campaigns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFrom
      .mockReturnValueOnce(selectChain({ data: null, error: null })) // assignment
      .mockReturnValueOnce(selectChain({ data: null, error: null })) // experiment
      .mockReturnValueOnce(selectChain({ data: null, error: null })) // primary
      .mockReturnValueOnce(selectChain({ data: null, error: null })) // active
      .mockReturnValueOnce(selectChain({ data: null, error: null })); // any

    const { getOrAssignCampaign } = await import("@/lib/ai/campaign-assignment");
    const result = await getOrAssignCampaign("lead-1", "tenant-1");

    expect(result).toBeNull();
    warn.mockRestore();
  });

  it("recovers from concurrent insert race via re-read", async () => {
    mockFrom
      .mockReturnValueOnce(selectChain({ data: null, error: null })) // assignment lookup
      .mockReturnValueOnce(selectChain({ data: null, error: null })) // experiment
      .mockReturnValueOnce(selectChain({ data: { id: "primary-camp" }, error: null })) // primary
      .mockReturnValueOnce(insertChain({ error: { code: "23505", message: "dup" } })) // race
      .mockReturnValueOnce(
        selectChain({ data: { campaign_id: "winner-camp" }, error: null })
      ) // re-read
      .mockReturnValueOnce(updateChain()); // mirror

    const { getOrAssignCampaign } = await import("@/lib/ai/campaign-assignment");
    const result = await getOrAssignCampaign("lead-1", "tenant-1");

    expect(result).toBe("winner-camp");
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
