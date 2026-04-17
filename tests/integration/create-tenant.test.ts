import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so the mock variables are available when vi.mock factories run
const { mockGetUser, mockRpc, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    rpc: mockRpc,
    from: mockFrom,
  })),
}));

import { POST } from "@/app/api/onboarding/create-tenant/route";

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/onboarding/create-tenant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: "Acme Corp",
  slug: "acme-corp",
  businessType: "ecommerce",
  botGoal: "qualify_leads",
};

describe("POST /api/onboarding/create-tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid input", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    const response = await POST(makeRequest({ name: "", slug: "!!", businessType: "invalid", botGoal: "invalid" }));
    expect(response.status).toBe(400);
  });

  it("returns 403 for reserved slugs", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    const response = await POST(makeRequest({ ...validBody, slug: "www" }));
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain("reserved");
  });

  it("returns 409 when user already owns a tenant", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { tenant_id: "existing-tenant" }, error: null }),
          }),
        }),
      }),
    });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toContain("already");
  });

  it("returns 201 on successful tenant creation", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    });
    mockRpc.mockResolvedValue({
      data: { id: "tenant-1", slug: "acme-corp" },
      error: null,
    });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.tenantId).toBe("tenant-1");
    expect(data.slug).toBe("acme-corp");
  });

  it("returns 500 when RPC fails", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "unique constraint", code: "23505" },
    });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(500);
  });
});
