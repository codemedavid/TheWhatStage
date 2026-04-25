import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleMessage } from "@/lib/ai/conversation-engine";

// ---------------------------------------------------------------------------
// Globals: fetch + Supabase + HuggingFace SDK
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    rpc: mockRpc,
    from: mockFrom,
  })),
}));

const mockFeatureExtraction = vi.fn();
vi.mock("@huggingface/inference", () => ({
  InferenceClient: vi.fn().mockImplementation(() => ({
    featureExtraction: mockFeatureExtraction,
  })),
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

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

// BAAI/bge-large-en-v1.5 returns 1024-dim vectors directly.
const fakeEmbedding = Array.from({ length: 1024 }, (_, i) => Math.sin(i) * 0.01);

const phaseRow = {
  id: "cp-1",
  phase_id: "phase-1",
  message_count: 0,
  campaign_phases: {
    id: "phase-1",
    name: "Greet",
    order_index: 0,
    max_messages: 1,
    system_prompt: "Welcome the lead.",
    tone: "friendly",
    goals: "Open conversation",
    transition_hint: "Advance when lead responds",
    action_button_ids: null,
  },
};

const engineInput = {
  tenantId: "tenant-1",
  leadId: "lead-1",
  businessName: "Acme Corp",
  conversationId: "conv-1",
  leadMessage: "Hello there",
};

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Mock: conversations SELECT (gate check — bot_paused_at)
 * Chain: .from().select().eq().single()
 * Called first in handleMessage before any other logic.
 */
function mockConversationGateCheck(botPausedAt: string | null = null) {
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { bot_paused_at: botPausedAt },
          error: null,
        }),
      }),
    }),
  });
}

/**
 * Mock: conversation_phases SELECT (getCurrentPhase)
 * Chain: .from().select().eq().is().order().limit().single()
 */
function mockGetCurrentPhase(data: typeof phaseRow) {
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data, error: null }),
            }),
          }),
        }),
      }),
    }),
  });
}

/**
 * Mock: tenants SELECT (fetch max_images_per_response)
 * Chain: .from().select().eq().single()
 */
function mockTenantConfig(maxImages = 2) {
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { max_images_per_response: maxImages },
          error: null,
        }),
      }),
    }),
  });
}

/**
 * Mock: knowledge_images tag filter SELECT (selectImages — step 1: tag filter)
 * Chain: .from().select().eq().overlaps()
 * Returns no candidates so selectImages bails early.
 */
function mockImageTagFilter(data: unknown[] = []) {
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        overlaps: vi.fn().mockResolvedValue({ data, error: null }),
      }),
    }),
  });
}

/**
 * Mock: bot_rules SELECT
 * Chain: .from().select().eq().eq()
 */
function mockBotRules(data: unknown[] = []) {
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data, error: null }),
      }),
    }),
  });
}

/**
 * Mock: messages SELECT
 * Chain: .from().select().eq().order().limit()
 */
function mockMessages(data: unknown[] = []) {
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data, error: null }),
        }),
      }),
    }),
  });
}

/**
 * Mock: tenants SELECT (buildSystemPrompt — fetch persona_tone + custom_instructions)
 * Chain: .from().select().eq().single()
 */
function mockTenantPersona() {
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { persona_tone: "friendly", custom_instructions: null },
          error: null,
        }),
      }),
    }),
  });
}

/**
 * Mock: campaigns SELECT (fetch campaign context)
 * Chain: .from().select().eq().single()
 */
function mockCampaignData(
  data: unknown = { name: "Test Campaign", description: null, goal: "form_submit", campaign_rules: [] }
) {
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data, error: null }),
      }),
    }),
  });
}

/**
 * Mock: messages SELECT (idle gap check)
 * Chain: .from().select().eq().neq().order().limit().maybeSingle()
 */
function mockMessagesIdleCheck(data: unknown = null) {
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        neq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
            }),
          }),
        }),
      }),
    }),
  });
}

/**
 * Mock: incrementMessageCount — read current count
 * Chain: .from().select().eq().single()
 */
function mockIncrementRead(count = 0) {
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { message_count: count },
          error: null,
        }),
      }),
    }),
  });
}

/**
 * Mock: incrementMessageCount — write updated count
 * Chain: .from().update().eq()
 */
function mockIncrementWrite() {
  mockFrom.mockReturnValueOnce({
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  });
}

/**
 * Mock: conversations UPDATE (escalate — set needs_human = true)
 * Chain: .from().update().eq()
 */
