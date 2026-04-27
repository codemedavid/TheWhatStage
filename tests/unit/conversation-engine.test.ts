import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/campaign-funnels", () => ({
  listFunnelsForCampaign: vi.fn(async () => [
    { id: "f0", campaignId: "c1", tenantId: "t1", position: 0, actionPageId: "p0", pageDescription: null, pitch: null, qualificationQuestions: [], chatRules: ["r"], createdAt: "n", updatedAt: "n" },
  ]),
}));
vi.mock("@/lib/ai/funnel-runtime", () => ({
  getOrInitFunnelState: vi.fn(async () => ({
    funnel: { id: "f0", campaignId: "c1", tenantId: "t1", position: 0, actionPageId: "p0", pageDescription: null, pitch: null, qualificationQuestions: [], chatRules: ["r"], createdAt: "n", updatedAt: "n" },
    position: 0,
    messageCount: 0,
    buttonSentAtCount: null,
  })),
  advanceFunnel: vi.fn(async () => ({
    funnel: { id: "f0", campaignId: "c1", tenantId: "t1", position: 0, actionPageId: "p0", pageDescription: null, pitch: null, qualificationQuestions: [], chatRules: ["r"], createdAt: "n", updatedAt: "n" },
    position: 0, advanced: false, completed: true,
  })),
  incrementFunnelMessageCount: vi.fn(async () => undefined),
  markFunnelButtonSent: vi.fn(async () => undefined),
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

vi.mock("@/lib/ai/campaign-assignment", () => ({
  getOrAssignCampaign: vi.fn().mockResolvedValue("campaign-id-1"),
}));

vi.mock("@/lib/leads/knowledge-extractor", () => ({
  extractKnowledge: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/leads/summary-generator", () => ({
  generateLeadSummary: vi.fn().mockResolvedValue(undefined),
}));

const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
});
const mockInsert = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "conversations") {
        const selectChain = {
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { bot_paused_at: null },
            error: null,
          }),
          single: vi.fn().mockResolvedValue({
            data: { bot_paused_at: null },
            error: null,
          }),
        };
        return {
          select: vi.fn().mockReturnValue(selectChain),
          update: mockUpdate,
        };
      }
      if (table === "tenants") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { max_images_per_response: 2, persona_tone: "friendly" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaigns") {
        const selectChain = {
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              name: "Primary Offer",
              description: "A lead generation service for local businesses.",
              goal: "form_submit",
              campaign_rules: [],
            },
            error: null,
          }),
          single: vi.fn().mockResolvedValue({
            data: {
              name: "Primary Offer",
              description: "A lead generation service for local businesses.",
              goal: "form_submit",
              campaign_rules: [],
            },
            error: null,
          }),
        };
        return {
          select: vi.fn().mockReturnValue(selectChain),
        };
      }
      if (table === "action_pages") {
        const selectChain = {
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { title: "Page", type: "form" },
            error: null,
          }),
          single: vi.fn().mockResolvedValue({
            data: { title: "Page", type: "form" },
            error: null,
          }),
        };
        return {
          select: vi.fn().mockReturnValue(selectChain),
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
      if (table === "escalation_events") {
        return {
          insert: mockInsert,
        };
      }
      if (table === "messages") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              neq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
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

import { listFunnelsForCampaign } from "@/lib/db/campaign-funnels";
import { getOrInitFunnelState, advanceFunnel, incrementFunnelMessageCount } from "@/lib/ai/funnel-runtime";
import { retrieveKnowledge } from "@/lib/ai/retriever";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import { generateResponse } from "@/lib/ai/llm-client";
import { parseDecision } from "@/lib/ai/decision-parser";
import type { LLMDecision } from "@/lib/ai/decision-parser";
import { selectImages } from "@/lib/ai/image-selector";
import { parseResponse } from "@/lib/ai/response-parser";
import { createServiceClient } from "@/lib/supabase/service";
import { handleMessage } from "@/lib/ai/conversation-engine";

const mockListFunnelsForCampaign = vi.mocked(listFunnelsForCampaign);
const mockGetOrInitFunnelState = vi.mocked(getOrInitFunnelState);
const mockAdvanceFunnel = vi.mocked(advanceFunnel);
const mockIncrementFunnelMessageCount = vi.mocked(incrementFunnelMessageCount);
const mockRetrieveKnowledge = vi.mocked(retrieveKnowledge);
const mockBuildSystemPrompt = vi.mocked(buildSystemPrompt);
const mockGenerateResponse = vi.mocked(generateResponse);
const mockParseDecision = vi.mocked(parseDecision);
const mockSelectImages = vi.mocked(selectImages);
const mockParseResponse = vi.mocked(parseResponse);

function mockDecision(overrides: Partial<LLMDecision>) {
  mockParseDecision.mockReturnValue({
    message: "Hello!",
    phaseAction: "stay",
    confidence: 0.85,
    imageIds: [],
    actionButtonId: null,
    ctaText: null,
    buttonConfidence: null,
    buttonLabel: null,
    ...overrides,
  });
}

const defaultFunnel = {
  id: "f0", campaignId: "c1", tenantId: "t1", position: 0,
  actionPageId: "p0", pageDescription: null, pitch: null, qualificationQuestions: [], chatRules: ["r"],
  createdAt: "n", updatedAt: "n",
};

const defaultInput = {
  tenantId: "tenant-1",
  leadId: "lead-1",
  businessName: "Acme Corp",
  conversationId: "conv-1",
  leadMessage: "Hello, I need help",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListFunnelsForCampaign.mockResolvedValue([defaultFunnel]);
  mockGetOrInitFunnelState.mockResolvedValue({ funnel: defaultFunnel, position: 0, messageCount: 0, buttonSentAtCount: null });
  mockAdvanceFunnel.mockResolvedValue({ funnel: defaultFunnel, position: 0, advanced: false, completed: true });
  mockIncrementFunnelMessageCount.mockResolvedValue(undefined);
  mockRetrieveKnowledge.mockResolvedValue({
    status: "success",
    chunks: [{ id: "c1", content: "Info", similarity: 0.8, metadata: {} }],
    queryTarget: "general",
    retrievalPass: 1,
  });
  mockBuildSystemPrompt.mockResolvedValue("system prompt");
  mockGenerateResponse.mockResolvedValue({
    content: '{"message":"Hello!","phase_action":"stay","confidence":0.85,"image_ids":[]}',
    finishReason: "stop",
  });
  mockDecision({
    message: "Hello!",
    phaseAction: "stay",
    confidence: 0.85,
    imageIds: [],
    actionButtonId: null,
    ctaText: null,
  });
  mockSelectImages.mockResolvedValue([]);
  mockParseResponse.mockImplementation((msg: string) => ({
    cleanMessage: msg,
    extractedImageIds: [],
  }));
});

