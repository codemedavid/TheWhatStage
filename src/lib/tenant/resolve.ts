import { createServiceClient } from "@/lib/supabase/service";
import { getAppHostname } from "@/lib/supabase/cookie-domain";
import type { Database } from "@/types/database";

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
}

type TenantRow = Database["public"]["Tables"]["tenants"]["Row"];

// Simple in-process cache — resets on cold start, acceptable for now
const cache = new Map<string, { tenant: TenantInfo | null; expiresAt: number }>();
const TTL_MS = 60_000; // 1 minute

export async function resolveTenantBySlug(slug: string): Promise<TenantInfo | null> {
  const now = Date.now();
  const cached = cache.get(slug);
  if (cached && cached.expiresAt > now) {
    return cached.tenant;
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .single();

  const row = data as Pick<TenantRow, "id" | "slug" | "name"> | null;
  const tenant: TenantInfo | null = row
    ? { id: row.id, slug: row.slug, name: row.name }
    : null;

  cache.set(slug, { tenant, expiresAt: now + TTL_MS });
  return tenant;
}

export function extractSubdomain(host: string): string | null {
  // Strip port
  const hostname = host.split(":")[0].toLowerCase();
  const configuredHostname = getAppHostname();
  const baseDomains = Array.from(
    new Set([configuredHostname, "whatstage.app", "lvh.me"].filter(Boolean))
  ) as string[];

  for (const baseDomain of baseDomains) {
    if (hostname === baseDomain) return null;

    const suffix = `.${baseDomain}`;
    if (!hostname.endsWith(suffix)) continue;

    const subdomain = hostname.slice(0, -suffix.length);
    if (subdomain && !subdomain.includes(".")) {
      return subdomain;
    }
  }

  return null;
}
