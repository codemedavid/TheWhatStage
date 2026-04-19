import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSession } from "@/lib/auth/session";

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

const mockResolveSession = vi.mocked(resolveSession);

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
    mockResolveSession.mockResolvedValue(null);

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
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

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
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

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
