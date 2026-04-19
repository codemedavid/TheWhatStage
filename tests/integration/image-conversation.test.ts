import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockGetCurrentPhase = vi.fn();
const mockAdvancePhase = vi.fn();
const mockIncrementMessageCount = vi.fn();
vi.mock("@/lib/ai/phase-machine", () => ({
  getCurrentPhase: (...args: unknown[]) => mockGetCurrentPhase(...args),
  advancePhase: (...args: unknown[]) => mockAdvancePhase(...args),
  incrementMessageCount: (...args: unknown[]) => mockIncrementMessageCount(...args),
}));

const mockRetrieveKnowledge = vi.fn();
vi.mock("@/lib/ai/retriever", () => ({
  retrieveKnowledge: (...args: unknown[]) => mockRetrieveKnowledge(...args),
}));

const mockBuildSystemPrompt = vi.fn();
vi.mock("@/lib/ai/prompt-builder", () => ({
  buildSystemPrompt: (...args: unknown[]) => mockBuildSystemPrompt(...args),
}));

const mockGenerateResponse = vi.fn();
vi.mock("@/lib/ai/llm-client", () => ({
  generateResponse: (...args: unknown[]) => mockGenerateResponse(...args),
}));

const mockSelectImages = vi.fn();
vi.mock("@/lib/ai/image-selector", () => ({
  selectImages: (...args: unknown[]) => mockSelectImages(...args),
}));

const mockSupabaseFrom = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockSupabaseFrom,
  })),
}));

vi.mock("@/lib/ai/campaign-assignment", () => ({
  getOrAssignCampaign: vi.fn().mockResolvedValue("campaign-id-1"),
}));

beforeEach(() => {
  vi.clearAllMocks();

  mockGetCurrentPhase.mockResolvedValue({
    conversationPhaseId: "cp-1",
    phaseId: "p-1",
    name: "Product Discovery",
    orderIndex: 1,
    maxMessages: 10,
    systemPrompt: "Help the user find products",
    tone: "helpful",
    goals: "Qualify interest",
    transitionHint: null,
    actionButtonIds: null,
    messageCount: 3,
  });

  mockRetrieveKnowledge.mockResolvedValue({
    status: "success",
    chunks: [
      { id: "chunk-1", content: "We have red and blue running shoes.", similarity: 0.82, metadata: { image_tags: ["shoes"] } },
    ],
    queryTarget: "product",
  });

  mockIncrementMessageCount.mockResolvedValue(undefined);
});

import { handleMessage } from "@/lib/ai/conversation-engine";

describe("Full conversation with images", () => {
  it("lead asks about product -> images selected -> LLM references images -> images validated in output", async () => {
    // Image selector finds relevant product images
    mockSelectImages.mockResolvedValueOnce([
      { id: "img-red", url: "https://cdn/red-shoe.jpg", description: "Red running shoe", contextHint: "footwear queries", similarity: 0.88 },
      { id: "img-blue", url: "https://cdn/blue-shoe.jpg", description: "Blue running shoe", contextHint: "footwear queries", similarity: 0.79 },
    ]);

    // Prompt builder called with images
    mockBuildSystemPrompt.mockResolvedValueOnce("system prompt with images");

    // LLM responds with text + image IDs
    mockGenerateResponse.mockResolvedValueOnce({
      content: JSON.stringify({
        message: "We have great running shoes! Check these out:",
        phase_action: "stay",
        confidence: 0.92,
        image_ids: ["img-red", "img-blue"],
      }),
    });

    // Tenant config + gate check
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "conversations") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { bot_paused_at: null },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "tenants") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { max_images_per_response: 3 },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "knowledge_images") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: "img-red", url: "https://cdn/red-shoe.jpg" },
                  { id: "img-blue", url: "https://cdn/blue-shoe.jpg" },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const result = await handleMessage({
      tenantId: "t-1",
      leadId: "lead-1",
      businessName: "RunShop",
      conversationId: "conv-1",
      leadMessage: "Do you have running shoes?",
    });

    // Verify images were passed to prompt builder
    expect(mockBuildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        images: expect.arrayContaining([
          expect.objectContaining({ id: "img-red" }),
          expect.objectContaining({ id: "img-blue" }),
        ]),
      })
    );

    // Verify final output
    expect(result.message).toBe("We have great running shoes! Check these out:");
    expect(result.imageIds).toEqual(["img-red", "img-blue"]);
    expect(result.phaseAction).toBe("stay");
    expect(result.confidence).toBe(0.92);
    expect(result.escalated).toBe(false);
  });

  it("conversation with leaked SEND_IMAGE token gets cleaned", async () => {
    mockSelectImages.mockResolvedValueOnce([]);

    mockBuildSystemPrompt.mockResolvedValueOnce("system prompt");

    // LLM leaks a SEND_IMAGE token in its text
    mockGenerateResponse.mockResolvedValueOnce({
      content: JSON.stringify({
        message: "Here is our best product [SEND_IMAGE:img-leaked] for you!",
        phase_action: "stay",
        confidence: 0.85,
        image_ids: ["img-leaked"],
      }),
    });

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "conversations") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { bot_paused_at: null },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "tenants") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { max_images_per_response: 2 },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "knowledge_images") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: "img-leaked", url: "https://cdn/product.jpg" }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const result = await handleMessage({
      tenantId: "t-1",
      leadId: "lead-1",
      businessName: "Shop",
      conversationId: "conv-1",
      leadMessage: "what do you recommend?",
    });

    // Token should be stripped from message
    expect(result.message).not.toContain("[SEND_IMAGE");
    expect(result.message).toBe("Here is our best product for you!");

    // Image ID should still be in the output
    expect(result.imageIds).toEqual(["img-leaked"]);
  });
});
