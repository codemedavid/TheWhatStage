/**
 * After authentication, check if the user has a tenant and redirect accordingly.
 * - Has tenant → redirect to tenant subdomain dashboard
 * - No tenant → redirect to /onboarding
 */
export async function redirectAfterAuth(): Promise<string> {
  const res = await fetch("/api/auth/tenant");

  if (!res.ok) {
    return "/onboarding";
  }

  const { tenant } = await res.json();

  if (tenant?.slug) {
    return buildTenantUrl(tenant.slug);
  }

  return "/onboarding";
}

export function buildTenantUrl(slug: string): string {
  const domain = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "lvh.me:3000";
  const protocol = domain.includes("localhost") || domain.includes("lvh.me") ? "http" : "https";
  return `${protocol}://${slug}.${domain}/app/leads`;
}
