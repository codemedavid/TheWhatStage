import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("redirectAfterAuth", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("returns /app/leads with tenant slug when user has tenant", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tenant: { id: "t1", slug: "acme" } }),
    });

    const { redirectAfterAuth } = await import("@/lib/auth/redirect");
    const result = await redirectAfterAuth("token123");

    expect(result).toEqual({ path: "/app/leads", slug: "acme" });
    expect(mockFetch).toHaveBeenCalledWith("/api/auth/tenant", {
      headers: { Authorization: "Bearer token123" },
    });
  });

  it("returns /onboarding with null slug when user has no tenant", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tenant: null }),
    });

    const { redirectAfterAuth } = await import("@/lib/auth/redirect");
    const result = await redirectAfterAuth("token");

    expect(result).toEqual({ path: "/onboarding", slug: null });
  });

  it("returns /onboarding with null slug on fetch error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network"));

    const { redirectAfterAuth } = await import("@/lib/auth/redirect");
    const result = await redirectAfterAuth();

    expect(result).toEqual({ path: "/onboarding", slug: null });
  });

  it("returns /onboarding with null slug on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const { redirectAfterAuth } = await import("@/lib/auth/redirect");
    const result = await redirectAfterAuth();

    expect(result).toEqual({ path: "/onboarding", slug: null });
  });
});
