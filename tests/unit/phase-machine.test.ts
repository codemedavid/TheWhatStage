import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

import {
  getCurrentPhase,
  advancePhase,
  incrementMessageCount,
} from "@/lib/ai/phase-machine";

const existingConversationPhaseRow = {
  id: "cp-1",
  phase_id: "phase-1",
  message_count: 3,
  bot_flow_phases: {
    id: "phase-1",
    name: "Greet",
    order_index: 0,
    max_messages: 10,
    system_prompt: "Welcome the lead.",
    tone: "friendly",
    goals: "Open conversation",
    transition_hint: "Advance when lead responds",
    action_button_ids: null,
  },
};

const nextPhaseRow = {
  id: "phase-2",
  name: "Qualify",
  order_index: 1,
  max_messages: 5,
  system_prompt: "Qualify the lead.",
  tone: "professional",
  goals: "Understand needs",
  transition_hint: "Advance when needs clear",
  action_button_ids: ["btn-1"],
};

const firstBotFlowPhase = {
  id: "phase-1",
  name: "Greet",
  order_index: 0,
  max_messages: 10,
  system_prompt: "Welcome the lead.",
  tone: "friendly",
  goals: "Open conversation",
  transition_hint: "Advance when lead responds",
  action_button_ids: null,
};

const insertedConversationPhase = {
  id: "cp-new",
  phase_id: "phase-1",
  message_count: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// Helper to mock a select().eq().order().limit().single() chain
function mockSelectChain(result: { data: unknown; error: null | object }) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(result),
          }),
        }),
      }),
    }),
  };
}

// Helper to mock a select().eq().gt().order().limit().single() chain
function mockSelectGtChain(result: { data: unknown; error: null | object }) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(result),
            }),
          }),
        }),
      }),
    }),
  };
}

// Helper to mock an insert().select().single() chain
function mockInsertChain(result: { data: unknown; error: null | object }) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

// Helper to mock a select().eq().single() chain (for incrementMessageCount read)
function mockSelectEqSingle(result: { data: unknown; error: null | object }) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

// Helper to mock an update().eq() chain
function mockUpdateChain(result: { error: null | object }) {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(result),
    }),
  };
}

describe("getCurrentPhase", () => {
  it("returns existing phase when one exists", async () => {
    // DB call 1: lookup conversation_phases joined with bot_flow_phases
    mockFrom.mockReturnValueOnce(
      mockSelectChain({ data: existingConversationPhaseRow, error: null })
    );

    const result = await getCurrentPhase("conv-1", "tenant-1");

    expect(result.conversationPhaseId).toBe("cp-1");
    expect(result.phaseId).toBe("phase-1");
    expect(result.name).toBe("Greet");
    expect(result.orderIndex).toBe(0);
    expect(result.maxMessages).toBe(10);
    expect(result.systemPrompt).toBe("Welcome the lead.");
    expect(result.tone).toBe("friendly");
    expect(result.goals).toBe("Open conversation");
    expect(result.transitionHint).toBe("Advance when lead responds");
    expect(result.actionButtonIds).toBeNull();
    expect(result.messageCount).toBe(3);
  });

  it("initializes first phase when no phase exists", async () => {
    // DB call 1: lookup conversation_phases — returns null (no existing phase)
    mockFrom.mockReturnValueOnce(
      mockSelectChain({ data: null, error: { code: "PGRST116" } })
    );

    // DB call 2: lookup first bot_flow_phases for tenant (order_index = 0)
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: firstBotFlowPhase,
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    // DB call 3: insert new conversation_phases row
    mockFrom.mockReturnValueOnce(
      mockInsertChain({ data: insertedConversationPhase, error: null })
    );

    const result = await getCurrentPhase("conv-1", "tenant-1");

    expect(result.conversationPhaseId).toBe("cp-new");
    expect(result.phaseId).toBe("phase-1");
    expect(result.name).toBe("Greet");
    expect(result.orderIndex).toBe(0);
    expect(result.messageCount).toBe(0);
    expect(mockFrom).toHaveBeenCalledTimes(3);
  });
});

describe("advancePhase", () => {
  it("advances to next phase by order_index", async () => {
    // advancePhase calls getCurrentPhase first (1 DB call for existing phase)
    mockFrom.mockReturnValueOnce(
      mockSelectChain({ data: existingConversationPhaseRow, error: null })
    );

    // DB call 2: find next phase with gt(order_index, 0)
    mockFrom.mockReturnValueOnce(
      mockSelectGtChain({ data: nextPhaseRow, error: null })
    );

    // DB call 3: insert new conversation_phases row for next phase
    const insertedNextPhase = {
      id: "cp-2",
      phase_id: "phase-2",
      message_count: 0,
    };
    mockFrom.mockReturnValueOnce(
      mockInsertChain({ data: insertedNextPhase, error: null })
    );

    const result = await advancePhase("conv-1", "tenant-1");

    expect(result.conversationPhaseId).toBe("cp-2");
    expect(result.phaseId).toBe("phase-2");
    expect(result.name).toBe("Qualify");
    expect(result.orderIndex).toBe(1);
    expect(result.maxMessages).toBe(5);
    expect(result.systemPrompt).toBe("Qualify the lead.");
    expect(result.tone).toBe("professional");
    expect(result.goals).toBe("Understand needs");
    expect(result.transitionHint).toBe("Advance when needs clear");
    expect(result.actionButtonIds).toEqual(["btn-1"]);
    expect(result.messageCount).toBe(0);
  });

  it("stays on current phase when already on last phase", async () => {
    // advancePhase calls getCurrentPhase first (existing phase)
    mockFrom.mockReturnValueOnce(
      mockSelectChain({ data: existingConversationPhaseRow, error: null })
    );

    // DB call 2: find next phase — returns null (no next phase)
    mockFrom.mockReturnValueOnce(
      mockSelectGtChain({ data: null, error: { code: "PGRST116" } })
    );

    const result = await advancePhase("conv-1", "tenant-1");

    // Should return the current phase unchanged
    expect(result.conversationPhaseId).toBe("cp-1");
    expect(result.phaseId).toBe("phase-1");
    expect(result.name).toBe("Greet");
    expect(result.messageCount).toBe(3);
    // No insert should happen (only 2 DB calls total)
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });
});

describe("incrementMessageCount", () => {
  it("reads current message_count and increments by 1", async () => {
    // DB call 1: read current message_count
    mockFrom.mockReturnValueOnce(
      mockSelectEqSingle({ data: { message_count: 5 }, error: null })
    );

    // DB call 2: update with message_count + 1
    mockFrom.mockReturnValueOnce(mockUpdateChain({ error: null }));

    await incrementMessageCount("cp-1");

    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockFrom).toHaveBeenNthCalledWith(1, "conversation_phases");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "conversation_phases");
  });
});

describe("getCurrentPhase — error paths", () => {
  it("throws when no phases configured for tenant", async () => {
    // First call: no existing conversation_phase
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    });

    // Second call: no first phase found
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } }),
            }),
          }),
        }),
      }),
    });

    await expect(getCurrentPhase("conv-1", "tenant-1")).rejects.toThrow(
      "No bot flow phases configured for this tenant"
    );
  });
});