describe("handleMessage", () => {
  it("runs the full pipeline and returns correct output, calling all dependencies", async () => {
    const result = await handleMessage(defaultInput);

    expect(mockGetOrInitFunnelState).toHaveBeenCalledWith(
      expect.anything(), "conv-1", "campaign-id-1", [defaultFunnel]
    );
    expect(mockRetrieveKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Hello, I need help",
        tenantId: "tenant-1",
        context: expect.objectContaining({
          businessName: "Acme Corp",
          campaign: expect.objectContaining({
            name: "Primary Offer",
            goal: "form_submit",
          }),
        }),
      })
    );
    expect(mockBuildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        businessName: "Acme Corp",
        step: expect.objectContaining({ name: "Step 1 of 1 — Page" }),
        conversationId: "conv-1",
        ragChunks: [{ id: "c1", content: "Info", similarity: 0.8, metadata: {} }],
        campaign: expect.objectContaining({
          name: "Primary Offer",
          goal: "form_submit",
        }),
      })
    );
    expect(mockGenerateResponse).toHaveBeenCalledWith("system prompt", "Hello, I need help");
    expect(mockParseDecision).toHaveBeenCalledWith(
      '{"message":"Hello!","phase_action":"stay","confidence":0.85,"image_ids":[]}'
    );
    expect(mockIncrementFunnelMessageCount).not.toHaveBeenCalled();

    expect(result).toMatchObject({
      message: "Hello!",
      phaseAction: "stay",
      confidence: 0.85,
      imageIds: [],
      currentPhase: "Step 1 of 1 — Page",
      escalated: false,
      paused: false,
    });
  });

  it("passes assigned campaign context into retrieval and prompt building", async () => {
    await handleMessage({
      ...defaultInput,
      leadMessage: "Interested",
    });

    expect(mockRetrieveKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Interested",
        tenantId: "tenant-1",
        context: expect.objectContaining({
          businessName: "Acme Corp",
          campaign: expect.objectContaining({
            name: "Primary Offer",
            goal: "form_submit",
          }),
        }),
      })
    );

    expect(mockBuildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        campaign: expect.objectContaining({
          name: "Primary Offer",
          goal: "form_submit",
        }),
      })
    );
  });

  it("calls advanceFunnel when phaseAction is 'advance'", async () => {
    mockDecision({
      message: "Let's move on!",
      phaseAction: "advance",
      confidence: 0.9,
      imageIds: [],
      actionButtonId: null,
      ctaText: null,
    });
    mockAdvanceFunnel.mockResolvedValue({ funnel: defaultFunnel, position: 1, advanced: true, completed: false });

    const result = await handleMessage(defaultInput);

    expect(mockAdvanceFunnel).toHaveBeenCalledWith(expect.anything(), "conv-1", [defaultFunnel]);
    expect(result.phaseAction).toBe("advance");
    expect(result.escalated).toBe(false);
    expect(result.completedFunnel).toBe(false);
  });

  it("sets escalated=true and flags conversation when phaseAction is 'escalate'", async () => {
    mockDecision({
      message: "I need a human agent",
      phaseAction: "escalate",
      confidence: 0.85,
      imageIds: [],
      actionButtonId: null,
      ctaText: null,
    });

    const result = await handleMessage(defaultInput);

    expect(mockAdvanceFunnel).not.toHaveBeenCalled();
    expect(result.escalated).toBe(true);
    expect(result.phaseAction).toBe("escalate");
    expect(mockUpdate).toHaveBeenCalledWith({
      needs_human: true,
      escalation_reason: "llm_decision",
      escalation_message_id: null,
    });
  });

  it("uses the parsed response verbatim when confidence is between 0.4 and 0.7", async () => {
    mockDecision({
      message: "You can find that on our website.",
      phaseAction: "stay",
      confidence: 0.55,
      imageIds: [],
      actionButtonId: null,
      ctaText: null,
    });

    const result = await handleMessage(defaultInput);

    expect(result.message).toBe("You can find that on our website.");
  });

  it("does not prepend a hedging phrase when confidence is >= 0.7", async () => {
    mockDecision({
      message: "Sure, I can help you!",
      phaseAction: "stay",
      confidence: 0.75,
      imageIds: [],
      actionButtonId: null,
      ctaText: null,
    });

    const result = await handleMessage(defaultInput);

    expect(result.message).toBe("Sure, I can help you!");
  });

  it("does not prepend a hedging phrase when confidence is < 0.4 (escalation path)", async () => {
    mockDecision({
      message: "Not sure at all.",
      phaseAction: "escalate",
      confidence: 0.2,
      imageIds: [],
      actionButtonId: null,
      ctaText: null,
    });

    const result = await handleMessage(defaultInput);

    expect(result.message).toBe("Not sure at all.");
  });

  it("passes image IDs from the decision through to the output", async () => {
    mockDecision({
      message: "Check out these images!",
      phaseAction: "stay",
      confidence: 0.9,
      imageIds: ["img-1", "img-2", "img-3"],
      actionButtonId: null,
      ctaText: null,
    });

    vi.mocked(createServiceClient).mockReturnValueOnce({
      from: vi.fn((table: string) => {
        if (table === "conversations") {
          const selectChain = {
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { bot_paused_at: null },
              error: null,
            }),
            single: vi.fn().mockResolvedValue({
              data: { bot_paused_at: null },
              error: null,
            }),
          };
          return {
            select: vi.fn().mockReturnValue(selectChain),
            update: mockUpdate,
          };
        }
        if (table === "tenants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { max_images_per_response: 3, persona_tone: "friendly" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "campaigns") {
          const selectChain = {
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                name: "Primary Offer",
                description: "A lead generation service for local businesses.",
                goal: "form_submit",
                campaign_rules: [],
              },
              error: null,
            }),
            single: vi.fn().mockResolvedValue({
              data: {
                name: "Primary Offer",
                description: "A lead generation service for local businesses.",
                goal: "form_submit",
                campaign_rules: [],
              },
              error: null,
            }),
          };
          return {
            select: vi.fn().mockReturnValue(selectChain),
          };
        }
        if (table === "action_pages") {
          const selectChain = {
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { title: "Page", type: "form" },
              error: null,
            }),
            single: vi.fn().mockResolvedValue({
              data: { title: "Page", type: "form" },
              error: null,
            }),
          };
          return {
            select: vi.fn().mockReturnValue(selectChain),
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
        if (table === "escalation_events") {
          return { insert: mockInsert };
        }
        if (table === "messages") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return { update: mockUpdate };
      }),
      rpc: vi.fn(),
    } as unknown as ReturnType<typeof createServiceClient>);

    const result = await handleMessage(defaultInput);

    expect(result.imageIds).toEqual(["img-1", "img-2", "img-3"]);
  });

  it("uses the parsed response verbatim at exactly 0.4 confidence", async () => {
    mockDecision({
      message: "The price is $25.",
      phaseAction: "stay",
      confidence: 0.4,
      imageIds: [],
      actionButtonId: null,
      ctaText: null,
    });

    const result = await handleMessage(defaultInput);
    expect(result.message).toBe("The price is $25.");
  });

  it("does not hedge at exactly 0.7 confidence", async () => {
    mockDecision({
      message: "The price is $25.",
      phaseAction: "stay",
      confidence: 0.7,
      imageIds: [],
      actionButtonId: null,
      ctaText: null,
    });

    const result = await handleMessage(defaultInput);
    expect(result.message).toBe("The price is $25.");
  });

  it("includes actionButton in output when decision has valid action_button_id", async () => {
    mockDecision({
      message: "Check this out!",
      phaseAction: "stay",
      confidence: 0.9,
      imageIds: [],
      actionButtonId: "p0",
      ctaText: "Book your spot now!",
    });

    const result = await handleMessage(defaultInput);

    expect(result.actionButton).toEqual({
      actionPageId: "p0",
      ctaText: "Book your spot now!",
      label: null,
    });
  });

  it("returns no actionButton when decision has no action_button_id", async () => {
    mockDecision({
      message: "Hello!",
      phaseAction: "stay",
      confidence: 0.85,
      imageIds: [],
      actionButtonId: null,
      ctaText: null,
    });

    const result = await handleMessage(defaultInput);

    expect(result.actionButton).toBeUndefined();
  });

  it("substitutes the single allowed action button when the LLM emits a non-UUID action id", async () => {
    mockDecision({
      message: "Check this!",
      phaseAction: "stay",
      confidence: 0.9,
      imageIds: [],
      actionButtonId: "ap-invalid",
      ctaText: null,
    });

    const result = await handleMessage(defaultInput);

    expect(result.actionButton).toEqual({
      actionPageId: "p0",
      ctaText: "",
      label: null,
    });
  });

  it("uses empty string ctaText when AI provides actionButtonId but no ctaText", async () => {
    mockDecision({
      message: "Here you go!",
      phaseAction: "stay",
      confidence: 0.9,
      imageIds: [],
      actionButtonId: "p0",
      ctaText: null,
    });

    const result = await handleMessage(defaultInput);

    expect(result.actionButton).toEqual({
      actionPageId: "p0",
      ctaText: "",
      label: null,
    });
  });

  it("returns completedFunnel=true when advancing the last funnel step", async () => {
    mockDecision({
      message: "All done!",
      phaseAction: "advance",
      confidence: 0.9,
      imageIds: [],
      actionButtonId: null,
      ctaText: null,
    });
    mockAdvanceFunnel.mockResolvedValue({ funnel: defaultFunnel, position: 0, advanced: false, completed: true });

    const result = await handleMessage(defaultInput);

    expect(result.completedFunnel).toBe(true);
  });
});
