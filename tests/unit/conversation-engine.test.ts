import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/phase-machine", () => ({
  getCurrentPhase: vi.fn(),
  advancePhase: vi.fn(),
  incrementMessageCount: vi.fn(),
}));

vi.mock("@/lib/ai/retriever", () => ({
  retrieveKnowledge: vi.fn(),
}));

vi.mock("@/lib/ai/prompt-builder", () => ({
  buildSystemPrompt: vi.fn(),
}));

vi.mock("@/lib/ai/llm-client", () => ({
  generateResponse: vi.fn(),
}));

vi.mock("@/lib/ai/decision-parser", () => ({
  parseDecision: vi.fn(),
}));

vi.mock("@/lib/ai/image-selector", () => ({
  selectImages: vi.fn(),
}));

vi.mock("@/lib/ai/response-parser", () => ({
  parseResponse: vi.fn(),
}));

const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
});
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
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
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      return {
        update: mockUpdate,
      };
    }),
  })),
}));

import { getCurrentPhase, advancePhase, incrementMessageCount } from "@/lib/ai/phase-machine";
import { retrieveKnowledge } from "@/lib/ai/retriever";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import { generateResponse } from "@/lib/ai/llm-client";
import { parseDecision } from "@/lib/ai/decision-parser";
import { selectImages } from "@/lib/ai/image-selector";
import { parseResponse } from "@/lib/ai/response-parser";
import { createServiceClient } from "@/lib/supabase/service";
import { handleMessage } from "@/lib/ai/conversation-engine";

const mockGetCurrentPhase = vi.mocked(getCurrentPhase);
const mockAdvancePhase = vi.mocked(advancePhase);
const mockIncrementMessageCount = vi.mocked(incrementMessageCount);
const mockRetrieveKnowledge = vi.mocked(retrieveKnowledge);
const mockBuildSystemPrompt = vi.mocked(buildSystemPrompt);
const mockGenerateResponse = vi.mocked(generateResponse);
const mockParseDecision = vi.mocked(parseDecision);
const mockSelectImages = vi.mocked(selectImages);
const mockParseResponse = vi.mocked(parseResponse);

const defaultPhase = {
  conversationPhaseId: "cp-1",
  phaseId: "phase-1",
  name: "Greet",
  orderIndex: 0,
  maxMessages: 1,
  systemPrompt: "Welcome the lead.",
  tone: "friendly",
  goals: "Open conversation",
  transitionHint: "Advance when lead responds",
  actionButtonIds: null,
  messageCount: 0,
};

const defaultInput = {
  tenantId: "tenant-1",
  businessName: "Acme Corp",
  conversationId: "conv-1",
  leadMessage: "Hello, I need help",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentPhase.mockResolvedValue(defaultPhase);
  mockRetrieveKnowledge.mockResolvedValue({
    status: "success",
    chunks: [{ id: "c1", content: "Info", similarity: 0.8, metadata: {} }],
    queryTarget: "general",
  });
  mockBuildSystemPrompt.mockResolvedValue("system prompt");
  mockGenerateResponse.mockResolvedValue({
    content: '{"message":"Hello!","phase_action":"stay","confidence":0.85,"image_ids":[]}',
    finishReason: "stop",
  });
  mockParseDecision.mockReturnValue({
    message: "Hello!",
    phaseAction: "stay",
    confidence: 0.85,
    imageIds: [],
  });
  // New mocks for image-selector and response-parser
  mockSelectImages.mockResolvedValue([]);
  // parseResponse passes through decision.message as cleanMessage by default
  mockParseResponse.mockImplementation((msg: string) => ({
    cleanMessage: msg,
    extractedImageIds: [],
  }));
  mockIncrementMessageCount.mockResolvedValue(undefined);
});

