import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase clients
const mockGetUser = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();

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
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });

    const { GET } = await import("@/app/api/knowledge/docs/route");
    const response = await GET(new Request("http://localhost/api/knowledge/docs"));

    expect(response.status).toBe(401);
  });

  it("returns 403 when user has no tenant", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: {} } },
      error: null,
    });

    const { GET } = await import("@/app/api/knowledge/docs/route");
    const response = await GET(new Request("http://localhost/api/knowledge/docs"));

    expect(response.status).toBe(403);
  });

  it("returns docs list for authenticated tenant user", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { GET } = await import("@/app/api/knowledge/docs/route");
    const response = await GET(new Request("http://localhost/api/knowledge/docs"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.docs).toBeDefined();
    expect(Array.isArray(body.docs)).toBe(true);
  });
});
