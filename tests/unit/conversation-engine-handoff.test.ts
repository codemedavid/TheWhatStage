import { describe, it, expect, vi, beforeEach } from "vitest";

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

// Track all supabase calls
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });

let conversationSelectData: Record<string, unknown> | null = null;
let tenantSelectData: Record<string, unknown> | null = null;

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "conversations") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: conversationSelectData,
                error: null,
              }),
            }),
          }),
          update: mockUpdate,
        };
      }
      if (table === "tenants") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: tenantSelectData,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "escalation_events") {
        return {
          insert: mockInsert,
        };
      }
      if (table === "campaigns") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { name: "Test Campaign", description: null, goal: "form_submit", campaign_rules: [] },
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
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
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
      return {
        update: mockUpdate,
        insert: mockInsert,
      };
    }),
  })),
}));

import { getOrInitFunnelState } from "@/lib/ai/funnel-runtime";
import { incrementFunnelMessageCount } from "@/lib/ai/funnel-runtime";
import { retrieveKnowledge } from "@/lib/ai/retriever";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import { generateResponse } from "@/lib/ai/llm-client";
import { parseDecision } from "@/lib/ai/decision-parser";
import { selectImages } from "@/lib/ai/image-selector";
import { parseResponse } from "@/lib/ai/response-parser";
import { handleMessage } from "@/lib/ai/conversation-engine";

const mockGetOrInitFunnelState = vi.mocked(getOrInitFunnelState);
const mockIncrementFunnelMessageCount = vi.mocked(incrementFunnelMessageCount);
const mockRetrieveKnowledge = vi.mocked(retrieveKnowledge);
const mockBuildSystemPrompt = vi.mocked(buildSystemPrompt);
const mockGenerateResponse = vi.mocked(generateResponse);
const mockParseDecision = vi.mocked(parseDecision);
const mockSelectImages = vi.mocked(selectImages);
const mockParseResponse = vi.mocked(parseResponse);

const defaultFunnel = {
  id: "f0", campaignId: "c1", tenantId: "t1", position: 0,
  actionPageId: "p0", pageDescription: null, chatRules: ["r"],
  createdAt: "n", updatedAt: "n",
};

const defaultInput = {
  tenantId: "tenant-1",
  leadId: "lead-1",
  businessName: "Acme Corp",
  conversationId: "conv-1",
  leadMessage: "Hello, I need help",
};

function setupNormalPipeline() {
  mockGetOrInitFunnelState.mockResolvedValue({ funnel: defaultFunnel, position: 0, messageCount: 0 });
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
    actionButtonId: null,
    ctaText: null,
  });
  mockSelectImages.mockResolvedValue([]);
  mockParseResponse.mockImplementation((msg: string) => ({
    cleanMessage: msg,
    extractedImageIds: [],
  }));
  mockIncrementFunnelMessageCount.mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  conversationSelectData = { bot_paused_at: null };
  tenantSelectData = { max_images_per_response: 2, handoff_timeout_hours: null, persona_tone: "friendly" };
  setupNormalPipeline();
});

