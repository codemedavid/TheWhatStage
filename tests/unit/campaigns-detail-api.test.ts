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

const params = Promise.resolve({ id: "camp-1" });

describe("GET /api/campaigns/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });
    const { GET } = await import("@/app/api/campaigns/[id]/route");
    const req = new Request("http://localhost/api/campaigns/camp-1");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns campaign details", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const campaign = { id: "camp-1", name: "Main", tenant_id: "t1" };
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
          }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/campaigns/[id]/route");
    const req = new Request("http://localhost/api/campaigns/camp-1");
    const res = await GET(req, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.campaign.name).toBe("Main");
  });
});

describe("PATCH /api/campaigns/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("updates campaign fields", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const updated = { id: "camp-1", name: "Updated Name", status: "active" };
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: updated, error: null }),
            }),
          }),
        }),
      }),
    });

    const { PATCH } = await import("@/app/api/campaigns/[id]/route");
    const req = new Request("http://localhost/api/campaigns/camp-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated Name", status: "active" }),
    });
    const res = await PATCH(req, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.campaign.name).toBe("Updated Name");
  });
});

describe("DELETE /api/campaigns/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("deletes a campaign", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    });

    const { DELETE } = await import("@/app/api/campaigns/[id]/route");
    const req = new Request("http://localhost/api/campaigns/camp-1", { method: "DELETE" });
    const res = await DELETE(req, { params });
    expect(res.status).toBe(200);
  });
});
