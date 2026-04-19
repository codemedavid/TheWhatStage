import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mockGetUser } })
  ),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

const params = Promise.resolve({ id: "camp-1" });

describe("GET /api/campaigns/[id]/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });
    const { GET } = await import("@/app/api/campaigns/[id]/metrics/route");
    const req = new Request("http://localhost/api/campaigns/camp-1/metrics");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });
});
