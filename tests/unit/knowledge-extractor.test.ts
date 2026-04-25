import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockGenerateResponse = vi.fn();
vi.mock("@/lib/ai/llm-client", () => ({
  generateResponse: mockGenerateResponse,
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

// Let key-normalizer run as real implementation (passthrough for known keys)
// so tests verify the normalisation contract

// --- Helpers ---

function buildUpsertChain() {
  const chain = {
    upsert: vi.fn().mockResolvedValue({ error: null }),
  };
  return chain;
}

function buildUpdateChain() {
  const eqInner = vi.fn().mockResolvedValue({ error: null });
  const eqOuter = vi.fn(() => ({ eq: eqInner }));
  const update = vi.fn(() => ({ eq: eqOuter }));
  return { update, eqOuter, eqInner };
}

function llmResult(json: object) {
  return { content: JSON.stringify(json), finishReason: "stop" };
}

// --- Tests ---

describe("extractKnowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("upserts knowledge entries into lead_knowledge when the LLM extracts facts", async () => {
    const knowledgeChain = buildUpsertChain();
    mockFrom.mockReturnValue(knowledgeChain);

    mockGenerateResponse.mockResolvedValueOnce(
      llmResult({
        knowledge: [{ key: "budget", value: "$5,000/month" }],
        contacts: [],
        first_name: null,
        last_name: null,
      })
    );

    const { extractKnowledge } = await import("@/lib/leads/knowledge-extractor");

    await extractKnowledge({
      tenantId: "tenant-1",
      leadId: "lead-1",
      messageText: "My budget is $5,000/month.",
      messageId: "msg-abc",
    });

    expect(mockFrom).toHaveBeenCalledWith("lead_knowledge");
    expect(knowledgeChain.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tenant_id: "tenant-1",
          lead_id: "lead-1",
          key: "budget",
          value: "$5,000/month",
          source: "ai_extracted",
          extracted_from: "msg-abc",
        }),
      ]),
      { onConflict: "tenant_id,lead_id,key" }
    );
  });

  it("normalises the key using normalizeKey before upserting", async () => {
    const knowledgeChain = buildUpsertChain();
    mockFrom.mockReturnValue(knowledgeChain);

    mockGenerateResponse.mockResolvedValueOnce(
      llmResult({
        knowledge: [{ key: "Budget Range", value: "$10k" }],
        contacts: [],
        first_name: null,
        last_name: null,
      })
    );

    const { extractKnowledge } = await import("@/lib/leads/knowledge-extractor");

    await extractKnowledge({
      tenantId: "t1",
      leadId: "l1",
      messageText: "My budget range is $10k",
      messageId: null,
    });

    const upsertedRows = knowledgeChain.upsert.mock.calls[0][0];
    expect(upsertedRows[0].key).toBe("budget"); // normalised from "Budget Range"
  });

  it("upserts contacts into lead_contacts when the LLM extracts phone/email", async () => {
    const contactsChain = buildUpsertChain();

    mockFrom.mockImplementation((table: string) => {
      if (table === "lead_contacts") return contactsChain;
      return buildUpsertChain();
    });

    mockGenerateResponse.mockResolvedValueOnce(
      llmResult({
        knowledge: [],
        contacts: [
          { type: "phone", value: "+1-555-0100" },
          { type: "email", value: "jane@example.com" },
        ],
        first_name: null,
        last_name: null,
      })
    );

    const { extractKnowledge } = await import("@/lib/leads/knowledge-extractor");

    await extractKnowledge({
      tenantId: "tenant-2",
      leadId: "lead-2",
      messageText: "Call me at +1-555-0100 or email jane@example.com",
      messageId: "msg-xyz",
    });

    expect(mockFrom).toHaveBeenCalledWith("lead_contacts");
    expect(contactsChain.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tenant_id: "tenant-2",
          lead_id: "lead-2",
          type: "phone",
          value: "+1-555-0100",
          source: "ai_extracted",
          is_primary: false,
        }),
        expect.objectContaining({
          type: "email",
          value: "jane@example.com",
        }),
      ]),
      { onConflict: "tenant_id,lead_id,type,value" }
    );
  });

  it("updates leads table when first_name is extracted", async () => {
    const { update, eqOuter, eqInner } = buildUpdateChain();

    mockFrom.mockImplementation((table: string) => {
      if (table === "leads") return { update };
      return buildUpsertChain();
    });

    mockGenerateResponse.mockResolvedValueOnce(
      llmResult({
        knowledge: [],
        contacts: [],
        first_name: "Alice",
        last_name: null,
      })
    );

    const { extractKnowledge } = await import("@/lib/leads/knowledge-extractor");

    await extractKnowledge({
      tenantId: "tenant-3",
      leadId: "lead-3",
      messageText: "Hi, I'm Alice",
      messageId: null,
    });

    expect(mockFrom).toHaveBeenCalledWith("leads");
    expect(update).toHaveBeenCalledWith({ first_name: "Alice" });
    expect(eqOuter).toHaveBeenCalledWith("id", "lead-3");
    expect(eqInner).toHaveBeenCalledWith("tenant_id", "tenant-3");
  });

  it("updates leads table when both first_name and last_name are extracted", async () => {
    const { update, eqOuter, eqInner } = buildUpdateChain();

    mockFrom.mockImplementation((table: string) => {
      if (table === "leads") return { update };
      return buildUpsertChain();
    });

    mockGenerateResponse.mockResolvedValueOnce(
      llmResult({
        knowledge: [],
        contacts: [],
        first_name: "Bob",
        last_name: "Smith",
      })
    );

    const { extractKnowledge } = await import("@/lib/leads/knowledge-extractor");

    await extractKnowledge({
      tenantId: "tenant-4",
      leadId: "lead-4",
      messageText: "My name is Bob Smith",
      messageId: null,
    });

    expect(update).toHaveBeenCalledWith({ first_name: "Bob", last_name: "Smith" });
    expect(eqOuter).toHaveBeenCalledWith("id", "lead-4");
    expect(eqInner).toHaveBeenCalledWith("tenant_id", "tenant-4");
  });

  it("does not call any Supabase tables when the LLM returns empty results", async () => {
    mockGenerateResponse.mockResolvedValueOnce(
      llmResult({
        knowledge: [],
        contacts: [],
        first_name: null,
        last_name: null,
      })
    );

    const { extractKnowledge } = await import("@/lib/leads/knowledge-extractor");

    await extractKnowledge({
      tenantId: "tenant-5",
      leadId: "lead-5",
      messageText: "ok",
      messageId: null,
    });

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("does not throw when the LLM call fails (best-effort)", async () => {
    mockGenerateResponse.mockRejectedValueOnce(new Error("LLM unavailable"));

    const { extractKnowledge } = await import("@/lib/leads/knowledge-extractor");

    await expect(
      extractKnowledge({
        tenantId: "tenant-6",
        leadId: "lead-6",
        messageText: "Hello",
        messageId: null,
      })
    ).resolves.toBeUndefined();

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("does not throw when the LLM returns malformed JSON", async () => {
    mockGenerateResponse.mockResolvedValueOnce({
      content: "This is not valid JSON }{",
      finishReason: "stop",
    });

    const { extractKnowledge } = await import("@/lib/leads/knowledge-extractor");

    await expect(
      extractKnowledge({
        tenantId: "tenant-7",
        leadId: "lead-7",
        messageText: "Hello",
        messageId: "msg-bad",
      })
    ).resolves.toBeUndefined();

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("calls generateResponse with correct LLM config", async () => {
    mockGenerateResponse.mockResolvedValueOnce(
      llmResult({ knowledge: [], contacts: [], first_name: null, last_name: null })
    );

    const { extractKnowledge } = await import("@/lib/leads/knowledge-extractor");

    await extractKnowledge({
      tenantId: "t",
      leadId: "l",
      messageText: "test message",
      messageId: null,
    });

    expect(mockGenerateResponse).toHaveBeenCalledWith(
      expect.any(String), // EXTRACTION_PROMPT
      "test message",
      { temperature: 0.1, maxTokens: 256, responseFormat: "json_object" }
    );
  });
});
