import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ActionPage = Database["public"]["Tables"]["action_pages"]["Row"];

/**
 * Fetch action pages for a tenant. Cached per request.
 */
export const getActionPages = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("action_pages")
    .select(
      "id, tenant_id, slug, type, title, config, published, version, created_at"
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  return (data ?? []) as ActionPage[];
});

/**
 * Count action pages. Not cached.
 */
export async function countActionPages(tenantId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("action_pages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  return count ?? 0;
}
