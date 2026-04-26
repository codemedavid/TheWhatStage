import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import type { PromptContext } from "@/lib/ai/prompt-builder";
import type { StepContext } from "@/lib/ai/step-context";
import type { ChunkResult } from "@/lib/ai/vector-search";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupMocks(
  rules: { rule_text: string; category: string }[] = [],
  messages: { direction: string; text: string }[] = [],
  persona: { persona_tone: string; custom_instructions: string | null } = {
    persona_tone: "friendly",
    custom_instructions: null,
  }
) {
  const rulesChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: rules, error: null }),
      }),
    }),
  };

  const messagesChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: messages, error: null }),
        }),
      }),
    }),
  };

  const personaChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: persona, error: null }),
      }),
    }),
  };

  mockFrom
    .mockReturnValueOnce(rulesChain)
    .mockReturnValueOnce(messagesChain)
    .mockReturnValueOnce(personaChain);
}

const baseStep: StepContext = {
  name: "Step 1 of 1 — Greeting",
  position: 0,
  total: 1,
  instructions: "Chat rules for this step:\n- Welcome the lead warmly.",
  tone: "friendly",
  goal: "Open the conversation and build rapport",
  transitionHint: "Advance when lead responds positively",
  messageCount: 3,
  maxMessages: 10,
  actionButtonIds: [],
};

const baseChunks: ChunkResult[] = [
  {
    id: "chunk-1",
    content: "Our product helps small businesses grow.",
    similarity: 0.92,
    metadata: {},
  },
  {
    id: "chunk-2",
    content: "We offer 24/7 support to all customers.",
    similarity: 0.85,
    metadata: {},
  },
];

