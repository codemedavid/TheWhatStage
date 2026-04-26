// tests/unit/funnel-templates.test.ts
import { describe, it, expect } from "vitest";
import { defaultRulesForPageType, ACTION_PAGE_TYPES } from "@/lib/ai/funnel-templates";

describe("defaultRulesForPageType", () => {
  it.each(ACTION_PAGE_TYPES)("returns at least one rule for %s", (type) => {
    const rules = defaultRulesForPageType(type);
    expect(rules.length).toBeGreaterThan(0);
    rules.forEach((r) => expect(r).toMatch(/\S/));
  });

  it("sales rules push the page within a few turns", () => {
    const rules = defaultRulesForPageType("sales").join(" ").toLowerCase();
    expect(rules).toMatch(/send|open|click|page/);
  });

  it("form rules emphasize value and education", () => {
    const rules = defaultRulesForPageType("form").join(" ").toLowerCase();
    expect(rules).toMatch(/value|benefit|why/);
  });

  it("throws on unknown page type", () => {
    // @ts-expect-error — testing runtime guard
    expect(() => defaultRulesForPageType("nope")).toThrow();
  });
});
