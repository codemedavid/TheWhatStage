import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

type ActionPageField = Database["public"]["Tables"]["action_page_fields"]["Row"];

/**
 * Fetch all fields for an action page, ordered by order_index.
 */
export async function getActionPageFields(
  tenantId: string,
  actionPageId: string
): Promise<ActionPageField[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("action_page_fields")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("action_page_id", actionPageId)
    .order("order_index", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ActionPageField[];
}

/**
 * Bulk replace all fields for an action page.
 * Deletes existing fields and inserts new ones in a single transaction.
 */
export async function replaceActionPageFields(
  tenantId: string,
  actionPageId: string,
  fields: Array<{
    label: string;
    field_key: string;
    field_type: string;
    placeholder?: string;
    required: boolean;
    options?: unknown;
    order_index: number;
    lead_mapping?: unknown;
  }>
): Promise<ActionPageField[]> {
  const supabase = createServiceClient();

  // Delete existing fields
  await supabase
    .from("action_page_fields")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("action_page_id", actionPageId);

  if (fields.length === 0) return [];

  // Insert new fields
  const rows = fields.map((f) => ({
    tenant_id: tenantId,
    action_page_id: actionPageId,
    label: f.label,
    field_key: f.field_key,
    field_type: f.field_type,
    placeholder: f.placeholder ?? null,
    required: f.required,
    options: f.options ?? null,
    order_index: f.order_index,
    lead_mapping: f.lead_mapping ?? null,
  }));

  const { data, error } = await supabase
    .from("action_page_fields")
    .insert(rows)
    .select("*");

  if (error) throw error;
  return (data ?? []) as ActionPageField[];
}
