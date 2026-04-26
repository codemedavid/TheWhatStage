import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
vi.mock("@/lib/db/campaign-funnels", () => ({
  listFunnelsForCampaign: vi.fn(async () => [
    { id: "f0", campaignId: "c1", tenantId: "t1", position: 0, actionPageId: "p0", pageDescription: null, chatRules: ["r"], createdAt: "n", updatedAt: "n" },
  ]),
}));
vi.mock("@/lib/ai/funnel-runtime", () => ({
  getOrInitFunnelState: vi.fn(async () => ({
    funnel: { id: "f0", campaignId: "c1", tenantId: "t1", position: 0, actionPageId: "p0", pageDescription: null, chatRules: ["r"], createdAt: "n", updatedAt: "n" },
    position: 0,
    messageCount: 0,
  })),
  advanceFunnel: vi.fn(async () => ({
    funnel: { id: "f0", campaignId: "c1", tenantId: "t1", position: 0, actionPageId: "p0", pageDescription: null, chatRules: ["r"], createdAt: "n", updatedAt: "n" },
    position: 0, advanced: false, completed: true,
  })),
  incrementFunnelMessageCount: vi.fn(async () => undefined),
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

const mockParseDecision = vi.fn();
vi.mock("@/lib/ai/decision-parser", () => ({
  parseDecision: (...args: unknown[]) => mockParseDecision(...args),
}));

const mockSelectImages = vi.fn();
vi.mock("@/lib/ai/image-selector", () => ({
  selectImages: (...args: unknown[]) => mockSelectImages(...args),
}));

const mockParseResponse = vi.fn();
vi.mock("@/lib/ai/response-parser", () => ({
  parseResponse: (...args: unknown[]) => mockParseResponse(...args),
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

const mockSupabaseFrom = vi.fn();
const mockSupabaseRpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockSupabaseFrom,
    rpc: mockSupabaseRpc,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();

  mockRetrieveKnowledge.mockResolvedValue({
    status: "success",
    chunks: [],
    queryTarget: "general",
  });

  mockSupabaseFrom.mockImplementation((table: string) => {
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
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    }
    if (table === "campaigns") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                name: "Primary Offer",
                description: "A lead generation service.",
                goal: "form_submit",
                campaign_rules: [],
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "action_pages") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { title: "Page", type: "form" },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "escalation_events") {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    if (table === "knowledge_images") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
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
    return {};
  });

  mockSelectImages.mockResolvedValue([]);
  mockBuildSystemPrompt.mockResolvedValue("system prompt");
  mockGenerateResponse.mockResolvedValue({ content: '{"message":"Hi!","phase_action":"stay","confidence":0.9,"image_ids":[]}' });
  mockParseDecision.mockReturnValue({
    message: "Hi!",
    phaseAction: "stay",
    confidence: 0.9,
    imageIds: [],
  });
  mockParseResponse.mockReturnValue({
    cleanMessage: "Hi!",
    extractedImageIds: [],
  });
});

import { handleMessage } from "@/lib/ai/conversation-engine";

describe("handleMessage — image integration", () => {
  it("passes selected images to prompt builder", async () => {
    const selectedImages = [
      { id: "img-1", url: "https://img1.jpg", description: "Red shoe", contextHint: null, similarity: 0.85 },
    ];
    mockSelectImages.mockResolvedValueOnce(selectedImages);

    await handleMessage({
      tenantId: "t-1",
      leadId: "lead-1",
      businessName: "ShoeStore",
      conversationId: "conv-1",
      leadMessage: "show me shoes",
    });

    expect(mockBuildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [
          { id: "img-1", url: "https://img1.jpg", description: "Red shoe", context_hint: null },
        ],
      })
    );
  });

  it("merges image IDs from decision parser and response parser (deduplicated)", async () => {
    mockSelectImages.mockResolvedValueOnce([]);
    mockParseDecision.mockReturnValueOnce({
      message: "Check this [SEND_IMAGE:img-1]",
      phaseAction: "stay",
      confidence: 0.9,
      imageIds: ["img-1", "img-2"],
    });
    mockParseResponse.mockReturnValueOnce({
      cleanMessage: "Check this",
      extractedImageIds: ["img-1", "img-3"],
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
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
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
      if (table === "action_pages") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { title: "Page", type: "form" },
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
      if (table === "campaigns") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { name: "Offer", description: null, goal: "form_submit", campaign_rules: [] },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "escalation_events") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
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
      return {};
    });

    const result = await handleMessage({
      tenantId: "t-1",
      leadId: "lead-1",
      businessName: "ShoeStore",
      conversationId: "conv-1",
      leadMessage: "show me products",
    });

    expect(result.imageIds).toEqual(expect.arrayContaining(["img-1", "img-2", "img-3"]));
    expect(result.imageIds).toHaveLength(3);
  });

  it("uses cleaned message from response parser", async () => {
    mockParseDecision.mockReturnValueOnce({
      message: "Here you go [SEND_IMAGE:img-1]",
      phaseAction: "stay",
      confidence: 0.85,
      imageIds: ["img-1"],
    });
    mockParseResponse.mockReturnValueOnce({
      cleanMessage: "Here you go",
      extractedImageIds: ["img-1"],
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
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
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
      if (table === "action_pages") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { title: "Page", type: "form" },
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
                data: [{ id: "img-1", url: "https://img1.jpg" }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaigns") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { name: "Offer", description: null, goal: "form_submit", campaign_rules: [] },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "escalation_events") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
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
      return {};
    });

    const result = await handleMessage({
      tenantId: "t-1",
      leadId: "lead-1",
      businessName: "Test",
      conversationId: "conv-1",
      leadMessage: "products",
    });

    expect(result.message).toBe("Here you go");
  });

  it("filters out invalid image IDs not belonging to tenant", async () => {
    mockParseDecision.mockReturnValueOnce({
      message: "Look at this",
      phaseAction: "stay",
      confidence: 0.9,
      imageIds: ["img-valid", "img-fake"],
    });
    mockParseResponse.mockReturnValueOnce({
      cleanMessage: "Look at this",
      extractedImageIds: [],
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
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
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
      if (table === "action_pages") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { title: "Page", type: "form" },
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
                data: [{ id: "img-valid", url: "https://valid.jpg" }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaigns") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { name: "Offer", description: null, goal: "form_submit", campaign_rules: [] },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "escalation_events") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
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
      return {};
    });

    const result = await handleMessage({
      tenantId: "t-1",
      leadId: "lead-1",
      businessName: "Test",
      conversationId: "conv-1",
      leadMessage: "show me",
    });

    expect(result.imageIds).toEqual(["img-valid"]);
  });

  it("returns empty imageIds when no images are relevant", async () => {
    const result = await handleMessage({
      tenantId: "t-1",
      leadId: "lead-1",
      businessName: "Test",
      conversationId: "conv-1",
      leadMessage: "hello",
    });

    expect(result.imageIds).toEqual([]);
  });
});
