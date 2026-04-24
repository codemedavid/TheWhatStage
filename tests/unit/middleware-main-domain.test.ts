import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks ---

const mockResolveTenantBySlug = vi.fn();
const mockExtractSubdomain = vi.fn();

vi.mock("@/lib/tenant/resolve", () => ({
  extractSubdomain: (...args: unknown[]) => mockExtractSubdomain(...args),
  resolveTenantBySlug: (...args: unknown[]) =>
    mockResolveTenantBySlug(...args),
}));

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: vi.fn((_req, res) => res),
}));

vi.mock("@/lib/supabase/cookie-domain", () => ({
  getCookieDomain: () => ".lvh.me",
}));

const mockGetUser = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSingle = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mockMaybeSingle,
          single: mockSingle,
        }),
      }),
    }),
  }),
}));

describe("middleware — main domain /app/* resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves tenant from ws-tenant-slug cookie on main domain /app/* request", async () => {
    mockExtractSubdomain.mockReturnValue(null);
    mockResolveTenantBySlug.mockResolvedValue({
      id: "t1",
      slug: "acme",
      name: "Acme Corp",
    });

    const { middleware } = await import("@/middleware");
    const req = new NextRequest("http://lvh.me:3000/app/leads", {
      headers: { host: "lvh.me:3000" },
    });
    req.cookies.set("ws-tenant-slug", "acme");

    const res = await middleware(req);
    expect(mockResolveTenantBySlug).toHaveBeenCalledWith("acme");
    expect(res.status).toBe(200);
  });

  it("passes through non-/app paths on main domain without tenant resolution", async () => {
    mockExtractSubdomain.mockReturnValue(null);

    const { middleware } = await import("@/middleware");
    const req = new NextRequest("http://lvh.me:3000/login", {
      headers: { host: "lvh.me:3000" },
    });

    const res = await middleware(req);
    expect(mockResolveTenantBySlug).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("falls back to DB lookup when cookie slug is invalid", async () => {
    mockExtractSubdomain.mockReturnValue(null);
    // Cookie slug resolves to null (invalid)
    mockResolveTenantBySlug.mockResolvedValue(null);
    // No authenticated user
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { middleware } = await import("@/middleware");
    const req = new NextRequest("http://lvh.me:3000/app/leads", {
      headers: { host: "lvh.me:3000" },
    });
    req.cookies.set("ws-tenant-slug", "invalid-slug");

    const res = await middleware(req);
    expect(mockResolveTenantBySlug).toHaveBeenCalledWith("invalid-slug");
    // Should pass through (no user = layout handles redirect)
    expect(res.status).toBe(200);
  });

  it("redirects to /onboarding when user has no tenant membership", async () => {
    mockExtractSubdomain.mockReturnValue(null);
    // No cookie → falls to DB lookup
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockMaybeSingle.mockResolvedValue({ data: null });

    const { middleware } = await import("@/middleware");
    const req = new NextRequest("http://lvh.me:3000/app/leads", {
      headers: { host: "lvh.me:3000" },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/onboarding");
  });

  it("resolves tenant from DB and sets cookie when no cookie exists", async () => {
    mockExtractSubdomain.mockReturnValue(null);
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockMaybeSingle.mockResolvedValue({
      data: { tenant_id: "t1" },
    });
    mockSingle.mockResolvedValue({
      data: { id: "t1", slug: "acme", name: "Acme Corp" },
    });

    const { middleware } = await import("@/middleware");
    const req = new NextRequest("http://lvh.me:3000/app/leads", {
      headers: { host: "lvh.me:3000" },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    // Should set the tenant cookie
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("ws-tenant-slug=acme");
  });
});
