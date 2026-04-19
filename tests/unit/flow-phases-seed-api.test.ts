import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSession } from "@/lib/auth/session";

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

const mockResolveSession = vi.mocked(resolveSession);
const mockSeedPhaseTemplates = vi.fn();

vi.mock("@/lib/ai/phase-templates", () => ({
  seedPhaseTemplates: mockSeedPhaseTemplates,
}));

describe("POST /api/bot/phases/seed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveSession.mockResolvedValue(null);

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
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });
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
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

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
