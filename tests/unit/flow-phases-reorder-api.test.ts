import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      // For the ownership count check: select → eq → in
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() =>
            Promise.resolve({ count: 2, error: null })
          ),
        })),
      })),
      // For individual updates: update → eq → eq
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() =>
            Promise.resolve({ error: null })
          ),
        })),
      })),
    })),
  })),
}));

describe("POST /api/bot/phases/reorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });

    const { POST } = await import("@/app/api/bot/phases/reorder/route");
    const response = await POST(
      new Request("http://localhost/api/bot/phases/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: [] }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("reorders phases", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { POST } = await import("@/app/api/bot/phases/reorder/route");
    const response = await POST(
      new Request("http://localhost/api/bot/phases/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: [
            { id: "a0000000-0000-0000-0000-000000000001", order_index: 0 },
            { id: "a0000000-0000-0000-0000-000000000002", order_index: 1 },
          ],
        }),
      })
    );

    expect(response.status).toBe(200);
  });

  it("returns 400 for empty order array", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { POST } = await import("@/app/api/bot/phases/reorder/route");
    const response = await POST(
      new Request("http://localhost/api/bot/phases/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: [] }),
      })
    );

    expect(response.status).toBe(400);
  });
});
