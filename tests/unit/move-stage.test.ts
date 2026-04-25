import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

// Helper: build a fully-chainable Supabase query mock
function buildChain(terminalResult: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const wrap = () => chain;

  chain.select = vi.fn(wrap);
  chain.insert = vi.fn().mockResolvedValue({ error: null });
  chain.update = vi.fn(wrap);
  chain.eq = vi.fn(wrap);
  chain.order = vi.fn(wrap);
  chain.limit = vi.fn(wrap);
  chain.maybeSingle = vi.fn().mockResolvedValue(terminalResult);

  return chain;
}

describe("moveLeadToStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("inserts a history entry and updates leads.stage_id", async () => {
    const insertHistoryFn = vi.fn().mockResolvedValue({ error: null });
    const updateLeadChain = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
    const updateFn = vi.fn().mockReturnValue(updateLeadChain);

    mockFrom.mockImplementation((table: string) => {
      if (table === "lead_stage_history") {
        // First call: select for previous entry (no previous entry)
        // Second call: insert new history record
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
          insert: insertHistoryFn,
        };
      }
      if (table === "leads") {
        return { update: updateFn };
      }
      return {};
    });

    const { moveLeadToStage } = await import("@/lib/leads/move-stage");

    await moveLeadToStage({
      tenantId: "tenant-1",
      leadId: "lead-1",
      fromStageId: "stage-a",
      toStageId: "stage-b",
      reason: "AI determined lead is qualified",
      actorType: "ai",
      actorId: null,
    });

    expect(insertHistoryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        lead_id: "lead-1",
        from_stage_id: "stage-a",
        to_stage_id: "stage-b",
        reason: "AI determined lead is qualified",
        actor_type: "ai",
        actor_id: null,
      })
    );

    expect(updateFn).toHaveBeenCalledWith({ stage_id: "stage-b" });
  });

  it("computes duration_seconds from the previous history entry's created_at", async () => {
    const insertHistoryFn = vi.fn().mockResolvedValue({ error: null });

    // 60 seconds ago
    const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString();

    mockFrom.mockImplementation((table: string) => {
      if (table === "lead_stage_history") {
        // The implementation calls .from("lead_stage_history") once for select+insert
        // select chain returns previous entry; insert spy captures the new record
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { created_at: sixtySecondsAgo },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
          insert: insertHistoryFn,
        };
      }
      if (table === "leads") {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const { moveLeadToStage } = await import("@/lib/leads/move-stage");

    await moveLeadToStage({
      tenantId: "tenant-1",
      leadId: "lead-1",
      fromStageId: "stage-a",
      toStageId: "stage-b",
      reason: "follow-up complete",
      actorType: "agent",
      actorId: "agent-42",
    });

    expect(insertHistoryFn).toHaveBeenCalledOnce();
    const insertedRecord = insertHistoryFn.mock.calls[0][0];
    expect(insertedRecord.duration_seconds).toBeGreaterThanOrEqual(59);
    expect(insertedRecord.duration_seconds).toBeLessThanOrEqual(62);
  });

  it("sets duration_seconds to null when there is no previous history entry (first stage assignment)", async () => {
    const insertHistoryFn = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "lead_stage_history") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
          insert: insertHistoryFn,
        };
      }
      if (table === "leads") {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const { moveLeadToStage } = await import("@/lib/leads/move-stage");

    await moveLeadToStage({
      tenantId: "tenant-1",
      leadId: "lead-new",
      fromStageId: null,
      toStageId: "stage-initial",
      reason: "New lead entered funnel",
      actorType: "automation",
      actorId: "workflow-1",
    });

    expect(insertHistoryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        from_stage_id: null,
        to_stage_id: "stage-initial",
        duration_seconds: null,
      })
    );
  });

  it("passes actor_id and actor_type correctly", async () => {
    const insertHistoryFn = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "lead_stage_history") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
          insert: insertHistoryFn,
        };
      }
      if (table === "leads") {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const { moveLeadToStage } = await import("@/lib/leads/move-stage");

    await moveLeadToStage({
      tenantId: "tenant-99",
      leadId: "lead-55",
      fromStageId: "stage-x",
      toStageId: "stage-y",
      reason: "manual agent move",
      actorType: "agent",
      actorId: "user-agent-7",
    });

    expect(insertHistoryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_type: "agent",
        actor_id: "user-agent-7",
        tenant_id: "tenant-99",
        lead_id: "lead-55",
      })
    );
  });
});
