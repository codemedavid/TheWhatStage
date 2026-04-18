import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant/context";
import type { Database } from "@/types/database";

type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
type Stage = Database["public"]["Tables"]["stages"]["Row"];

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
}

/**
 * Get authenticated tenant context. Cached per request.
 * Returns null if not in a tenant context.
 */
export const requireTenantContext = cache(
  async (): Promise<TenantContext> => {
    const ctx = await getTenantContext();
    if (!ctx) throw new Error("No tenant context");
    return ctx;
  }
);

/**
 * Fetch tenant record. Cached per request — safe to call from
 * layout, page, and components without duplicate queries.
 */
export const getTenant = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenants")
    .select(
      "id, name, slug, business_type, bot_goal, fb_page_id, fb_page_token, fb_app_secret, fb_verify_token, created_at"
    )
    .eq("id", tenantId)
    .single();
  return data as Tenant | null;
});

/**
 * Fetch pipeline stages ordered by position. Cached per request.
 */
export const getStages = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stages")
    .select("id, tenant_id, name, order_index, color")
    .eq("tenant_id", tenantId)
    .order("order_index");
  return (data ?? []) as Stage[];
});

/**
 * Fetch tenant members. Cached per request.
 */
export const getTenantMembers = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_members")
    .select("tenant_id, user_id, role, created_at")
    .eq("tenant_id", tenantId);
  return (data ?? []) as Database["public"]["Tables"]["tenant_members"]["Row"][];
});
