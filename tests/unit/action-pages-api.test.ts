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
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() =>
            Promise.resolve({
              data: [
                { id: "ap1", title: "Book a Call", type: "calendar", slug: "book-call" },
                { id: "ap2", title: "Contact Form", type: "form", slug: "contact" },
              ],
              error: null,
            })
          ),
        })),
      })),
    })),
  })),
}));

describe("GET /api/bot/action-pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });

    const { GET } = await import("@/app/api/bot/action-pages/route");
    const response = await GET(new Request("http://localhost/api/bot/action-pages"));

    expect(response.status).toBe(401);
  });

  it("returns action pages list", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { GET } = await import("@/app/api/bot/action-pages/route");
    const response = await GET(new Request("http://localhost/api/bot/action-pages"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.actionPages).toHaveLength(2);
    expect(body.actionPages[0].title).toBe("Book a Call");
  });
});
