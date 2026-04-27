import { describe, it, expect } from "vitest";
import { funnelToStep } from "@/lib/ai/step-context";
import type { CampaignFunnel } from "@/types/campaign-funnel";

const funnels: CampaignFunnel[] = [
  {
    id: "f0",
    campaignId: "c1",
    tenantId: "t1",
    position: 0,
    actionPageId: "p0",
    pageDescription: "Lead magnet",
    pitch: "Show them why the free guide helps diagnose their funnel leak.",
    qualificationQuestions: ["What are you selling right now?", "Where do leads usually drop off?"],
    chatRules: ["Lead with value", "Educate"],
    createdAt: "n",
    updatedAt: "n",
  },
  {
    id: "f1",
    campaignId: "c1",
    tenantId: "t1",
    position: 1,
    actionPageId: "p1",
    pageDescription: null,
    pitch: null,
    qualificationQuestions: [],
    chatRules: ["Push to call"],
    createdAt: "n",
    updatedAt: "n",
  },
];

describe("funnelToStep", () => {
  it("formats name as 'Step N of M — page title'", () => {
    const step = funnelToStep({
      funnel: funnels[0], allFunnels: funnels,
      campaign: { goal: "form_submit" },
      page: { title: "Free Guide", type: "form" },
      tone: "friendly",
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
      tone: "friendly",
    });
    expect(step.instructions).toContain("Lead with value");
    expect(step.instructions).toContain("Educate");
  });

  it("instructions include page description when present", () => {
    const step = funnelToStep({
      funnel: funnels[0], allFunnels: funnels,
      campaign: { goal: "form_submit" },
      page: { title: "Free Guide", type: "form" },
      tone: "friendly",
    });
    expect(step.instructions.toLowerCase()).toContain("lead magnet");
  });

  it("instructions include funnel pitch and qualification questions before rules", () => {
    const step = funnelToStep({
      funnel: funnels[0], allFunnels: funnels,
      campaign: { goal: "form_submit" },
      page: { title: "Free Guide", type: "form" },
      tone: "friendly",
    });
    expect(step.instructions).toContain("Pitch for this step:");
    expect(step.instructions).toContain("free guide helps diagnose their funnel leak");
    expect(step.instructions).toContain("First qualification questions:");
    expect(step.instructions).toContain("1. What are you selling right now?");
    expect(step.instructions.indexOf("First qualification questions")).toBeLessThan(
      step.instructions.indexOf("Chat rules for this step")
    );
  });

  it("omits page description block when null", () => {
    const step = funnelToStep({
      funnel: funnels[1], allFunnels: funnels,
      campaign: { goal: "appointment_booked" },
      page: { title: "Book a Call", type: "calendar" },
      tone: "friendly",
    });
    expect(step.instructions).not.toMatch(/page context/i);
  });

  it("actionButtonIds = [funnel.actionPageId]", () => {
    const step = funnelToStep({
      funnel: funnels[1], allFunnels: funnels,
      campaign: { goal: "appointment_booked" },
      page: { title: "Book a Call", type: "calendar" },
      tone: "friendly",
    });
    expect(step.actionButtonIds).toEqual(["p1"]);
  });

  it("transitionHint mentions sending the page when type is sales", () => {
    const step = funnelToStep({
      funnel: funnels[0], allFunnels: funnels,
      campaign: { goal: "purchase" },
      page: { title: "Coaching Sales", type: "sales" },
      tone: "friendly",
    });
    expect(step.transitionHint?.toLowerCase()).toMatch(/page|advance/);
  });

  it("does not attach a message-count budget to funnel steps", () => {
    const step = funnelToStep({
      funnel: funnels[0], allFunnels: funnels,
      campaign: { goal: "form_submit" },
      page: { title: "Free Guide", type: "form" },
      tone: "friendly",
    });
    expect("maxMessages" in step).toBe(false);
    expect("messageCount" in step).toBe(false);
  });
});
