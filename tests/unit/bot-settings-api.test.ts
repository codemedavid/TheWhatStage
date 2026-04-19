import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockMaybeSingle = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom.mockReturnValue({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          maybeSingle: mockMaybeSingle,
        }),
      }),
      update: mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue(Promise.resolve({ error: null })),
      }),
    }),
  })),
}));

describe("PATCH /api/bot/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "No session" },
    });

    const { PATCH } = await import("@/app/api/bot/settings/route");
    const response = await PATCH(
      new Request("http://localhost/api/bot/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handoff_timeout_hours: 6 }),
      })
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("updates handoff timeout successfully (value 6)", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });

    mockMaybeSingle.mockResolvedValue({
      data: { tenant_id: "t1", role: "admin" },
      error: null,
    });

    const { PATCH } = await import("@/app/api/bot/settings/route");
    const response = await PATCH(
      new Request("http://localhost/api/bot/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handoff_timeout_hours: 6 }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("rejects invalid timeout values (99)", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });

    const { PATCH } = await import("@/app/api/bot/settings/route");
    const response = await PATCH(
      new Request("http://localhost/api/bot/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handoff_timeout_hours: 99 }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid input");
  });

  it("accepts null for 'never' auto-resume", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });

    mockMaybeSingle.mockResolvedValue({
      data: { tenant_id: "t1", role: "admin" },
      error: null,
    });

    const { PATCH } = await import("@/app/api/bot/settings/route");
    const response = await PATCH(
      new Request("http://localhost/api/bot/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handoff_timeout_hours: null }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("returns 403 when user has no tenant membership", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });

    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const { PATCH } = await import("@/app/api/bot/settings/route");
    const response = await PATCH(
      new Request("http://localhost/api/bot/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handoff_timeout_hours: 6 }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("No tenant membership");
  });

  it("returns 400 when no fields to update", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });

    mockMaybeSingle.mockResolvedValue({
      data: { tenant_id: "t1", role: "admin" },
      error: null,
    });

    const { PATCH } = await import("@/app/api/bot/settings/route");
    const response = await PATCH(
      new Request("http://localhost/api/bot/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("No fields to update");
  });

  it("updates persona_tone successfully", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockMaybeSingle.mockResolvedValue({ data: { tenant_id: "t1", role: "admin" }, error: null });

    const { PATCH } = await import("@/app/api/bot/settings/route");
    const response = await PATCH(
      new Request("http://localhost/api/bot/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona_tone: "professional" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("rejects invalid persona_tone", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const { PATCH } = await import("@/app/api/bot/settings/route");
    const response = await PATCH(
      new Request("http://localhost/api/bot/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona_tone: "aggressive" }),
      })
    );

    expect(response.status).toBe(400);
  });

  it("rejects custom_instructions over 2000 chars", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const { PATCH } = await import("@/app/api/bot/settings/route");
    const response = await PATCH(
      new Request("http://localhost/api/bot/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_instructions: "x".repeat(2001) }),
      })
    );

    expect(response.status).toBe(400);
  });
});
