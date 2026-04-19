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

const params = Promise.resolve({ id: "camp-1" });

describe("GET /api/campaigns/[id]/phases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns phases for a campaign", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const phases = [
      { id: "p1", name: "Greet", order_index: 0, campaign_id: "camp-1" },
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: phases, error: null }),
          }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/campaigns/[id]/phases/route");
    const req = new Request("http://localhost/api/campaigns/camp-1/phases");
    const res = await GET(req, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.phases).toHaveLength(1);
  });
});

describe("POST /api/campaigns/[id]/phases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("creates a phase for the campaign", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const newPhase = { id: "p-new", name: "New Phase", campaign_id: "camp-1" };
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: newPhase, error: null }),
        }),
      }),
    });

    const { POST } = await import("@/app/api/campaigns/[id]/phases/route");
    const req = new Request("http://localhost/api/campaigns/camp-1/phases", {
      method: "POST",
      body: JSON.stringify({
        name: "New Phase",
        order_index: 0,
        system_prompt: "Hello",
      }),
    });
    const res = await POST(req, { params });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.phase.name).toBe("New Phase");
  });
});
