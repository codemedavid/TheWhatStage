import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock cookie-domain module
vi.mock("@/lib/supabase/cookie-domain", () => ({
  getCookieDomain: () => ".lvh.me",
}));

describe("tenant-cookie", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("TENANT_COOKIE_NAME", () => {
    it("exports the cookie name constant", async () => {
      const { TENANT_COOKIE_NAME } = await import("@/lib/auth/tenant-cookie");
      expect(TENANT_COOKIE_NAME).toBe("ws-tenant-slug");
    });
  });

  describe("tenantCookieOptions", () => {
    it("returns cookie options with shared domain", async () => {
      const { tenantCookieOptions } = await import("@/lib/auth/tenant-cookie");
      const opts = tenantCookieOptions();
      expect(opts).toEqual({
        path: "/",
        domain: ".lvh.me",
        sameSite: "lax" as const,
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    });
  });

  describe("serializeTenantCookie", () => {
    it("serializes the tenant slug cookie for document.cookie", async () => {
      const { serializeTenantCookie } = await import("@/lib/auth/tenant-cookie");

      expect(serializeTenantCookie("acme")).toBe(
        "ws-tenant-slug=acme; path=/; domain=.lvh.me; samesite=lax; max-age=2592000"
      );
    });
  });
});
