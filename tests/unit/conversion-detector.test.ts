import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

describe("detectConversion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("records conversion when event type matches campaign goal", async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "lead_campaign_assignments") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { campaign_id: "camp-1" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaigns") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "camp-1", goal: "form_submit", goal_config: {} },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaign_conversions") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
              }),
            }),
          }),
          insert: insertFn,
        };
      }
      if (table === "conversations") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: "conv-1" }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "conversation_phases") {
        return { update: updateFn };
      }
      return {};
    });

    const { detectConversion } = await import("@/lib/ai/conversion-detector");
    const result = await detectConversion("lead-1", "form_submit", {});

    expect(result).toBe(true);
    expect(insertFn).toHaveBeenCalled();
  });

  it("returns false when event type does not match campaign goal", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "lead_campaign_assignments") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { campaign_id: "camp-1" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaigns") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "camp-1", goal: "purchase", goal_config: {} },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const { detectConversion } = await import("@/lib/ai/conversion-detector");
    const result = await detectConversion("lead-1", "form_submit", {});

    expect(result).toBe(false);
  });
});
