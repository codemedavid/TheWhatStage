import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external dependencies before importing
vi.mock("@/lib/ai/llm-client", () => ({
  generateResponse: vi.fn(),
}));
vi.mock("@/lib/ai/embedding", () => ({
  embedText: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
  embedBatch: vi.fn().mockResolvedValue([new Array(1536).fill(0.1)]),
}));
vi.mock("@/lib/onboarding/scraper", () => ({
  scrapeUrl: vi.fn().mockResolvedValue("Scraped website content here"),
}));

import { runGenerationPipeline } from "@/lib/onboarding/generator";
import { generateResponse } from "@/lib/ai/llm-client";
import type { GenerationInput, GenerationResults } from "@/lib/onboarding/generation-types";


const mockInput: GenerationInput = {
  businessType: "ecommerce",
  botGoal: "sell",
  businessDescription: "We sell handmade leather bags",
  mainAction: "purchase",
  differentiator: "Hand-stitched",
  qualificationCriteria: "Budget and style",
  firstName: "John",
  lastName: "Doe",
  tenantName: "LeatherCo",
  tenantSlug: "leatherco",
};

const mockCampaignResponse = JSON.stringify({
  campaign: {
    name: "Leather Discovery",
    description: "Guide leads to purchase",
    goal: "purchase",
    follow_up_message: "Still interested in our bags?",
  },
  phases: [
    { name: "Welcome", order: 0, max_messages: 1, goals: "Greet", transition_hint: "After greeting", tone: "friendly" },
    { name: "Discover", order: 1, max_messages: 4, goals: "Learn needs", transition_hint: "After qualifying", tone: "curious" },
  ],
});

const mockFaqResponse = JSON.stringify({
  faqs: [
    { question: "What do you sell?", answer: "Handmade leather bags." },
    { question: "How much?", answer: "$50-$300." },
  ],
});

describe("runGenerationPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs full pipeline from scratch and calls onProgress for each step", async () => {
    const mockGenerate = vi.mocked(generateResponse);
    // Call 1: campaign
    mockGenerate.mockResolvedValueOnce({ content: mockCampaignResponse, finishReason: "stop" });
    // Calls 2-3: phase prompts (2 phases)
    mockGenerate.mockResolvedValueOnce({ content: "You are a friendly greeter...", finishReason: "stop" });
    mockGenerate.mockResolvedValueOnce({ content: "You are a curious discoverer...", finishReason: "stop" });
    // Call 4: FAQs
    mockGenerate.mockResolvedValueOnce({ content: mockFaqResponse, finishReason: "stop" });
    // Call 5: general article
    mockGenerate.mockResolvedValueOnce({ content: "LeatherCo is a premium leather goods company...", finishReason: "stop" });
    // Call 6: URL article (websiteUrl not provided in mockInput, so this won't be called)

    const steps: string[] = [];
    const onProgress = (step: string) => steps.push(step);

    const result = await runGenerationPipeline(mockInput, null, onProgress);

    expect(steps).toEqual(["context", "campaign", "parallel", "embeddings"]);
    expect(result.context).toBeDefined();
    expect(result.campaign?.name).toBe("Leather Discovery");
    expect(result.phases).toHaveLength(2);
    expect(result.phases![0].system_prompt).toBe("You are a friendly greeter...");
    expect(result.faqs).toHaveLength(2);
    expect(result.generalArticle).toContain("LeatherCo");
  });

  it("resumes from campaign checkpoint — skips context and campaign steps", async () => {
    const mockGenerate = vi.mocked(generateResponse);
    // Only parallel calls needed (2 phase prompts + FAQs + general article)
    mockGenerate.mockResolvedValueOnce({ content: "Greeter prompt", finishReason: "stop" });
    mockGenerate.mockResolvedValueOnce({ content: "Discoverer prompt", finishReason: "stop" });
    mockGenerate.mockResolvedValueOnce({ content: mockFaqResponse, finishReason: "stop" });
    mockGenerate.mockResolvedValueOnce({ content: "About LeatherCo...", finishReason: "stop" });

    const existingResults: GenerationResults = {
      context: {
        businessType: "ecommerce",
        botGoal: "sell",
        businessDescription: "We sell handmade leather bags",
        mainAction: "purchase",
        differentiator: "Hand-stitched",
        qualificationCriteria: "Budget and style",
        tenantName: "LeatherCo",
      },
      campaign: {
        name: "Leather Discovery",
        description: "Guide leads to purchase",
        goal: "purchase",
        follow_up_message: "Still interested?",
      },
      phaseOutlines: [
        { name: "Welcome", order: 0, max_messages: 1, goals: "Greet", transition_hint: "After greeting", tone: "friendly" },
        { name: "Discover", order: 1, max_messages: 4, goals: "Learn needs", transition_hint: "After qualifying", tone: "curious" },
      ],
    };

    const steps: string[] = [];
    const result = await runGenerationPipeline(
      mockInput,
      { checkpoint: "campaign", results: existingResults },
      (step) => steps.push(step)
    );

    // Should NOT include context or campaign steps
    expect(steps).toEqual(["parallel", "embeddings"]);
    expect(result.phases).toHaveLength(2);
  });

  it("generates URL article when websiteUrl is provided", async () => {
    const mockGenerate = vi.mocked(generateResponse);
    mockGenerate.mockResolvedValueOnce({ content: mockCampaignResponse, finishReason: "stop" });
    mockGenerate.mockResolvedValueOnce({ content: "Phase 1 prompt", finishReason: "stop" });
    mockGenerate.mockResolvedValueOnce({ content: "Phase 2 prompt", finishReason: "stop" });
    mockGenerate.mockResolvedValueOnce({ content: mockFaqResponse, finishReason: "stop" });
    mockGenerate.mockResolvedValueOnce({ content: "General article text", finishReason: "stop" });
    mockGenerate.mockResolvedValueOnce({ content: "URL article text", finishReason: "stop" });

    const inputWithUrl: GenerationInput = { ...mockInput, websiteUrl: "https://leatherco.example.com" };
    const result = await runGenerationPipeline(inputWithUrl, null, () => {});

    expect(result.urlArticle).toBe("URL article text");
    expect(result.scrapedContent).toBe("Scraped website content here");
  });
});
