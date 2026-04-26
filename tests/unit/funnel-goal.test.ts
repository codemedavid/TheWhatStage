// tests/unit/funnel-goal.test.ts
import { describe, it, expect } from "vitest";
import { deriveCampaignGoal } from "@/lib/ai/funnel-goal";

describe("deriveCampaignGoal", () => {
  it.each([
    ["sales", "purchase"],
    ["checkout", "purchase"],
    ["product_catalog", "purchase"],
    ["form", "form_submit"],
    ["qualification", "form_submit"],
    ["calendar", "appointment_booked"],
  ] as const)("maps %s last funnel to %s", (lastType, goal) => {
    expect(deriveCampaignGoal(lastType)).toBe(goal);
  });
});
