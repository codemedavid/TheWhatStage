import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleMessage } from "@/lib/ai/conversation-engine";

// ---------------------------------------------------------------------------
// Globals: fetch + Supabase
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

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

// The embedding API returns 4096-dim vectors; embedText truncates to 1536.
const API_DIM = 4096;
const fakeEmbedding = Array.from({ length: API_DIM }, (_, i) => Math.sin(i) * 0.01);

const phaseRow = {
  id: "cp-1",
  phase_id: "phase-1",
  message_count: 0,
  bot_flow_phases: {
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
  businessName: "Acme Corp",
  conversationId: "conv-1",
  leadMessage: "Hello there",
};

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Mock: conversation_phases SELECT (getCurrentPhase)
 * Chain: .from().select().eq().order().limit().single()
 */
function mockGetCurrentPhase(data: typeof phaseRow) {
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data, error: null }),
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
 * Mock fetch: embedding API call — returns a 4096-dim vector.
 */
function mockEmbeddingFetch() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => [fakeEmbedding],
  });
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
  vi.stubEnv("HUGGINGFACE_API_KEY", "test-key");
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Conversation Engine Integration", () => {
  // -------------------------------------------------------------------------
  // Test 1: Full pipeline — message → phase → RAG → LLM → response (stay)
  // -------------------------------------------------------------------------
  it("full pipeline: stay action returns correct output", async () => {
    // DB call 1: getCurrentPhase → conversation_phases SELECT
    mockGetCurrentPhase(phaseRow);

    // Fetch 1: embedding for RAG retrieval
    mockEmbeddingFetch();

    // RPC 1 + 2: vector search (both targets, general + product in Promise.all)
    mockVectorSearch(0.75);

    // DB call 2: tenants SELECT (fetch max_images_per_response) — added in Phase 5
    mockTenantConfig();

    // DB call 3: knowledge_images tag filter (selectImages) — returns no candidates → early exit
    mockImageTagFilter([]);

    // DB calls 4 & 5 (in Promise.all inside buildSystemPrompt):
    //   call 4: bot_rules SELECT
    //   call 5: messages SELECT
    mockBotRules([]);
    mockMessages([]);

    // Fetch 2: LLM chat completions
    mockLLMFetch({ phase_action: "stay", confidence: 0.92 });

    // DB calls 5 & 6: incrementMessageCount (read then write)
    mockIncrementRead(0);
    mockIncrementWrite();

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
    // DB call 1: getCurrentPhase → conversation_phases SELECT
    mockGetCurrentPhase(phaseRow);

    // Fetch 1: embedding for RAG retrieval
    mockEmbeddingFetch();

    // RPC 1 + 2: vector search
    mockVectorSearch(0.75);

    // DB call 2: tenants SELECT (fetch max_images_per_response) — added in Phase 5
    mockTenantConfig();

    // DB call 3: knowledge_images tag filter (selectImages) — returns no candidates → early exit
    mockImageTagFilter([]);

    // DB calls 4 & 5 (buildSystemPrompt Promise.all):
    //   call 4: bot_rules SELECT
    //   call 5: messages SELECT
    mockBotRules([]);
    mockMessages([]);

    // Fetch 2: LLM — returns advance
    mockLLMFetch({ phase_action: "advance", confidence: 0.88 });

    // advancePhase side effect:
    //   call 4: getCurrentPhase (internally called by advancePhase)
    mockGetCurrentPhase(phaseRow);
    //   call 5: bot_flow_phases SELECT with gt() (next phase)
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

    const result = await handleMessage(engineInput);

    expect(result.phaseAction).toBe("advance");
    expect(result.currentPhase).toBe("Greet");
    expect(result.escalated).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 3: Escalation on low confidence
  // -------------------------------------------------------------------------
  it("escalation: low confidence triggers escalate side effect", async () => {
    // DB call 1: getCurrentPhase → conversation_phases SELECT
    mockGetCurrentPhase(phaseRow);

    // Fetch 1: embedding for RAG retrieval
    mockEmbeddingFetch();

    // RPC 1 + 2: vector search
    mockVectorSearch(0.75);

    // DB call 2: tenants SELECT (fetch max_images_per_response) — added in Phase 5
    mockTenantConfig();

    // DB call 3: knowledge_images tag filter (selectImages) — returns no candidates → early exit
    mockImageTagFilter([]);

    // DB calls 4 & 5 (buildSystemPrompt Promise.all):
    //   call 4: bot_rules SELECT
    //   call 5: messages SELECT
    mockBotRules([]);
    mockMessages([]);

    // Fetch 2: LLM — returns low confidence / escalate
    // Note: decision-parser overrides phase_action to "escalate" when confidence < 0.4
    mockLLMFetch({ phase_action: "escalate", confidence: 0.25 });

    // Escalate side effect:
    //   call 4: conversations UPDATE (needs_human = true)
    mockConversationEscalate();

    // DB calls 5 & 6: incrementMessageCount (read then write)
    mockIncrementRead(0);
    mockIncrementWrite();

    const result = await handleMessage(engineInput);

    expect(result.escalated).toBe(true);
    expect(result.phaseAction).toBe("escalate");
    expect(result.currentPhase).toBe("Greet");
    expect(result.confidence).toBe(0.25);
  });
});
