import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ auth: { getUser: mockGetUser } })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

function authUser(userId = "u1") {
  mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
}

function noAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });
}

function membership(tenantId = "t1") {
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: { tenant_id: tenantId }, error: null }),
      }),
    }),
  });
}

describe("GET /api/bot/rules", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    noAuth();
    const { GET } = await import("@/app/api/bot/rules/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns rules list for authenticated tenant", async () => {
    authUser();
    membership();
    const fakeRules = [
      { id: "r1", rule_text: "Be polite", category: "tone", enabled: true, created_at: "2026-01-01" },
    ];
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: fakeRules, error: null }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/bot/rules/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rules).toHaveLength(1);
    expect(body.rules[0].id).toBe("r1");
  });
});

describe("POST /api/bot/rules", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    noAuth();
    const { POST } = await import("@/app/api/bot/rules/route");
    const res = await POST(new Request("http://localhost/api/bot/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule_text: "Be polite", category: "instruction" }),
    }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid category", async () => {
    authUser();
    membership();
    const { POST } = await import("@/app/api/bot/rules/route");
    const res = await POST(new Request("http://localhost/api/bot/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule_text: "Be polite", category: "invalid" }),
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when rule_text exceeds 500 chars", async () => {
    authUser();
    membership();
    const { POST } = await import("@/app/api/bot/rules/route");
    const res = await POST(new Request("http://localhost/api/bot/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule_text: "x".repeat(501), category: "instruction" }),
    }));
    expect(res.status).toBe(400);
  });

  it("creates rule and maps category correctly", async () => {
    authUser();
    membership();

    // Count check mock
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
      }),
    });

    // Insert mock
    const mockInsertFn = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "r1", rule_text: "Be polite", category: "behavior", enabled: true, created_at: "2026-01-01" },
          error: null,
        }),
      }),
    });
    mockFrom.mockReturnValueOnce({ insert: mockInsertFn });

    const { POST } = await import("@/app/api/bot/rules/route");
    const res = await POST(new Request("http://localhost/api/bot/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule_text: "Be polite", category: "instruction" }),
    }));

    expect(res.status).toBe(201);
    expect(mockInsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ category: "behavior" })
    );
  });
});
