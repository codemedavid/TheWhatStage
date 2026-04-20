import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/llm-client", () => ({
  generateResponse: vi.fn(),
}));
vi.mock("@/lib/ai/embedding", () => ({
  embedText: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
  embedBatch: vi.fn().mockResolvedValue([
    new Array(1536).fill(0.1),
    new Array(1536).fill(0.2),
  ]),
}));
vi.mock("@/lib/onboarding/scraper", () => ({
  scrapeUrl: vi.fn().mockResolvedValue("Real website content about leather bags"),
}));

import { runGenerationPipeline } from "@/lib/onboarding/generator";
import { generateResponse } from "@/lib/ai/llm-client";
import type { GenerationInput } from "@/lib/onboarding/generation-types";

describe("Full generation pipeline", () => {
  const input: GenerationInput = {
    businessType: "ecommerce",
    botGoal: "sell",
    businessDescription: "Premium handmade leather bags — wallets, totes, messengers. $50-$300.",
    mainAction: "purchase",
    differentiator: "Hand-stitched Italian leather, lifetime warranty",
    qualificationCriteria: "Budget range, style preference, gift or personal use",
    websiteUrl: "https://leatherco.example.com",
    firstName: "John",
    lastName: "Doe",
    tenantName: "LeatherCo",
    tenantSlug: "leatherco",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a complete campaign, phases, FAQs, and articles including URL-based", async () => {
    const mockGenerate = vi.mocked(generateResponse);

    // Campaign + phases (1 call)
    mockGenerate.mockResolvedValueOnce({
      content: JSON.stringify({
        campaign: {
          name: "LeatherCo Discovery Funnel",
          description: "Guide leads from interest to purchase",
          goal: "purchase",
          follow_up_message: "Hey! Still thinking about that bag? Happy to help.",
        },
        phases: [
          { name: "Welcome", order: 0, max_messages: 1, goals: "Warm greeting", transition_hint: "Immediately after greeting", tone: "friendly" },
          { name: "Style Discovery", order: 1, max_messages: 4, goals: "Understand preferences", transition_hint: "When style is clear", tone: "curious" },
          { name: "Recommend", order: 2, max_messages: 3, goals: "Suggest products", transition_hint: "When interest shown", tone: "enthusiastic" },
        ],
      }),
      finishReason: "stop",
    });

    // 3 phase prompts (parallel)
    mockGenerate.mockResolvedValueOnce({ content: "You are a warm, welcoming host for LeatherCo...", finishReason: "stop" });
    mockGenerate.mockResolvedValueOnce({ content: "You are helping discover the customer's style...", finishReason: "stop" });
    mockGenerate.mockResolvedValueOnce({ content: "You are an enthusiastic product recommender...", finishReason: "stop" });

    // FAQs (1 call)
    mockGenerate.mockResolvedValueOnce({
      content: JSON.stringify({
        faqs: [
          { question: "What do you sell?", answer: "We sell premium handmade leather bags." },
          { question: "What's the price range?", answer: "Our bags range from $50 to $300." },
        ],
      }),
      finishReason: "stop",
    });

    // General article (1 call)
    mockGenerate.mockResolvedValueOnce({ content: "LeatherCo is a premium leather goods brand...", finishReason: "stop" });

    // URL article (1 call, because websiteUrl is set)
    mockGenerate.mockResolvedValueOnce({ content: "Based on their website, LeatherCo offers...", finishReason: "stop" });

    const steps: string[] = [];
    const result = await runGenerationPipeline(input, null, (s) => steps.push(s));

    // Verify steps fired
    expect(steps).toEqual(["context", "campaign", "parallel", "embeddings"]);

    // Verify campaign
    expect(result.campaign?.name).toBe("LeatherCo Discovery Funnel");
    expect(result.campaign?.goal).toBe("purchase");

    // Verify phases
    expect(result.phases).toHaveLength(3);
    expect(result.phases![0].name).toBe("Welcome");
    expect(result.phases![0].system_prompt).toContain("LeatherCo");
    expect(result.phases![2].system_prompt).toContain("recommender");

    // Verify FAQs
    expect(result.faqs).toHaveLength(2);

    // Verify articles
    expect(result.generalArticle).toContain("LeatherCo");
    expect(result.urlArticle).toContain("website");

    // Verify embeddings exist with correct dimensions
    expect(result.embeddings?.faqEmbeddings).toHaveLength(2);
    expect(result.embeddings?.generalArticleEmbedding).toHaveLength(1536);
    expect(result.embeddings?.urlArticleEmbedding).toHaveLength(1536);
  });

  it("handles missing URL gracefully — no URL article generated", async () => {
    const noUrlInput = { ...input, websiteUrl: undefined };
    const mockGenerate = vi.mocked(generateResponse);

    mockGenerate.mockResolvedValueOnce({
      content: JSON.stringify({
        campaign: { name: "Test", description: "Test", goal: "purchase", follow_up_message: "Hey" },
        phases: [{ name: "Welcome", order: 0, max_messages: 1, goals: "Greet", transition_hint: "Next", tone: "friendly" }],
      }),
      finishReason: "stop",
    });
    mockGenerate.mockResolvedValueOnce({ content: "Welcome prompt", finishReason: "stop" });
    mockGenerate.mockResolvedValueOnce({
      content: JSON.stringify({ faqs: [{ question: "Q?", answer: "A." }] }),
      finishReason: "stop",
    });
    mockGenerate.mockResolvedValueOnce({ content: "General article", finishReason: "stop" });

    const result = await runGenerationPipeline(noUrlInput, null, () => {});

    expect(result.urlArticle).toBeUndefined();
    expect(result.embeddings?.urlArticleEmbedding).toBeUndefined();
  });
});
