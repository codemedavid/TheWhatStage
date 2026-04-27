// tests/unit/campaign-funnels-repo.test.ts
import { describe, it, expect, vi } from "vitest";
import { listFunnelsForCampaign, saveFunnelsForCampaign } from "@/lib/db/campaign-funnels";

function fakeService(rows: any[] = []) {
  const order = vi.fn().mockReturnThis();
  const eq = vi.fn().mockReturnThis();
  const select = vi.fn().mockReturnThis();
  const from = vi.fn().mockReturnThis();
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: rows, error: null }),
  });
  const del = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  return {
    from: vi.fn(() => ({ select, eq, order, insert, delete: del })),
    _last: { select, eq, order, insert, delete: del },
  } as any;
}

describe("listFunnelsForCampaign", () => {
  it("orders results by position ascending", async () => {
    const svc = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [
            { id: "a", position: 0, campaign_id: "c", tenant_id: "t", action_page_id: "p", page_description: null, chat_rules: ["r"], created_at: "now", updated_at: "now" },
          ],
          error: null,
        }),
      })),
    } as any;
    const result = await listFunnelsForCampaign(svc, "c");
    expect(result[0].position).toBe(0);
  });

  it("maps funnel pitch and qualification questions", async () => {
    const svc = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: "a",
              position: 0,
              campaign_id: "c",
              tenant_id: "t",
              action_page_id: "p",
              page_description: null,
              pitch: "Pitch the consultation as the fastest path.",
              qualification_questions: ["What are you selling?"],
              chat_rules: ["r"],
              created_at: "now",
              updated_at: "now",
            },
          ],
          error: null,
        }),
      })),
    } as any;
    const result = await listFunnelsForCampaign(svc, "c");
    expect(result[0].pitch).toBe("Pitch the consultation as the fastest path.");
    expect(result[0].qualificationQuestions).toEqual(["What are you selling?"]);
  });
});

describe("saveFunnelsForCampaign", () => {
  it("rejects more than 3 funnels", async () => {
    const svc = {} as any;
    await expect(
      saveFunnelsForCampaign(svc, "t", "c", [
        { actionPageId: "p1", chatRules: ["r"], pageDescription: null, pitch: null, qualificationQuestions: [] },
        { actionPageId: "p2", chatRules: ["r"], pageDescription: null, pitch: null, qualificationQuestions: [] },
        { actionPageId: "p3", chatRules: ["r"], pageDescription: null, pitch: null, qualificationQuestions: [] },
        { actionPageId: "p4", chatRules: ["r"], pageDescription: null, pitch: null, qualificationQuestions: [] },
      ])
    ).rejects.toThrow(/at most 3 funnels/i);
  });

  it("persists pitch and qualification questions for each funnel", async () => {
    const svc = fakeService([]);
    await saveFunnelsForCampaign(svc, "t", "c", [
      {
        actionPageId: "p1",
        chatRules: ["r"],
        pageDescription: null,
        pitch: "Make the form feel valuable.",
        qualificationQuestions: ["What outcome matters most?"],
      },
    ]);
    expect(svc._last.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        pitch: "Make the form feel valuable.",
        qualification_questions: ["What outcome matters most?"],
      }),
    ]);
  });

  it("rejects empty funnel list", async () => {
    const svc = {} as any;
    await expect(saveFunnelsForCampaign(svc, "t", "c", [])).rejects.toThrow(/at least 1 funnel/i);
  });
});
