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
                { id: "img1", url: "https://res.cloudinary.com/demo/img1.jpg", description: "Office photo", tags: ["office"] },
                { id: "img2", url: "https://res.cloudinary.com/demo/img2.jpg", description: "Product shot", tags: ["product"] },
              ],
              error: null,
            })
          ),
        })),
      })),
    })),
  })),
}));

describe("GET /api/knowledge/images/list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveSession.mockResolvedValue(null);

    const { GET } = await import("@/app/api/knowledge/images/list/route");
    const response = await GET(new Request("http://localhost/api/knowledge/images/list"));

    expect(response.status).toBe(401);
  });

  it("returns knowledge images list", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const { GET } = await import("@/app/api/knowledge/images/list/route");
    const response = await GET(new Request("http://localhost/api/knowledge/images/list"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.images).toHaveLength(2);
    expect(body.images[0].description).toBe("Office photo");
  });
});
