import { describe, it, expect } from "vitest";
import {
  buildCampaignPrompt,
  buildPhasePromptPrompt,
  buildFaqPrompt,
  buildGeneralArticlePrompt,
  buildUrlArticlePrompt,
} from "@/lib/onboarding/prompts";
import type { BusinessContext, GeneratedPhaseOutline } from "@/lib/onboarding/generation-types";

const ctx: BusinessContext = {
  businessType: "ecommerce",
  botGoal: "sell",
  businessDescription: "We sell handmade leather bags",
  mainAction: "purchase",
  differentiator: "Hand-stitched Italian leather",
  qualificationCriteria: "Budget range and style preference",
  tenantName: "LeatherCo",
};

describe("buildCampaignPrompt", () => {
  it("returns a system prompt and user message", () => {
    const { systemPrompt, userMessage } = buildCampaignPrompt(ctx);
    expect(systemPrompt).toContain("JSON");
    expect(userMessage).toContain("ecommerce");
    expect(userMessage).toContain("leather bags");
    expect(userMessage).toContain("purchase");
  });
});

describe("buildPhasePromptPrompt", () => {
  it("includes phase outline details in the user message", () => {
    const phase: GeneratedPhaseOutline = {
      name: "Welcome",
      order: 0,
      max_messages: 1,
      goals: "Greet the user",
      transition_hint: "Move to discovery after greeting",
      tone: "friendly",
    };
    const { systemPrompt, userMessage } = buildPhasePromptPrompt(ctx, phase);
    expect(systemPrompt).toContain("system_prompt");
    expect(userMessage).toContain("Welcome");
    expect(userMessage).toContain("Greet the user");
    expect(userMessage).toContain("Budget range");
  });
});

describe("buildFaqPrompt", () => {
  it("asks for FAQ pairs as JSON", () => {
    const { systemPrompt, userMessage } = buildFaqPrompt(ctx);
    expect(systemPrompt).toContain("JSON");
    expect(systemPrompt).toContain("question");
    expect(userMessage).toContain("leather bags");
  });
});

describe("buildGeneralArticlePrompt", () => {
  it("asks for an about article", () => {
    const { systemPrompt, userMessage } = buildGeneralArticlePrompt(ctx);
    expect(userMessage).toContain("LeatherCo");
  });
});

describe("buildUrlArticlePrompt", () => {
  it("includes scraped content in the user message", () => {
    const scraped = "We have 50 products in stock...";
    const { userMessage } = buildUrlArticlePrompt(ctx, scraped);
    expect(userMessage).toContain("50 products");
    expect(userMessage).toContain("LeatherCo");
  });
});
