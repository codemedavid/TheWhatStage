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

const params = Promise.resolve({ id: "exp-1" });

describe("POST /api/experiments/[id]/promote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 400 when no winner_campaign_id provided", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { POST } = await import("@/app/api/experiments/[id]/promote/route");
    const req = new Request("http://localhost/api/experiments/exp-1/promote", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });
});