describe("handleMessage — gate check (paused bot)", () => {
  it("returns paused=true and skips LLM when bot is paused and timeout is null (never resume)", async () => {
    conversationSelectData = { bot_paused_at: new Date().toISOString() };
    tenantSelectData = { handoff_timeout_hours: null, persona_tone: "friendly" };

    const result = await handleMessage(defaultInput);

    expect(result.paused).toBe(true);
    expect(result.message).toBe("");
    expect(mockGenerateResponse).not.toHaveBeenCalled();
    expect(mockGetOrInitFunnelState).not.toHaveBeenCalled();
  });

  it("returns paused=true when bot is paused and within timeout window", async () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    conversationSelectData = { bot_paused_at: thirtyMinAgo };
    tenantSelectData = { handoff_timeout_hours: 1, persona_tone: "friendly" };

    const result = await handleMessage(defaultInput);

    expect(result.paused).toBe(true);
    expect(result.message).toBe("");
    expect(mockGenerateResponse).not.toHaveBeenCalled();
    expect(mockGetOrInitFunnelState).not.toHaveBeenCalled();
  });

  it("auto-resumes when bot is paused and timeout has expired", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    conversationSelectData = { bot_paused_at: twoHoursAgo };
    tenantSelectData = { max_images_per_response: 2, handoff_timeout_hours: 1, persona_tone: "friendly" };

    const result = await handleMessage(defaultInput);

    expect(mockUpdate).toHaveBeenCalledWith({
      bot_paused_at: null,
      needs_human: false,
      escalation_reason: null,
      escalation_message_id: null,
    });

    expect(mockInsert).toHaveBeenCalledWith({
      conversation_id: "conv-1",
      tenant_id: "tenant-1",
      type: "bot_resumed",
      reason: "timeout",
    });

    expect(result.paused).toBe(false);
    expect(mockGetOrInitFunnelState).toHaveBeenCalled();
    expect(mockGenerateResponse).toHaveBeenCalled();
  });
});

describe("handleMessage — enriched escalation", () => {
  it("sets escalation_reason to 'llm_decision' and inserts escalated event", async () => {
    mockParseDecision.mockReturnValue({
      message: "I need a human agent",
      phaseAction: "escalate",
      confidence: 0.85,
      imageIds: [],
      actionButtonId: null,
      ctaText: null,
    });

    const result = await handleMessage({
      ...defaultInput,
      leadMessageId: "msg-42",
    });

    expect(result.escalated).toBe(true);
    expect(result.paused).toBe(false);

    expect(mockUpdate).toHaveBeenCalledWith({
      needs_human: true,
      escalation_reason: "llm_decision",
      escalation_message_id: "msg-42",
    });

    expect(mockInsert).toHaveBeenCalledWith({
      conversation_id: "conv-1",
      tenant_id: "tenant-1",
      type: "escalated",
      reason: "llm_decision",
    });
  });

  it("sets escalation_reason to 'low_confidence' when confidence < 0.4", async () => {
    mockParseDecision.mockReturnValue({
      message: "Not sure about that",
      phaseAction: "escalate",
      confidence: 0.2,
      imageIds: [],
      actionButtonId: null,
      ctaText: null,
    });

    await handleMessage(defaultInput);

    expect(mockUpdate).toHaveBeenCalledWith({
      needs_human: true,
      escalation_reason: "low_confidence",
      escalation_message_id: null,
    });

    expect(mockInsert).toHaveBeenCalledWith({
      conversation_id: "conv-1",
      tenant_id: "tenant-1",
      type: "escalated",
      reason: "low_confidence",
    });
  });

  it("sets escalation_reason to 'empty_response' when message is empty", async () => {
    mockParseDecision.mockReturnValue({
      message: "",
      phaseAction: "escalate",
      confidence: 0.85,
      imageIds: [],
      actionButtonId: null,
      ctaText: null,
    });
    mockParseResponse.mockReturnValue({
      cleanMessage: "",
      extractedImageIds: [],
    });

    await handleMessage(defaultInput);

    expect(mockUpdate).toHaveBeenCalledWith({
      needs_human: true,
      escalation_reason: "empty_response",
      escalation_message_id: null,
    });

    expect(mockInsert).toHaveBeenCalledWith({
      conversation_id: "conv-1",
      tenant_id: "tenant-1",
      type: "escalated",
      reason: "empty_response",
    });
  });

  it("sets escalation_message_id to null when leadMessageId is not provided", async () => {
    mockParseDecision.mockReturnValue({
      message: "Need help",
      phaseAction: "escalate",
      confidence: 0.85,
      imageIds: [],
      actionButtonId: null,
      ctaText: null,
    });

    await handleMessage(defaultInput);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        escalation_message_id: null,
      })
    );
  });
});
