import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Lead = Database["public"]["Tables"]["leads"]["Row"];
type LeadEvent = Database["public"]["Tables"]["lead_events"]["Row"];

/**
 * Fetch leads for a tenant. Cached per request.
 */
export const getLeads = cache(async (tenantId: string, limit = 200) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select(
      "id, tenant_id, psid, fb_name, fb_profile_pic, stage_id, tags, created_at, last_active_at"
    )
    .eq("tenant_id", tenantId)
    .order("last_active_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Lead[];
});

/**
 * Fetch recent lead events. Cached per request.
 */
export const getLeadEvents = cache(
  async (tenantId: string, limit = 20) => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("lead_events")
      .select("id, tenant_id, lead_id, type, payload, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as LeadEvent[];
  }
);

/**
 * Count leads matching a filter. Not cached (cheap count query).
 */
export async function countLeads(tenantId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  return count ?? 0;
}
