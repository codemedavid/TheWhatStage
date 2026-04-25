import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSession } from "@/lib/auth/session";

const mockFrom = vi.fn();
const mockResolveSession = vi.mocked(resolveSession);

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/lib/leads/key-normalizer", () => ({
  normalizeKey: vi.fn((key: string) => key.trim().toLowerCase()),
}));

const params = Promise.resolve({ id: "lead-1" });
const knowledgeParams = Promise.resolve({ id: "lead-1", knowledgeId: "knowledge-1" });

// ─── GET /api/leads/[id]/knowledge ────────────────────────────────────────────

describe("GET /api/leads/[id]/knowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/leads/[id]/knowledge/route");
    const req = new Request("http://localhost/api/leads/lead-1/knowledge");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns knowledge when authenticated", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const knowledge = [
      { id: "k-1", lead_id: "lead-1", tenant_id: "t1", key: "budget", value: "$5000" },
      { id: "k-2", lead_id: "lead-1", tenant_id: "t1", key: "intent", value: "buy now" },
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: knowledge, error: null }),
          }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/leads/[id]/knowledge/route");
    const req = new Request("http://localhost/api/leads/lead-1/knowledge");
    const res = await GET(req, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.knowledge).toHaveLength(2);
    expect(body.knowledge[0].key).toBe("budget");
  });
});

// ─── POST /api/leads/[id]/knowledge ───────────────────────────────────────────

describe("POST /api/leads/[id]/knowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 400 on missing key", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const { POST } = await import("@/app/api/leads/[id]/knowledge/route");
    const req = new Request("http://localhost/api/leads/lead-1/knowledge", {
      method: "POST",
      body: JSON.stringify({ value: "some value" }), // key is missing
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });

  it("accepts a valid knowledge entry", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const created = {
      id: "k-3",
      lead_id: "lead-1",
      tenant_id: "t1",
      key: "budget",
      value: "$10,000",
      source: "manual",
    };

    mockFrom.mockReturnValue({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: created, error: null }),
        }),
      }),
    });

    const { POST } = await import("@/app/api/leads/[id]/knowledge/route");
    const req = new Request("http://localhost/api/leads/lead-1/knowledge", {
      method: "POST",
      body: JSON.stringify({ key: "budget", value: "$10,000" }),
    });
    const res = await POST(req, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.knowledge.key).toBe("budget");
    expect(body.knowledge.value).toBe("$10,000");
  });

  it("normalizes the key before upserting", async () => {
    const { normalizeKey } = await import("@/lib/leads/key-normalizer");
    const mockNormalizeKey = vi.mocked(normalizeKey);

    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const created = {
      id: "k-4",
      lead_id: "lead-1",
      tenant_id: "t1",
      key: "budget",
      value: "tight",
      source: "manual",
    };

    mockFrom.mockReturnValue({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: created, error: null }),
        }),
      }),
    });

    const { POST } = await import("@/app/api/leads/[id]/knowledge/route");
    const req = new Request("http://localhost/api/leads/lead-1/knowledge", {
      method: "POST",
      body: JSON.stringify({ key: "Budget Range", value: "tight" }),
    });
    await POST(req, { params });

    expect(mockNormalizeKey).toHaveBeenCalledWith("Budget Range");
  });
});

// ─── DELETE /api/leads/[id]/knowledge/[knowledgeId] ───────────────────────────

describe("DELETE /api/leads/[id]/knowledge/[knowledgeId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const { DELETE } = await import("@/app/api/leads/[id]/knowledge/[knowledgeId]/route");
    const req = new Request("http://localhost/api/leads/lead-1/knowledge/knowledge-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: knowledgeParams });
    expect(res.status).toBe(401);
  });

  it("deletes a knowledge entry when authenticated", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    });

    const { DELETE } = await import("@/app/api/leads/[id]/knowledge/[knowledgeId]/route");
    const req = new Request("http://localhost/api/leads/lead-1/knowledge/knowledge-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: knowledgeParams });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
