import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("redirectAfterAuth", () => {
  const originalDomain = process.env.NEXT_PUBLIC_APP_DOMAIN;

  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    process.env.NEXT_PUBLIC_APP_DOMAIN = originalDomain;
  });

  it("returns the main-domain dashboard URL with tenant slug when user has tenant", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tenant: { id: "t1", slug: "acme" } }),
    });

    const { redirectAfterAuth } = await import("@/lib/auth/redirect");
    const result = await redirectAfterAuth("token123");

    expect(result).toEqual({ path: "http://lvh.me:3000/app/leads", slug: "acme" });
    expect(mockFetch).toHaveBeenCalledWith("/api/auth/tenant", {
      headers: { Authorization: "Bearer token123" },
    });
  });

  it("returns the main-domain onboarding URL with null slug when user has no tenant", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tenant: null }),
    });

    const { redirectAfterAuth } = await import("@/lib/auth/redirect");
    const result = await redirectAfterAuth("token");

    expect(result).toEqual({ path: "http://lvh.me:3000/onboarding", slug: null });
  });

  it("returns the main-domain onboarding URL with null slug on fetch error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network"));

    const { redirectAfterAuth } = await import("@/lib/auth/redirect");
    const result = await redirectAfterAuth();

    expect(result).toEqual({ path: "http://lvh.me:3000/onboarding", slug: null });
  });

  it("returns the main-domain onboarding URL with null slug on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const { redirectAfterAuth } = await import("@/lib/auth/redirect");
    const result = await redirectAfterAuth();

    expect(result).toEqual({ path: "http://lvh.me:3000/onboarding", slug: null });
  });

  it("builds tenant URLs when NEXT_PUBLIC_APP_DOMAIN is a full URL", async () => {
    process.env.NEXT_PUBLIC_APP_DOMAIN = "https://pluckless-jonas-uninclinable.ngrok-free.dev";

    const { buildTenantUrl } = await import("@/lib/auth/redirect");

    expect(buildTenantUrl("acme")).toBe(
      "https://acme.pluckless-jonas-uninclinable.ngrok-free.dev/app/leads"
    );
  });

  it("keeps the lvh.me fallback on http when NEXT_PUBLIC_APP_DOMAIN is unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_DOMAIN;

    const { buildTenantUrl } = await import("@/lib/auth/redirect");

    expect(buildTenantUrl("acme")).toBe("http://acme.lvh.me:3000/app/leads");
  });
});