function makeContext(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    tenantId: "tenant-abc",
    businessName: "Acme Corp",
    step: baseStep,
    conversationId: "conv-123",
    ragChunks: baseChunks,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildSystemPrompt", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("includes sales strategy guidance without impersonating a sales figure", async () => {
    setupMocks();

    const prompt = await buildSystemPrompt(makeContext());

    expect(prompt).toContain("SALES CONVERSATION STRATEGY");
    expect(prompt).toContain("Use this as hidden reasoning, not as a script");
    expect(prompt).toContain("Clarify:");
    expect(prompt).toContain("Sell outcome:");
    expect(prompt).toContain("Do not force every step");
    expect(prompt.toLowerCase()).not.toContain("act like alex");
  });

  it("frames current step as advisory guidance instead of a rigid script", async () => {
    setupMocks();

    const prompt = await buildSystemPrompt(makeContext());

    expect(prompt).toContain("The step is guidance, not a rule");
    expect(prompt).toContain("respond to the lead's intent first");
    expect(prompt).toContain("You may advance when the conversation naturally moves forward");
  });

  it("instructs vague high-intent messages to default to the current offer", async () => {
    setupMocks();

    const prompt = await buildSystemPrompt(
      makeContext({
        campaign: {
          name: "Spring Enrollment",
          description: "A coaching program for small businesses that want more qualified leads.",
          goal: "form_submit",
        },
      })
    );

    expect(prompt).toContain('If the lead says "interested"');
    expect(prompt).toContain("Assume they mean the current offer if one is available");
    expect(prompt).toContain('Do not ask "interested in what?"');
    expect(prompt).toContain("Spring Enrollment");
    expect(prompt).toContain("A coaching program for small businesses");
  });

  it("layer 1 — base persona includes business name", async () => {
    setupMocks();
    const prompt = await buildSystemPrompt(makeContext());
    expect(prompt).toContain("Acme Corp");
    expect(prompt).toContain("real person");
    expect(prompt).toContain("conversational");
  });

  it("layer 2 — bot rules are rendered by category when present", async () => {
    setupMocks(
      [
        { rule_text: "Always be polite", category: "tone" },
        { rule_text: "Never discuss competitors", category: "boundary" },
        { rule_text: "Ask clarifying questions", category: "behavior" },
      ],
      []
    );
    const prompt = await buildSystemPrompt(makeContext());
    expect(prompt).toContain("BOT RULES");
    expect(prompt).toContain("TONE:");
    expect(prompt).toContain("Always be polite");
    expect(prompt).toContain("BOUNDARY:");
    expect(prompt).toContain("Never discuss competitors");
    expect(prompt).toContain("BEHAVIOR:");
    expect(prompt).toContain("Ask clarifying questions");
  });

  it("layer 2 — empty bot rules section is omitted (no 'undefined' in output)", async () => {
    setupMocks([], []);
    const prompt = await buildSystemPrompt(makeContext());
    expect(prompt).not.toContain("undefined");
    expect(prompt).not.toContain("BOT RULES");
  });

  it("layer 3 — current step details included", async () => {
    setupMocks();
    const prompt = await buildSystemPrompt(makeContext());
    expect(prompt).toContain("WHERE YOU ARE IN THE FUNNEL");
    expect(prompt).toContain("Step 1 of 1 — Greeting");
    expect(prompt).toContain("Welcome the lead warmly.");
    expect(prompt).toContain("friendly");
  });

  it("layer 3 — step goal and transition hint are included", async () => {
    setupMocks();
    const prompt = await buildSystemPrompt(makeContext());
    expect(prompt).toContain("Open the conversation and build rapport");
    expect(prompt).toContain("Advance when lead responds positively");
  });

  it("layer 3 — message count and max messages are included", async () => {
    setupMocks();
    const prompt = await buildSystemPrompt(makeContext());
    expect(prompt).toContain("3");
    expect(prompt).toContain("10");
    expect(prompt).toContain("soft limit");
  });

  it("layer 4 — conversation history is formatted as Lead/Bot", async () => {
    setupMocks(
      [],
      [
        { direction: "in", text: "Hello there!" },
        { direction: "out", text: "Hi! How can I help?" },
      ]
    );
    const prompt = await buildSystemPrompt(makeContext());
    expect(prompt).toContain("Lead: Hello there!");
    expect(prompt).toContain("Bot: Hi! How can I help?");
  });

  it("layer 4 — no messages shows placeholder", async () => {
    setupMocks([], []);
    const prompt = await buildSystemPrompt(makeContext());
    expect(prompt).toContain("No previous messages");
  });

  it("layer 4 — long conversation history is truncated to ~8000 chars", async () => {
    const longMessages = Array.from({ length: 20 }, (_, i) => ({
      direction: i % 2 === 0 ? "in" : "out",
      text: "x".repeat(1000),
    }));
    setupMocks([], longMessages);
    const prompt = await buildSystemPrompt(makeContext());
    const historyStart = prompt.indexOf("--- CONVERSATION HISTORY ---");
    const historyEnd = prompt.indexOf("--- RETRIEVED KNOWLEDGE ---");
    const historySection = prompt.slice(historyStart, historyEnd);
    expect(historySection.length).toBeLessThan(8500);
  });

  it("layer 5 — RAG chunks are numbered and rendered", async () => {
    setupMocks();
    const prompt = await buildSystemPrompt(makeContext());
    expect(prompt).toContain("[1]");
    expect(prompt).toContain("Our product helps small businesses grow.");
    expect(prompt).toContain("[2]");
    expect(prompt).toContain("We offer 24/7 support to all customers.");
  });

  it("layer 5 — empty RAG chunks shows fallback message", async () => {
    setupMocks();
    const prompt = await buildSystemPrompt(makeContext({ ragChunks: [] }));
    expect(prompt).toContain("No specific knowledge retrieved");
  });

  it("layer 6 — images are rendered with id, description, context_hint", async () => {
    setupMocks();
    const prompt = await buildSystemPrompt(
      makeContext({
        images: [
          {
            id: "img-1",
            url: "https://example.com/img.jpg",
            description: "Product overview diagram",
            context_hint: "Show when explaining the product",
          },
        ],
      })
    );
    expect(prompt).toContain("AVAILABLE IMAGES");
    expect(prompt).toContain("img-1");
    expect(prompt).toContain("Product overview diagram");
    expect(prompt).toContain("Show when explaining the product");
    expect(prompt).toContain("image_ids");
  });

  it("layer 6 — empty images array shows 'No images available'", async () => {
    setupMocks();
    const prompt = await buildSystemPrompt(makeContext({ images: [] }));
    expect(prompt).toContain("No images available");
  });

  it("layer 6 — undefined images shows 'No images available'", async () => {
    setupMocks();
    const prompt = await buildSystemPrompt(makeContext({ images: undefined }));
    expect(prompt).toContain("No images available");
  });

  it("layer 7 — response format JSON instructions are present", async () => {
    setupMocks();
    const prompt = await buildSystemPrompt(makeContext());
    expect(prompt).toContain("RESPONSE FORMAT");
    expect(prompt).toContain('"message"');
    expect(prompt).toContain('"phase_action"');
    expect(prompt).toContain('"confidence"');
    expect(prompt).toContain('"image_ids"');
    expect(prompt).toContain("stay");
    expect(prompt).toContain("advance");
    expect(prompt).toContain("escalate");
  });

  it("all 7 layers are present as sections in the prompt", async () => {
    setupMocks(
      [{ rule_text: "Be helpful", category: "tone" }],
      [{ direction: "in", text: "Hi" }]
    );
    const prompt = await buildSystemPrompt(
      makeContext({
        images: [
          {
            id: "img-1",
            url: "https://example.com/img.jpg",
            description: "Test image",
            context_hint: "For testing",
          },
        ],
      })
    );
    expect(prompt).toContain("Acme Corp");
    expect(prompt).toContain("BOT RULES");
    expect(prompt).toContain("WHERE YOU ARE IN THE FUNNEL");
    expect(prompt).toContain("CONVERSATION HISTORY");
    expect(prompt).toContain("RETRIEVED KNOWLEDGE");
    expect(prompt).toContain("AVAILABLE IMAGES");
    expect(prompt).toContain("RESPONSE FORMAT");
  });

  it("includes campaign rules as Layer 2.5 when provided", async () => {
    setupMocks();

    const prompt = await buildSystemPrompt(
      makeContext({
        campaign: {
          name: "Trust First",
          description: "Trust-first campaign.",
          goal: "form_submit",
          campaignRules: [
            "Always mention the free consultation",
            "Never discuss pricing until phase 2",
          ],
        },
      })
    );

    expect(prompt).toContain("--- CAMPAIGN RULES ---");
    expect(prompt).toContain("Always mention the free consultation");
    expect(prompt).toContain("Never discuss pricing until phase 2");
  });

  it("skips campaign rules layer when rules are empty", async () => {
    setupMocks();

    const prompt = await buildSystemPrompt(
      makeContext({
        campaign: {
          name: "Trust First",
          description: "Trust-first campaign.",
          goal: "form_submit",
          campaignRules: [],
        },
      })
    );

    expect(prompt).not.toContain("--- CAMPAIGN RULES ---");
  });

  it("step with null goal and transitionHint does not crash", async () => {
    setupMocks();
    const stepWithNulls: StepContext = {
      ...baseStep,
      goal: null,
      transitionHint: null,
    };
    const prompt = await buildSystemPrompt(
      makeContext({ step: stepWithNulls })
    );
    expect(prompt).toContain("Step 1 of 1 — Greeting");
    expect(prompt).not.toContain("undefined");
  });

  describe("action button prompt section", () => {
    it("includes available action buttons when step has actionButtonIds", async () => {
      setupMocks();

      const actionPagesChain = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "ap-1",
                  title: "Free Consultation",
                  type: "calendar",
                  cta_text: "Book now!",
                },
              ],
              error: null,
            }),
          }),
        }),
      };
      mockFrom.mockReturnValueOnce(actionPagesChain);

      const step: StepContext = {
        name: "Step 1 of 1 — Qualification",
        position: 0,
        total: 1,
        instructions: "Chat rules for this step:\n- Qualify the lead.",
        tone: "friendly",
        goal: "Understand their needs",
        transitionHint: null,
        messageCount: 2,
        maxMessages: 5,
        actionButtonIds: ["ap-1"],
      };

      const ctx: PromptContext = {
        tenantId: "t-1",
        businessName: "Test Biz",
        step,
        conversationId: "conv-1",
        ragChunks: [],
      };

      const prompt = await buildSystemPrompt(ctx);
      expect(prompt).toContain("ACTION BUTTONS AVAILABLE");
      expect(prompt).toContain("Free Consultation");
      expect(prompt).toContain("ap-1");
      expect(prompt).toContain("Book now!");
    });

    it("does not include action buttons section when step has no actionButtonIds", async () => {
      setupMocks();

      const step: StepContext = {
        name: "Step 1 of 1 — Qualification",
        position: 0,
        total: 1,
        instructions: "Chat rules for this step:\n- Qualify the lead.",
        tone: "friendly",
        goal: null,
        transitionHint: null,
        messageCount: 0,
        maxMessages: 5,
        actionButtonIds: [],
      };

      const ctx: PromptContext = {
        tenantId: "t-1",
        businessName: "Test Biz",
        step,
        conversationId: "conv-1",
        ragChunks: [],
      };

      const prompt = await buildSystemPrompt(ctx);
      expect(prompt).not.toContain("ACTION BUTTONS AVAILABLE");
    });

    it("includes action_button_id in response format instructions", async () => {
      setupMocks();
      const prompt = await buildSystemPrompt(makeContext());
      expect(prompt).toContain('"action_button_id"');
      expect(prompt).toContain('"cta_text"');
    });
  });
});
