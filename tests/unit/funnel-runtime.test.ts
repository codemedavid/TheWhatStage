// tests/unit/funnel-runtime.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  getOrInitFunnelState,
  advanceFunnel,
  incrementFunnelMessageCount,
  markFunnelCompletedByActionPage,
} from "@/lib/ai/funnel-runtime";
import type { CampaignFunnel } from "@/types/campaign-funnel";

const funnels: CampaignFunnel[] = [
  { id: "f0", campaignId: "c1", tenantId: "t1", position: 0, actionPageId: "p0", pageDescription: null, pitch: null, qualificationQuestions: [], chatRules: ["r0"], createdAt: "n", updatedAt: "n" },
  { id: "f1", campaignId: "c1", tenantId: "t1", position: 1, actionPageId: "p1", pageDescription: null, pitch: null, qualificationQuestions: [], chatRules: ["r1"], createdAt: "n", updatedAt: "n" },
];

function fakeService(initial: Record<string, unknown>) {
  const state = { ...initial };
  const select = vi.fn().mockReturnThis();
  const eq = vi.fn().mockReturnThis();
  const update = vi.fn().mockImplementation((patch: Record<string, unknown>) => {
    Object.assign(state, patch);
    return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) };
  });
  const single = vi.fn().mockResolvedValue({ data: state, error: null });
  return {
    state,
    from: vi.fn(() => ({ select, eq, update, single })),
  } as any;
}

describe("getOrInitFunnelState", () => {
  it("initializes when current_funnel_id is null", async () => {
    const svc = fakeService({
      current_campaign_id: null, current_funnel_id: null,
      current_funnel_position: 0, funnel_message_count: 0,
    });
    const state = await getOrInitFunnelState(svc, "conv1", "c1", funnels);
    expect(state.funnel.id).toBe("f0");
    expect(state.position).toBe(0);
  });

  it("re-initializes when campaign changes", async () => {
    const svc = fakeService({
      current_campaign_id: "OTHER", current_funnel_id: "fX",
      current_funnel_position: 2, funnel_message_count: 5,
    });
    const state = await getOrInitFunnelState(svc, "conv1", "c1", funnels);
    expect(state.funnel.id).toBe("f0");
    expect(state.position).toBe(0);
  });

  it("returns existing funnel when state matches", async () => {
    const svc = fakeService({
      current_campaign_id: "c1", current_funnel_id: "f1",
      current_funnel_position: 1, funnel_message_count: 3,
    });
    const state = await getOrInitFunnelState(svc, "conv1", "c1", funnels);
    expect(state.funnel.id).toBe("f1");
    expect(state.messageCount).toBe(3);
  });
});

describe("advanceFunnel", () => {
  it("advances from 0 to 1", async () => {
    const svc = fakeService({
      current_campaign_id: "c1", current_funnel_id: "f0",
      current_funnel_position: 0, funnel_message_count: 4,
    });
    const r = await advanceFunnel(svc, "conv1", funnels);
    expect(r.advanced).toBe(true);
    expect(r.completed).toBe(false);
    expect(r.funnel.id).toBe("f1");
    expect(r.position).toBe(1);
  });

  it("no-ops at last funnel and returns completed", async () => {
    const svc = fakeService({
      current_campaign_id: "c1", current_funnel_id: "f1",
      current_funnel_position: 1, funnel_message_count: 4,
    });
    const r = await advanceFunnel(svc, "conv1", funnels);
    expect(r.advanced).toBe(false);
    expect(r.completed).toBe(true);
    expect(r.funnel.id).toBe("f1");
  });
});

describe("markFunnelCompletedByActionPage", () => {
  it("advances when action page matches current funnel", async () => {
    const svc = fakeService({
      current_campaign_id: "c1", current_funnel_id: "f0",
      current_funnel_position: 0, funnel_message_count: 0,
    });
    const r = await markFunnelCompletedByActionPage(svc, "conv1", "p0", funnels);
    expect(r.advanced).toBe(true);
  });

  it("does nothing when action page does not match", async () => {
    const svc = fakeService({
      current_campaign_id: "c1", current_funnel_id: "f0",
      current_funnel_position: 0, funnel_message_count: 0,
    });
    const r = await markFunnelCompletedByActionPage(svc, "conv1", "p99", funnels);
    expect(r.advanced).toBe(false);
  });
});

describe("incrementFunnelMessageCount", () => {
  it("calls update with funnel_message_count + 1", async () => {
    const svc = fakeService({
      current_campaign_id: "c1", current_funnel_id: "f0",
      current_funnel_position: 0, funnel_message_count: 7,
    });
    await incrementFunnelMessageCount(svc, "conv1");
    expect(svc.state.funnel_message_count).toBe(8);
  });
});

describe("getOrInitFunnelState — error paths", () => {
  it("throws when funnels is empty", async () => {
    const svc = fakeService({ current_campaign_id: null, current_funnel_id: null, current_funnel_position: 0, funnel_message_count: 0 });
    await expect(getOrInitFunnelState(svc, "conv1", "c1", [])).rejects.toThrow(/empty funnels/i);
  });

  it("does not call update when state already matches", async () => {
    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const svc = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            current_campaign_id: "c1", current_funnel_id: "f0",
            current_funnel_position: 0, funnel_message_count: 2,
          },
          error: null,
        }),
        update: updateSpy,
      })),
    } as any;
    await getOrInitFunnelState(svc, "conv1", "c1", funnels);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

describe("advanceFunnel — error paths", () => {
  it("throws when current_funnel_id is not in funnels", async () => {
    const svc = fakeService({
      current_campaign_id: "c1", current_funnel_id: "STALE",
      current_funnel_position: 0, funnel_message_count: 0,
    });
    await expect(advanceFunnel(svc, "conv1", funnels)).rejects.toThrow(/not found/i);
  });
});
