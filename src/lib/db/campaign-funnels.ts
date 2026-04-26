// src/lib/db/campaign-funnels.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { CampaignFunnel, CampaignFunnelInput } from "@/types/campaign-funnel";

type ServiceClient = SupabaseClient<Database>;

function toDomain(row: any): CampaignFunnel {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    tenantId: row.tenant_id,
    position: row.position,
    actionPageId: row.action_page_id,
    pageDescription: row.page_description,
    chatRules: row.chat_rules ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listFunnelsForCampaign(
  service: ServiceClient,
  campaignId: string
): Promise<CampaignFunnel[]> {
  const { data, error } = await service
    .from("campaign_funnels")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("position", { ascending: true });

  if (error) throw new Error(`Failed to load funnels: ${error.message}`);
  return (data ?? []).map(toDomain);
}

export async function saveFunnelsForCampaign(
  service: ServiceClient,
  tenantId: string,
  campaignId: string,
  funnels: CampaignFunnelInput[]
): Promise<CampaignFunnel[]> {
  if (funnels.length < 1) throw new Error("Campaign needs at least 1 funnel");
  if (funnels.length > 3) throw new Error("Campaign can have at most 3 funnels");

  const { error: deleteError } = await service
    .from("campaign_funnels")
    .delete()
    .eq("campaign_id", campaignId);
  if (deleteError) throw new Error(`Failed to clear funnels: ${deleteError.message}`);

  const rows = funnels.map((f, i) => ({
    campaign_id: campaignId,
    tenant_id: tenantId,
    position: i,
    action_page_id: f.actionPageId,
    page_description: f.pageDescription,
    chat_rules: f.chatRules,
  }));

  const { data, error } = await service.from("campaign_funnels").insert(rows).select("*");
  if (error) throw new Error(`Failed to save funnels: ${error.message}`);
  return (data ?? []).map(toDomain);
}
