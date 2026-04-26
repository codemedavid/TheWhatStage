import { describe, it, expect } from "vitest";
import { funnelToStep } from "@/lib/ai/step-context";
import type { CampaignFunnel } from "@/types/campaign-funnel";

const funnels: CampaignFunnel[] = [
  { id: "f0", campaignId: "c1", tenantId: "t1", position: 0, actionPageId: "p0", pageDescription: "Lead magnet", chatRules: ["Lead with value", "Educate"], createdAt: "n", updatedAt: "n" },
  { id: "f1", campaignId: "c1", tenantId: "t1", position: 1, actionPageId: "p1", pageDescription: null, chatRules: ["Push to call"], createdAt: "n", updatedAt: "n" },
];

describe("funnelToStep", () => {
  it("formats name as 'Step N of M — page title'", () => {
    const step = funnelToStep({
      funnel: funnels[0], allFunnels: funnels,
      campaign: { goal: "form_submit" },
      page: { title: "Free Guide", type: "form" },
      tone: "friendly", messageCount: 2,
    });
    expect(step.name).toBe("Step 1 of 2 — Free Guide");
    expect(step.position).toBe(0);
    expect(step.total).toBe(2);
  });

  it("instructions concatenate all chat rules", () => {
    const step = funnelToStep({
      funnel: funnels[0], allFunnels: funnels,
      campaign: { goal: "form_submit" },
      page: { title: "Free Guide", type: "form" },
      tone: "friendly", messageCount: 0,
    });
    expect(step.instructions).toContain("Lead with value");
    expect(step.instructions).toContain("Educate");
  });

  it("instructions include page description when present", () => {
    const step = funnelToStep({
      funnel: funnels[0], allFunnels: funnels,
      campaign: { goal: "form_submit" },
      page: { title: "Free Guide", type: "form" },
      tone: "friendly", messageCount: 0,
    });
    expect(step.instructions.toLowerCase()).toContain("lead magnet");
  });

  it("omits page description block when null", () => {
    const step = funnelToStep({
      funnel: funnels[1], allFunnels: funnels,
      campaign: { goal: "appointment_booked" },
      page: { title: "Book a Call", type: "calendar" },
      tone: "friendly", messageCount: 0,
    });
    expect(step.instructions).not.toMatch(/page context/i);
  });

  it("actionButtonIds = [funnel.actionPageId]", () => {
    const step = funnelToStep({
      funnel: funnels[1], allFunnels: funnels,
      campaign: { goal: "appointment_booked" },
      page: { title: "Book a Call", type: "calendar" },
      tone: "friendly", messageCount: 0,
    });
    expect(step.actionButtonIds).toEqual(["p1"]);
  });

  it("transitionHint mentions sending the page when type is sales", () => {
    const step = funnelToStep({
      funnel: funnels[0], allFunnels: funnels,
      campaign: { goal: "purchase" },
      page: { title: "Coaching Sales", type: "sales" },
      tone: "friendly", messageCount: 0,
    });
    expect(step.transitionHint?.toLowerCase()).toMatch(/page|advance/);
  });

  it("default maxMessages is 8", () => {
    const step = funnelToStep({
      funnel: funnels[0], allFunnels: funnels,
      campaign: { goal: "form_submit" },
      page: { title: "Free Guide", type: "form" },
      tone: "friendly", messageCount: 0,
    });
    expect(step.maxMessages).toBe(8);
  });
});
