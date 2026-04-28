import { describe, it, expect } from "vitest";
import { buildCampaignTopAnchor, buildCampaignClosingAnchor } from "@/lib/ai/prompt/campaign-lock";

const CAMPAIGN = {
  name: "Q3 starter package",
  goal: "book_appointment",
  mainGoal: "Book a 30-min discovery call",
  description: "PHP 4,999 starter package for SMBs",
};
const STEP = { name: "Step 1 of 2 — Booking", actionButtonTitle: "Book a call" };

describe("campaign-lock", () => {
  it("top anchor surfaces campaign + step + button", () => {
    const out = buildCampaignTopAnchor(CAMPAIGN, STEP);
    expect(out).toContain("Q3 starter package");
    expect(out).toContain("Book a 30-min discovery call");
    expect(out).toContain("Book a call");
  });

  it("closing anchor restates goal as the final instruction", () => {
    const out = buildCampaignClosingAnchor(CAMPAIGN, STEP);
    expect(out).toContain("Book a 30-min discovery call");
    expect(out.toLowerCase()).toContain("this turn");
  });

  it("closing anchor contains zero example phrases", () => {
    const out = buildCampaignClosingAnchor(CAMPAIGN, STEP);
    expect(out).not.toMatch(/<.+>/);
    expect(out).not.toMatch(/e\.g\./i);
  });
});