function mockConversationEscalate() {
  mockFrom.mockReturnValueOnce({
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  });
}

/**
 * Mock: escalation_events INSERT
 * Chain: .from().insert()
 */
function mockEscalationEventInsert() {
  mockFrom.mockReturnValueOnce({
    insert: vi.fn().mockResolvedValue({ error: null }),
  });
}

/**
 * Mock: bot_flow_phases SELECT with gt() (advancePhase — find next phase)
 * Chain: .from().select().eq().gt().order().limit().single()
 */
function mockNextPhase(data: unknown) {
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data, error: null }),
            }),
          }),
        }),
      }),
    }),
  });
}

/**
 * Mock: conversation_phases INSERT (advancePhase — create new row)
 * Chain: .from().insert().select().single()
 */
function mockInsertConversationPhase(data: unknown) {
  mockFrom.mockReturnValueOnce({
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data, error: null }),
      }),
    }),
  });
}

/**
 * Mock SDK: embedding call — returns a 1024-dim vector.
 */
function mockEmbeddingFetch() {
  mockFeatureExtraction.mockResolvedValueOnce(fakeEmbedding);
}

/**
 * Mock RPC: vector search returning a chunk above similarity threshold (0.3).
 * "Hello there" has no keywords so classifyQuery returns "both" — two rpc
 * calls happen in Promise.all (general + product).
 */
function mockVectorSearch(similarity = 0.75) {
  // general KB
  mockRpc.mockReturnValueOnce({
    data: [
      {
        id: "chunk-1",
        content: "Acme Corp helps businesses grow.",
        similarity,
        metadata: {},
      },
    ],
    error: null,
  });
  // product KB
  mockRpc.mockReturnValueOnce({
    data: [],
    error: null,
  });
}

/**
 * Mock fetch: LLM chat completions response.
 */
