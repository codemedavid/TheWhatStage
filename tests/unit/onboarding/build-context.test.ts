import { describe, it, expect } from "vitest";
import { buildContext } from "@/lib/onboarding/build-context";
import type { GenerationInput } from "@/lib/onboarding/generation-types";

describe("buildContext", () => {
  it("formats all required fields into a BusinessContext", () => {
    const input: GenerationInput = {
      businessType: "ecommerce",
      botGoal: "sell",
      businessDescription: "We sell handmade leather bags",
      mainAction: "purchase",
      differentiator: "Hand-stitched Italian leather",
      qualificationCriteria: "Budget range and style preference",
      websiteUrl: "https://example.com",
      firstName: "John",
      lastName: "Doe",
      tenantName: "LeatherCo",
      tenantSlug: "leatherco",
    };

    const ctx = buildContext(input);

    expect(ctx.businessType).toBe("ecommerce");
    expect(ctx.botGoal).toBe("sell");
    expect(ctx.businessDescription).toBe("We sell handmade leather bags");
    expect(ctx.mainAction).toBe("purchase");
    expect(ctx.differentiator).toBe("Hand-stitched Italian leather");
    expect(ctx.qualificationCriteria).toBe("Budget range and style preference");
    expect(ctx.websiteUrl).toBe("https://example.com");
    expect(ctx.tenantName).toBe("LeatherCo");
  });

  it("omits websiteUrl when not provided", () => {
    const input: GenerationInput = {
      businessType: "services",
      botGoal: "qualify_leads",
      businessDescription: "We offer consulting",
      mainAction: "call",
      differentiator: "",
      qualificationCriteria: "Company size and budget",
      firstName: "Jane",
      lastName: "Smith",
      tenantName: "ConsultCo",
      tenantSlug: "consultco",
    };

    const ctx = buildContext(input);

    expect(ctx.websiteUrl).toBeUndefined();
    expect(ctx.differentiator).toBe("");
  });
});
