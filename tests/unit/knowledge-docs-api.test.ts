import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSession } from "@/lib/auth/session";

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

const mockResolveSession = vi.mocked(resolveSession);

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() =>
            Promise.resolve({
              data: [
                {
                  id: "doc-1",
                  title: "Test PDF",
                  type: "pdf",
                  status: "ready",
                  metadata: {},
                  created_at: "2026-01-01T00:00:00Z",
                },
              ],
              error: null,
            })
          ),
        })),
      })),
    })),
  })),
}));

describe("GET /api/knowledge/docs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveSession.mockResolvedValue(null);

    const { GET } = await import("@/app/api/knowledge/docs/route");
    const response = await GET(new Request("http://localhost/api/knowledge/docs"));

    expect(response.status).toBe(401);
  });

  it("returns docs list for authenticated tenant user", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const { GET } = await import("@/app/api/knowledge/docs/route");
    const response = await GET(new Request("http://localhost/api/knowledge/docs"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.docs).toBeDefined();
    expect(Array.isArray(body.docs)).toBe(true);
  });
});
