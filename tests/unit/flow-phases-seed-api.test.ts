import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockSeedPhaseTemplates = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
}));

vi.mock("@/lib/ai/phase-templates", () => ({
  seedPhaseTemplates: mockSeedPhaseTemplates,
}));

describe("POST /api/bot/phases/seed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });

    const { POST } = await import("@/app/api/bot/phases/seed/route");
    const response = await POST(
      new Request("http://localhost/api/bot/phases/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_type: "services" }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("seeds phases from template", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });
    mockSeedPhaseTemplates.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/bot/phases/seed/route");
    const response = await POST(
      new Request("http://localhost/api/bot/phases/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_type: "services" }),
      })
    );

    expect(response.status).toBe(201);
    expect(mockSeedPhaseTemplates).toHaveBeenCalledWith("t1", "services");
  });

  it("returns 400 for invalid business type", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { POST } = await import("@/app/api/bot/phases/seed/route");
    const response = await POST(
      new Request("http://localhost/api/bot/phases/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_type: "invalid_type" }),
      })
    );

    expect(response.status).toBe(400);
  });
});
