import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mockGetUser } })
  ),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

describe("GET /api/campaigns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });
    const { GET } = await import("@/app/api/campaigns/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns campaigns list for tenant", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const campaigns = [
      { id: "c1", name: "Main", is_primary: true, status: "active", goal: "form_submit" },
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: campaigns, error: null }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/campaigns/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.campaigns).toHaveLength(1);
    expect(body.campaigns[0].name).toBe("Main");
  });
});

describe("POST /api/campaigns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("creates a campaign with valid data", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const newCampaign = { id: "c-new", name: "Test Campaign", goal: "purchase", status: "draft" };

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: newCampaign, error: null }),
        }),
      }),
    });

    const { POST } = await import("@/app/api/campaigns/route");
    const req = new Request("http://localhost/api/campaigns", {
      method: "POST",
      body: JSON.stringify({ name: "Test Campaign", goal: "purchase" }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.campaign.name).toBe("Test Campaign");
  });

  it("returns 400 for invalid goal", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { POST } = await import("@/app/api/campaigns/route");
    const req = new Request("http://localhost/api/campaigns", {
      method: "POST",
      body: JSON.stringify({ name: "Test", goal: "invalid_goal" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