function mockLLMFetch(overrides: {
  message?: string;
  phase_action?: string;
  confidence?: number;
} = {}) {
  const payload = {
    message: overrides.message ?? "Hey! Welcome to Acme Corp.",
    phase_action: overrides.phase_action ?? "stay",
    confidence: overrides.confidence ?? 0.92,
    image_ids: [],
  };

  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: { content: JSON.stringify(payload) },
          finish_reason: "stop",
        },
      ],
    }),
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("HF_TOKEN", "test-key");
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Conversation Engine Integration", () => {
  // -------------------------------------------------------------------------
  // Test 1: Full pipeline — message → phase → RAG → LLM → response (stay)
  // -------------------------------------------------------------------------
  it("full pipeline: stay action returns correct output", async () => {
    // DB call 0: gate check — conversations SELECT bot_paused_at (not paused)
    mockConversationGateCheck(null);

    // DB call 1: getCurrentPhase → conversation_phases SELECT
    mockGetCurrentPhase(phaseRow);

    // DB call 2: campaigns SELECT (fetch campaign context)
    mockCampaignData();

    // Fetch 1: embedding for RAG retrieval
    mockEmbeddingFetch();

    // RPC 1 + 2: vector search (both targets, general + product in Promise.all)
    mockVectorSearch(0.75);

    // DB call 3: tenants SELECT (fetch max_images_per_response) — added in Phase 5
    mockTenantConfig();

    // DB call 4: knowledge_images tag filter (selectImages) — returns no candidates → early exit
    mockImageTagFilter([]);

    // DB calls 5, 6 & 7 (in Promise.all inside buildSystemPrompt):
    //   call 5: bot_rules SELECT
    //   call 6: messages SELECT
    //   call 7: tenants SELECT (persona_tone + custom_instructions)
    mockBotRules([]);
    mockMessages([]);
    mockTenantPersona();

    // Fetch 2: LLM chat completions
    mockLLMFetch({ phase_action: "stay", confidence: 0.92 });

    // DB calls 5 & 6: incrementMessageCount (read then write)
    mockIncrementRead(0);
    mockIncrementWrite();

    // DB call 7: messages idle gap check
    mockMessagesIdleCheck(null);

    const result = await handleMessage(engineInput);

    expect(result.message).toBe("Hey! Welcome to Acme Corp.");
    expect(result.phaseAction).toBe("stay");
    expect(result.confidence).toBe(0.92);
    expect(result.currentPhase).toBe("Greet");
    expect(result.escalated).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 2: Phase advancement
  // -------------------------------------------------------------------------
  it("phase advancement: advance action triggers advancePhase side effect", async () => {
    // DB call 0: gate check — conversations SELECT bot_paused_at (not paused)
    mockConversationGateCheck(null);

    // DB call 1: getCurrentPhase → conversation_phases SELECT
    mockGetCurrentPhase(phaseRow);

    // DB call 2: campaigns SELECT (fetch campaign context)
    mockCampaignData();

    // Fetch 1: embedding for RAG retrieval
    mockEmbeddingFetch();

    // RPC 1 + 2: vector search
    mockVectorSearch(0.75);

    // DB call 3: tenants SELECT (fetch max_images_per_response) — added in Phase 5
    mockTenantConfig();

    // DB call 4: knowledge_images tag filter (selectImages) — returns no candidates → early exit
    mockImageTagFilter([]);

    // DB calls 5, 6 & 7 (buildSystemPrompt Promise.all):
    //   call 5: bot_rules SELECT
    //   call 6: messages SELECT
    //   call 7: tenants SELECT (persona_tone + custom_instructions)
    mockBotRules([]);
    mockMessages([]);
    mockTenantPersona();

    // Fetch 2: LLM — returns advance
    mockLLMFetch({ phase_action: "advance", confidence: 0.88 });

    // advancePhase side effect:
    //   call 4: getCurrentPhase (internally called by advancePhase)
    mockGetCurrentPhase(phaseRow);
    //   call 5: conversation_phases UPDATE (set exited_at)
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    //   call 6: campaign_phases SELECT with gt() (next phase)
    const nextPhaseData = {
      id: "phase-2",
      name: "Qualify",
      order_index: 1,
      max_messages: 3,
      system_prompt: "Qualify the lead.",
      tone: "professional",
      goals: "Understand needs",
      transition_hint: null,
      action_button_ids: null,
    };
    mockNextPhase(nextPhaseData);
    //   call 6: conversation_phases INSERT (new phase row)
    mockInsertConversationPhase({ id: "cp-2", phase_id: "phase-2", message_count: 0 });

    // DB calls 7 & 8: incrementMessageCount (read then write)
    mockIncrementRead(0);
    mockIncrementWrite();

    // DB call 9: messages idle gap check
    mockMessagesIdleCheck(null);

    const result = await handleMessage(engineInput);

    expect(result.phaseAction).toBe("advance");
    expect(result.currentPhase).toBe("Greet");
    expect(result.escalated).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 3: Escalation on low confidence
  // -------------------------------------------------------------------------
  it("escalation: low confidence triggers escalate side effect", async () => {
    // DB call 0: gate check — conversations SELECT bot_paused_at (not paused)
    mockConversationGateCheck(null);

    // DB call 1: getCurrentPhase → conversation_phases SELECT
    mockGetCurrentPhase(phaseRow);

    // DB call 2: campaigns SELECT (fetch campaign context)
    mockCampaignData();

    // Fetch 1: embedding for RAG retrieval
    mockEmbeddingFetch();

    // RPC 1 + 2: vector search
    mockVectorSearch(0.75);

    // DB call 3: tenants SELECT (fetch max_images_per_response) — added in Phase 5
    mockTenantConfig();

    // DB call 4: knowledge_images tag filter (selectImages) — returns no candidates → early exit
    mockImageTagFilter([]);

    // DB calls 5, 6 & 7 (buildSystemPrompt Promise.all):
    //   call 5: bot_rules SELECT
    //   call 6: messages SELECT
    //   call 7: tenants SELECT (persona_tone + custom_instructions)
    mockBotRules([]);
    mockMessages([]);
    mockTenantPersona();

    // Fetch 2: LLM — returns low confidence / escalate
    // Note: decision-parser overrides phase_action to "escalate" when confidence < 0.4
    mockLLMFetch({ phase_action: "escalate", confidence: 0.25 });

    // Escalate side effect:
    //   call 4: conversations UPDATE (needs_human = true)
    mockConversationEscalate();
    //   call 5: escalation_events INSERT
    mockEscalationEventInsert();

    // DB calls 6 & 7: incrementMessageCount (read then write)
    mockIncrementRead(0);
    mockIncrementWrite();

    // DB call 8: messages idle gap check
    mockMessagesIdleCheck(null);

    const result = await handleMessage(engineInput);

    expect(result.escalated).toBe(true);
    expect(result.phaseAction).toBe("escalate");
    expect(result.currentPhase).toBe("Greet");
    expect(result.confidence).toBe(0.25);
  });
});
