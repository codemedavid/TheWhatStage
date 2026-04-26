// tests/unit/campaign-funnels-repo.test.ts
import { describe, it, expect, vi } from "vitest";
import { listFunnelsForCampaign, saveFunnelsForCampaign } from "@/lib/db/campaign-funnels";

function fakeService(rows: any[] = []) {
  const order = vi.fn().mockReturnThis();
  const eq = vi.fn().mockReturnThis();
  const select = vi.fn().mockReturnThis();
  const from = vi.fn().mockReturnThis();
  const insert = vi.fn().mockResolvedValue({ data: rows, error: null });
  const del = vi.fn().mockResolvedValue({ error: null });
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
});

describe("saveFunnelsForCampaign", () => {
  it("rejects more than 3 funnels", async () => {
    const svc = {} as any;
    await expect(
      saveFunnelsForCampaign(svc, "t", "c", [
        { actionPageId: "p1", chatRules: ["r"], pageDescription: null },
        { actionPageId: "p2", chatRules: ["r"], pageDescription: null },
        { actionPageId: "p3", chatRules: ["r"], pageDescription: null },
        { actionPageId: "p4", chatRules: ["r"], pageDescription: null },
      ])
    ).rejects.toThrow(/at most 3 funnels/i);
  });

  it("rejects empty funnel list", async () => {
    const svc = {} as any;
    await expect(saveFunnelsForCampaign(svc, "t", "c", [])).rejects.toThrow(/at least 1 funnel/i);
  });
});
