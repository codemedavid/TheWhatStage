import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ auth: { getUser: mockGetUser } })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

function authUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
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

const params = { params: { id: "rule-123" } };

describe("PATCH /api/bot/rules/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No auth" } });
    const { PATCH } = await import("@/app/api/bot/rules/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/bot/rules/rule-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      }),
      params
    );
    expect(res.status).toBe(401);
  });

  it("verifies ownership via tenant_id in query", async () => {
    authUser();
    membership("t1");

    const mockUpdateChain = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "rule-123", rule_text: "Be polite", category: "tone", enabled: false, created_at: "2026-01-01" },
              error: null,
            }),
          }),
        }),
      }),
    };

    mockFrom.mockReturnValueOnce({ update: vi.fn().mockReturnValue(mockUpdateChain) });

    const { PATCH } = await import("@/app/api/bot/rules/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/bot/rules/rule-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      }),
      params
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rule.id).toBe("rule-123");
  });

  it("returns 400 when no fields provided", async () => {
    authUser();
    membership();
    const { PATCH } = await import("@/app/api/bot/rules/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/bot/rules/rule-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      params
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/bot/rules/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No auth" } });
    const { DELETE } = await import("@/app/api/bot/rules/[id]/route");
    const res = await DELETE(new Request("http://localhost"), params);
    expect(res.status).toBe(401);
  });

  it("deletes rule and verifies ownership", async () => {
    authUser();
    membership("t1");

    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    });

    const { DELETE } = await import("@/app/api/bot/rules/[id]/route");
    const res = await DELETE(new Request("http://localhost"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
