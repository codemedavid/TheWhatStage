import { getCookieDomain } from "@/lib/supabase/cookie-domain";

export const TENANT_COOKIE_NAME = "ws-tenant-slug";

/**
 * Cookie options for the tenant slug cookie.
 * Uses the shared domain so it's readable from both
 * main domain and tenant subdomains.
 */
export function tenantCookieOptions() {
  return {
    path: "/",
    domain: getCookieDomain(),
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  };
}
