import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Workflow = Database["public"]["Tables"]["workflows"]["Row"];

/**
 * Fetch workflows for a tenant. Cached per request.
 */
export const getWorkflows = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workflows")
    .select("id, tenant_id, name, trigger, enabled, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  return (data ?? []) as Workflow[];
});
