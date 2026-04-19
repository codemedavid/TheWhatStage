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

describe("GET /api/experiments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });
    const { GET } = await import("@/app/api/experiments/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns experiments list", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [{ id: "exp-1", name: "Test", status: "running" }],
            error: null,
          }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/experiments/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.experiments).toHaveLength(1);
  });
});

describe("POST /api/experiments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("creates an experiment with campaign variants", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const experiment = { id: "exp-new", name: "A/B Test", status: "draft" };
    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: experiment, error: null }),
            }),
          }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const { POST } = await import("@/app/api/experiments/route");
    const req = new Request("http://localhost/api/experiments", {
      method: "POST",
      body: JSON.stringify({
        name: "A/B Test",
        campaigns: [
          { campaign_id: "c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1", weight: 50 },
          { campaign_id: "c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2", weight: 50 },
        ],
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.experiment.name).toBe("A/B Test");
  });
});
