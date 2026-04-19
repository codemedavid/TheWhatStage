import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ auth: { getUser: mockGetUser } })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
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

import { retrieveKnowledge } from "@/lib/ai/retriever";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import { generateResponse } from "@/lib/ai/llm-client";
import { parseDecision } from "@/lib/ai/decision-parser";

const mockRetrieve = vi.mocked(retrieveKnowledge);
const mockBuildPrompt = vi.mocked(buildSystemPrompt);
const mockGenerate = vi.mocked(generateResponse);
const mockParse = vi.mocked(parseDecision);

function authUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
}

function membership(tenantId = "t1", businessName = "Acme") {
  // tenant_members lookup
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { tenant_id: tenantId },
          error: null,
        }),
      }),
    }),
  });
  // tenants lookup for businessName
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { name: businessName },
          error: null,
        }),
      }),
    }),
  });
}

const makeRequest = (message = "What are your hours?") =>
  new Request("http://localhost/api/bot/test-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

describe("POST /api/bot/test-chat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });
    const { POST } = await import("@/app/api/bot/test-chat/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 when message exceeds 500 chars", async () => {
    authUser();
    membership();
    const { POST } = await import("@/app/api/bot/test-chat/route");
    const res = await POST(makeRequest("x".repeat(501)));
    expect(res.status).toBe(400);
  });

  it("returns 400 when message is empty", async () => {
    authUser();
    membership();
    const { POST } = await import("@/app/api/bot/test-chat/route");
    const res = await POST(makeRequest(""));
    expect(res.status).toBe(400);
  });

  it("calls retrieveKnowledge and returns reply with reasoning data", async () => {
    authUser();
    membership("t1", "Acme Corp");

    const fakeChunks = [{ id: "c1", content: "We are open 9-5.", similarity: 0.88, metadata: {} }];
    mockRetrieve.mockResolvedValue({
      status: "success",
      chunks: fakeChunks,
      queryTarget: "general",
      retrievalPass: 1,
    });
    mockBuildPrompt.mockResolvedValue("system prompt here");
    mockGenerate.mockResolvedValue({
      content: '{"message":"We are open 9-5.","phase_action":"stay","confidence":0.9,"image_ids":[],"cited_chunks":[1]}',
      finishReason: "stop",
    });
    mockParse.mockReturnValue({
      message: "We are open 9-5.",
      phaseAction: "stay",
      confidence: 0.9,
      imageIds: [],
    });

    const { POST } = await import("@/app/api/bot/test-chat/route");
    const res = await POST(makeRequest("What are your hours?"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe("We are open 9-5.");
    expect(body.confidence).toBeCloseTo(0.9);
    expect(body.chunks).toHaveLength(1);
    expect(body.chunks[0].content).toBe("We are open 9-5.");
    expect(body.queryTarget).toBe("general");
    expect(body.retrievalPass).toBe(1);
  });

  it("calls buildSystemPrompt with testMode: true", async () => {
    authUser();
    membership();
    mockRetrieve.mockResolvedValue({ status: "success", chunks: [], queryTarget: "general", retrievalPass: 1 });
    mockBuildPrompt.mockResolvedValue("prompt");
    mockGenerate.mockResolvedValue({ content: '{"message":"ok","phase_action":"stay","confidence":0.5,"image_ids":[],"cited_chunks":[]}', finishReason: "stop" });
    mockParse.mockReturnValue({ message: "ok", phaseAction: "stay", confidence: 0.5, imageIds: [] });

    const { POST } = await import("@/app/api/bot/test-chat/route");
    await POST(makeRequest());

    expect(mockBuildPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ testMode: true })
    );
  });
});
