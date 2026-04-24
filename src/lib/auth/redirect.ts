/**
 * After authentication, check if the user has a tenant and return
 * the redirect path + tenant slug.
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
      return { path: "/onboarding", slug: null };
    }

    const { tenant } = await res.json();

    if (tenant?.slug) {
      return { path: "/app/leads", slug: tenant.slug };
    }

    return { path: "/onboarding", slug: null };
  } catch {
    return { path: "/onboarding", slug: null };
  }
}

export function buildTenantUrl(slug: string): string {
  const domain = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "lvh.me:3000";
  const protocol = domain.includes("localhost") || domain.includes("lvh.me") ? "http" : "https";
  return `${protocol}://${slug}.${domain}/app/leads`;
}
