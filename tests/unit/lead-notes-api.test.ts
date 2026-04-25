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

const params = Promise.resolve({ id: "lead-1" });

// ─── GET /api/leads/[id]/notes ────────────────────────────────────────────────

describe("GET /api/leads/[id]/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/leads/[id]/notes/route");
    const req = new Request("http://localhost/api/leads/lead-1/notes");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns notes when authenticated", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const notes = [
      {
        id: "note-1",
        lead_id: "lead-1",
        tenant_id: "t1",
        type: "agent_note",
        content: "Lead showed strong interest",
        author_id: "u1",
        created_at: "2026-04-25T08:00:00Z",
      },
      {
        id: "note-2",
        lead_id: "lead-1",
        tenant_id: "t1",
        type: "ai_summary",
        content: "AI summary of conversation",
        author_id: null,
        created_at: "2026-04-24T20:00:00Z",
      },
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: notes, error: null }),
            }),
          }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/leads/[id]/notes/route");
    const req = new Request("http://localhost/api/leads/lead-1/notes");
    const res = await GET(req, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.notes).toHaveLength(2);
    expect(body.notes[0].type).toBe("agent_note");
    expect(body.notes[1].type).toBe("ai_summary");
  });
});

// ─── POST /api/leads/[id]/notes ───────────────────────────────────────────────

describe("POST /api/leads/[id]/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const { POST } = await import("@/app/api/leads/[id]/notes/route");
    const req = new Request("http://localhost/api/leads/lead-1/notes", {
      method: "POST",
      body: JSON.stringify({ content: "Some note" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 on empty content", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const { POST } = await import("@/app/api/leads/[id]/notes/route");
    const req = new Request("http://localhost/api/leads/lead-1/notes", {
      method: "POST",
      body: JSON.stringify({ content: "" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is missing", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const { POST } = await import("@/app/api/leads/[id]/notes/route");
    const req = new Request("http://localhost/api/leads/lead-1/notes", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when content exceeds 5000 characters", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const { POST } = await import("@/app/api/leads/[id]/notes/route");
    const req = new Request("http://localhost/api/leads/lead-1/notes", {
      method: "POST",
      body: JSON.stringify({ content: "a".repeat(5001) }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });

  it("accepts a valid note and returns 201", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const created = {
      id: "note-3",
      lead_id: "lead-1",
      tenant_id: "t1",
      type: "agent_note",
      content: "This lead is highly qualified",
      author_id: "u1",
      created_at: "2026-04-25T10:00:00Z",
    };

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: created, error: null }),
        }),
      }),
    });

    const { POST } = await import("@/app/api/leads/[id]/notes/route");
    const req = new Request("http://localhost/api/leads/lead-1/notes", {
      method: "POST",
      body: JSON.stringify({ content: "This lead is highly qualified" }),
    });
    const res = await POST(req, { params });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.note.content).toBe("This lead is highly qualified");
    expect(body.note.type).toBe("agent_note");
    expect(body.note.author_id).toBe("u1");
  });
});
