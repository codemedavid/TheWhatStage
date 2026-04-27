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

describe("GET /api/campaigns/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/campaigns/[id]/route");
    const req = new Request("http://localhost/api/campaigns/camp-1");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns campaign details", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

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
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

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

  it("updates campaign rules", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: "camp-1",
                campaign_rules: ["Always mention the free consultation"],
              },
              error: null,
            }),
          }),
        }),
      }),
    });
    mockFrom.mockReturnValue({ update });

    const { PATCH } = await import("@/app/api/campaigns/[id]/route");
    const req = new Request("http://localhost/api/campaigns/camp-1", {
      method: "PATCH",
      body: JSON.stringify({
        campaign_rules: ["Always mention the free consultation"],
      }),
    });
    const res = await PATCH(req, { params });

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        campaign_rules: ["Always mention the free consultation"],
      })
    );
  });

  it("updates campaign main goal and optional personality override", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: "camp-1",
                main_goal: "Book qualified calls for agency owners.",
                campaign_personality: "Direct, expert, low-fluff.",
              },
              error: null,
            }),
          }),
        }),
      }),
    });
    mockFrom.mockReturnValue({ update });

    const { PATCH } = await import("@/app/api/campaigns/[id]/route");
    const req = new Request("http://localhost/api/campaigns/camp-1", {
      method: "PATCH",
      body: JSON.stringify({
        main_goal: "Book qualified calls for agency owners.",
        campaign_personality: "Direct, expert, low-fluff.",
      }),
    });
    const res = await PATCH(req, { params });

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        main_goal: "Book qualified calls for agency owners.",
        campaign_personality: "Direct, expert, low-fluff.",
      })
    );
  });
});

describe("DELETE /api/campaigns/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("deletes a campaign", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

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
