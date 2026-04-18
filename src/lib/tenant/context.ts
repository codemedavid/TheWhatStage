import { headers } from "next/headers";

/**
 * Read the tenant context set by middleware.
 * Only available in Server Components / Route Handlers.
 */
export async function getTenantContext(): Promise<{
  tenantId: string;
  tenantSlug: string;
} | null> {
  const headersList = await headers();
  const tenantId = headersList.get("x-tenant-id");
  const tenantSlug = headersList.get("x-tenant-slug");

  if (!tenantId || !tenantSlug) return null;
  return { tenantId, tenantSlug };
}
