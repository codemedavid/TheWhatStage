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

// ─── GET /api/leads/[id]/stage-history ────────────────────────────────────────

describe("GET /api/leads/[id]/stage-history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/leads/[id]/stage-history/route");
    const req = new Request("http://localhost/api/leads/lead-1/stage-history");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns stage history when authenticated", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const history = [
      {
        id: "hist-1",
        lead_id: "lead-1",
        tenant_id: "t1",
        from_stage: "new",
        to_stage: "contacted",
        created_at: "2026-04-24T10:00:00Z",
      },
      {
        id: "hist-2",
        lead_id: "lead-1",
        tenant_id: "t1",
        from_stage: "contacted",
        to_stage: "qualified",
        created_at: "2026-04-25T09:00:00Z",
      },
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: history, error: null }),
            }),
          }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/leads/[id]/stage-history/route");
    const req = new Request("http://localhost/api/leads/lead-1/stage-history");
    const res = await GET(req, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stageHistory).toHaveLength(2);
    expect(body.stageHistory[0].to_stage).toBe("contacted");
    expect(body.stageHistory[1].to_stage).toBe("qualified");
  });

  it("returns 500 when database query fails", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
            }),
          }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/leads/[id]/stage-history/route");
    const req = new Request("http://localhost/api/leads/lead-1/stage-history");
    const res = await GET(req, { params });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Failed to fetch stage history");
  });
});
