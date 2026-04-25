import { getAppHost, getAppProtocol } from "@/lib/supabase/cookie-domain";

/**
 * After authentication, check if the user has a tenant and return
 * the redirect URL + tenant slug.
 *
 * Returns { path, slug } so the caller can set the tenant cookie
 * before redirecting. The slug is null when no tenant exists.
 *
 * Accepts an optional access token to pass as Authorization header.
 * This avoids a race condition where cookies set by signInWithPassword()
 * may not yet be available to the server on the immediate next request.
 */
export async function redirectAfterAuth(
  accessToken?: string
): Promise<{ path: string; slug: string | null }> {
  try {
    const headers: HeadersInit = {};
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const res = await fetch("/api/auth/tenant", { headers });

    if (!res.ok) {
      return { path: buildAppUrl("/onboarding"), slug: null };
    }

    const { tenant } = await res.json();

    if (tenant?.slug) {
      return { path: buildAppUrl("/app/leads"), slug: tenant.slug };
    }

    return { path: buildAppUrl("/onboarding"), slug: null };
  } catch {
    return { path: buildAppUrl("/onboarding"), slug: null };
  }
}

export function buildAppUrl(path: string): string {
  const host = getAppHost() ?? "lvh.me:3000";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getAppProtocol()}://${host}${normalizedPath}`;
}

export function buildTenantUrl(slug: string): string {
  const host = getAppHost() ?? "lvh.me:3000";
  return `${getAppProtocol()}://${slug}.${host}/app/leads`;
}
