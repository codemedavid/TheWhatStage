import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/llm-client", () => ({
  generateResponse: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}));

import { generateLeadSummary } from "@/lib/leads/summary-generator";
import { generateResponse } from "@/lib/ai/llm-client";
import { createServiceClient } from "@/lib/supabase/service";

const mockGenerateResponse = vi.mocked(generateResponse);
const mockCreateServiceClient = vi.mocked(createServiceClient);

const defaultMessages = [
  { direction: "in", text: "Hi, I'm interested in your services.", created_at: "2024-01-01T10:00:00Z" },
  { direction: "out", text: "Great! What are you looking for?", created_at: "2024-01-01T10:01:00Z" },
  { direction: "in", text: "I need help with lead generation.", created_at: "2024-01-01T10:02:00Z" },
  { direction: "out", text: "We can help with that. Click here to learn more.", created_at: "2024-01-01T10:03:00Z" },
];

function buildSupabaseMock({
  messages = defaultMessages,
  messagesError = null,
  insertError = null,
}: {
  messages?: typeof defaultMessages | null;
  messagesError?: object | null;
  insertError?: object | null;
} = {}) {
  const mockInsert = vi.fn().mockResolvedValue({ error: insertError });

  const mockLimit = vi.fn().mockResolvedValue({ data: messages, error: messagesError });
  const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

  const mockFrom = vi.fn((table: string) => {
    if (table === "messages") {
      return { select: mockSelect };
    }
    if (table === "lead_notes") {
      return { insert: mockInsert };
    }
    return {};
  });

  return {
    client: { from: mockFrom },
    mockInsert,
    mockFrom,
    mockSelect,
    mockEq,
    mockOrder,
    mockLimit,
  };
}

const params = {
  tenantId: "tenant-123",
  leadId: "lead-456",
  conversationId: "conv-789",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateLeadSummary", () => {
  it("fetches messages, generates summary, and inserts into lead_notes", async () => {
    const { client, mockInsert } = buildSupabaseMock();
    mockCreateServiceClient.mockReturnValue(client as ReturnType<typeof createServiceClient>);
    mockGenerateResponse.mockResolvedValue({
      content: "The lead expressed strong interest in lead generation services and engaged with the chatbot.",
      finishReason: "stop",
    });

    await generateLeadSummary(params);

    // Verify generateResponse was called with the summary prompt and a transcript
    expect(mockGenerateResponse).toHaveBeenCalledOnce();
    const [systemPrompt, transcript, config] = mockGenerateResponse.mock.calls[0];
    expect(systemPrompt).toContain("CRM assistant");
    expect(systemPrompt).toContain("third person");
    expect(transcript).toContain("Lead: Hi, I'm interested in your services.");
    expect(transcript).toContain("Bot: Great! What are you looking for?");
    expect(config).toEqual({ temperature: 0.3, maxTokens: 256, responseFormat: "text" });

    // Verify insert into lead_notes with correct fields
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledWith({
      tenant_id: "tenant-123",
      lead_id: "lead-456",
      conversation_id: "conv-789",
      type: "ai_summary",
      content: "The lead expressed strong interest in lead generation services and engaged with the chatbot.",
    });
  });

  it("does not throw on LLM failure (best-effort)", async () => {
    const { client } = buildSupabaseMock();
    mockCreateServiceClient.mockReturnValue(client as ReturnType<typeof createServiceClient>);
    mockGenerateResponse.mockRejectedValue(new Error("LLM service unavailable"));

    // Should resolve without throwing
    await expect(generateLeadSummary(params)).resolves.toBeUndefined();
  });

  it("returns early when no messages found (empty array)", async () => {
    const { client, mockInsert } = buildSupabaseMock({ messages: [] });
    mockCreateServiceClient.mockReturnValue(client as ReturnType<typeof createServiceClient>);

    await generateLeadSummary(params);

    expect(mockGenerateResponse).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns early when messages query returns null", async () => {
    const { client, mockInsert } = buildSupabaseMock({ messages: null });
    mockCreateServiceClient.mockReturnValue(client as ReturnType<typeof createServiceClient>);

    await generateLeadSummary(params);

    expect(mockGenerateResponse).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns early when messages query returns an error", async () => {
    const { client, mockInsert } = buildSupabaseMock({
      messagesError: { message: "relation does not exist", code: "42P01" },
    });
    mockCreateServiceClient.mockReturnValue(client as ReturnType<typeof createServiceClient>);

    await generateLeadSummary(params);

    expect(mockGenerateResponse).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("formats transcript with Lead/Bot prefixes and [attachment] for null text", async () => {
    const messagesWithAttachment = [
      { direction: "in", text: "Hello!", created_at: "2024-01-01T10:00:00Z" },
      { direction: "out", text: null, created_at: "2024-01-01T10:01:00Z" },
      { direction: "in", text: null, created_at: "2024-01-01T10:02:00Z" },
      { direction: "out", text: "Here is a summary.", created_at: "2024-01-01T10:03:00Z" },
    ];
    const { client } = buildSupabaseMock({
      messages: messagesWithAttachment as typeof defaultMessages,
    });
    mockCreateServiceClient.mockReturnValue(client as ReturnType<typeof createServiceClient>);
    mockGenerateResponse.mockResolvedValue({ content: "The lead sent an attachment.", finishReason: "stop" });

    await generateLeadSummary(params);

    const transcript = mockGenerateResponse.mock.calls[0][1];
    expect(transcript).toBe(
      [
        "Lead: Hello!",
        "Bot: [attachment]",
        "Lead: [attachment]",
        "Bot: Here is a summary.",
      ].join("\n")
    );
  });

  it("does not throw on Supabase insert failure (best-effort)", async () => {
    const { client } = buildSupabaseMock({ insertError: { message: "insert failed" } });
    mockCreateServiceClient.mockReturnValue(client as ReturnType<typeof createServiceClient>);
    mockGenerateResponse.mockResolvedValue({ content: "Summary text.", finishReason: "stop" });

    await expect(generateLeadSummary(params)).resolves.toBeUndefined();
  });

  it("uses correct LLM config (temperature 0.3, maxTokens 256, responseFormat text)", async () => {
    const { client } = buildSupabaseMock();
    mockCreateServiceClient.mockReturnValue(client as ReturnType<typeof createServiceClient>);
    mockGenerateResponse.mockResolvedValue({ content: "Summary.", finishReason: "stop" });

    await generateLeadSummary(params);

    const config = mockGenerateResponse.mock.calls[0][2];
    expect(config?.temperature).toBe(0.3);
    expect(config?.maxTokens).toBe(256);
    expect(config?.responseFormat).toBe("text");
  });
});
