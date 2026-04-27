import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null })) },
  })),
}));

const fromMock = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: fromMock }),
}));

vi.mock("@/lib/ai/retriever", () => ({
  retrieveKnowledge: vi.fn(async () => ({ chunks: [], queryTarget: "kb", retrievalPass: 1 })),
}));

vi.mock("@/lib/ai/prompt-builder", () => ({
  buildSystemPrompt: vi.fn(async () => "SYSTEM_PROMPT"),
}));

vi.mock("@/lib/ai/llm-client", () => ({
  generateResponse: vi.fn(async () => ({ content: JSON.stringify({ message: "hi", phase_action: "stay", confidence: 0.9, image_ids: [], cited_chunks: [] }) })),
}));

vi.mock("@/lib/ai/decision-parser", () => ({
  parseDecision: (raw: string) => {
    const j = JSON.parse(raw);
    return { message: j.message, phaseAction: j.phase_action, confidence: j.confidence, imageIds: j.image_ids, citedChunks: j.cited_chunks, actionButtonId: undefined, ctaText: undefined };
  },
}));

import { POST } from "@/app/api/bot/test-chat/route";

beforeEach(() => {
  fromMock.mockReset();
});

function configureFrom(handlers: Record<string, () => unknown>) {
  fromMock.mockImplementation((table: string) => {
    if (!handlers[table]) throw new Error(`Unexpected table: ${table}`);
    return handlers[table]();
  });
}

describe("POST /api/bot/test-chat", () => {
  it("auto-seeds a 1-funnel session when no campaign is selected", async () => {
    configureFrom({
      tenant_members: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { tenant_id: "t1" } }) }),
      action_pages: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [{ id: "p1", type: "form", title: "Lead Form", published: true }], error: null }),
        in: vi.fn().mockReturnThis(),
      }),
      tenants: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { name: "Acme", persona_tone: "friendly" } }) }),
      bot_rules: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) }),
    });

    const req = new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi", sessionId: "s1", campaignId: null }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe("hi");
    expect(body.currentFunnel.total).toBe(1);
    expect(body.currentFunnel.pageType).toBe("form");
  });

  it("returns 400 when no campaign and no published action pages", async () => {
    configureFrom({
      tenant_members: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { tenant_id: "t1" } }) }),
      action_pages: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    const req = new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi", sessionId: "s2", campaignId: null }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("loads funnels for an explicit campaign", async () => {
    configureFrom({
      tenant_members: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { tenant_id: "t1" } }) }),
      campaign_funnels: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [
          { id: "f0", campaign_id: "c1", tenant_id: "t1", position: 0, action_page_id: "p1", page_description: null, chat_rules: ["r"], created_at: "n", updated_at: "n" },
        ], error: null }),
      }),
      action_pages: () => ({
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [{ id: "p1", title: "Sales", type: "sales" }], error: null }),
      }),
      campaigns: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { name: "C", description: "", goal: "purchase", campaign_rules: [] } }) }),
      tenants: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { name: "Acme", persona_tone: "friendly" } }) }),
      bot_rules: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) }),
    });
    const req = new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi", sessionId: "s3", campaignId: "00000000-0000-0000-0000-000000000001" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currentFunnel.pageTitle).toBe("Sales");
  });
});