describe("handleMessage", () => {
  it("runs the full pipeline and returns correct output, calling all dependencies", async () => {
    const result = await handleMessage(defaultInput);

    // All pipeline steps called
    expect(mockGetCurrentPhase).toHaveBeenCalledWith("conv-1", "tenant-1");
    expect(mockRetrieveKnowledge).toHaveBeenCalledWith({
      query: "Hello, I need help",
      tenantId: "tenant-1",
    });
    expect(mockBuildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        businessName: "Acme Corp",
        currentPhase: defaultPhase,
        conversationId: "conv-1",
        ragChunks: [{ id: "c1", content: "Info", similarity: 0.8, metadata: {} }],
      })
    );
    expect(mockGenerateResponse).toHaveBeenCalledWith("system prompt", "Hello, I need help");
    expect(mockParseDecision).toHaveBeenCalledWith(
      '{"message":"Hello!","phase_action":"stay","confidence":0.85,"image_ids":[]}'
    );
    expect(mockIncrementMessageCount).toHaveBeenCalledWith("cp-1");

    // Output shape
    expect(result).toMatchObject({
      message: "Hello!",
      phaseAction: "stay",
      confidence: 0.85,
      imageIds: [],
      currentPhase: "Greet",
      escalated: false,
    });
  });

  it("calls advancePhase when phaseAction is 'advance'", async () => {
    mockParseDecision.mockReturnValue({
      message: "Let's move on!",
      phaseAction: "advance",
      confidence: 0.9,
      imageIds: [],
    });
    mockAdvancePhase.mockResolvedValue({ ...defaultPhase, name: "Qualify", orderIndex: 1, conversationPhaseId: "cp-2" });

    const result = await handleMessage(defaultInput);

    expect(mockAdvancePhase).toHaveBeenCalledWith("conv-1", "tenant-1");
    expect(result.phaseAction).toBe("advance");
    expect(result.escalated).toBe(false);
  });

  it("sets escalated=true and flags conversation when phaseAction is 'escalate'", async () => {
    mockParseDecision.mockReturnValue({
      message: "I need a human agent",
      phaseAction: "escalate",
      confidence: 0.85,
      imageIds: [],
    });

    const result = await handleMessage(defaultInput);

    expect(mockAdvancePhase).not.toHaveBeenCalled();
    expect(result.escalated).toBe(true);
    expect(result.phaseAction).toBe("escalate");
    // Supabase update should have been called
    expect(mockUpdate).toHaveBeenCalledWith({ needs_human: true });
  });

  it("prepends a hedging phrase when confidence is between 0.4 and 0.7", async () => {
    mockParseDecision.mockReturnValue({
      message: "You can find that on our website.",
      phaseAction: "stay",
      confidence: 0.55,
      imageIds: [],
    });

    const result = await handleMessage(defaultInput);

    expect(result.message).not.toBe("You can find that on our website.");
    expect(result.message.length).toBeGreaterThan("You can find that on our website.".length);
    // Should start with a hedging phrase (message first letter lowercased after prepend)
    const hedgingPhrases = [
      "I believe",
      "If I'm not mistaken,",
      "From what I understand,",
      "I think",
      "As far as I know,",
    ];
    const startsWithHedge = hedgingPhrases.some((phrase) =>
      result.message.startsWith(phrase)
    );
    expect(startsWithHedge).toBe(true);
  });

  it("does not prepend a hedging phrase when confidence is >= 0.7", async () => {
    mockParseDecision.mockReturnValue({
      message: "Sure, I can help you!",
      phaseAction: "stay",
      confidence: 0.75,
      imageIds: [],
    });

    const result = await handleMessage(defaultInput);

    expect(result.message).toBe("Sure, I can help you!");
  });

  it("does not prepend a hedging phrase when confidence is < 0.4 (escalation path)", async () => {
    mockParseDecision.mockReturnValue({
      message: "Not sure at all.",
      phaseAction: "escalate",
      confidence: 0.2,
      imageIds: [],
    });

    const result = await handleMessage(defaultInput);

    expect(result.message).toBe("Not sure at all.");
  });

  it("passes image IDs from the decision through to the output", async () => {
    mockParseDecision.mockReturnValue({
      message: "Check out these images!",
      phaseAction: "stay",
      confidence: 0.9,
      imageIds: ["img-1", "img-2", "img-3"],
    });

    // Override supabase to validate these image IDs for this test
    vi.mocked(createServiceClient).mockReturnValueOnce({
      from: vi.fn((table: string) => {
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
                    { id: "img-1", url: "https://img1.jpg" },
                    { id: "img-2", url: "https://img2.jpg" },
                    { id: "img-3", url: "https://img3.jpg" },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        return { update: mockUpdate };
      }),
      rpc: vi.fn(),
    } as ReturnType<typeof createServiceClient>);

    const result = await handleMessage(defaultInput);

    expect(result.imageIds).toEqual(["img-1", "img-2", "img-3"]);
  });

  it("hedges at exactly 0.4 confidence", async () => {
    mockParseDecision.mockReturnValue({
      message: "The price is $25.",
      phaseAction: "stay",
      confidence: 0.4,
      imageIds: [],
    });

    const result = await handleMessage(defaultInput);
    expect(result.message).not.toBe("The price is $25.");
    expect(result.message).toContain("the price is $25.");
  });

  it("does not hedge at exactly 0.7 confidence", async () => {
    mockParseDecision.mockReturnValue({
      message: "The price is $25.",
      phaseAction: "stay",
      confidence: 0.7,
      imageIds: [],
    });

    const result = await handleMessage(defaultInput);
    expect(result.message).toBe("The price is $25.");
  });
});
