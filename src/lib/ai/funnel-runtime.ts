// src/lib/ai/funnel-runtime.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { CampaignFunnel } from "@/types/campaign-funnel";

type ServiceClient = SupabaseClient<Database>;

export interface FunnelState {
  funnel: CampaignFunnel;
  position: number;
  messageCount: number;
}

interface ConversationFunnelRow {
  current_campaign_id: string | null;
  current_funnel_id: string | null;
  current_funnel_position: number;
  funnel_message_count: number;
}

async function loadConversationRow(
  service: ServiceClient,
  conversationId: string
): Promise<ConversationFunnelRow> {
  const { data, error } = await service
    .from("conversations")
    .select("current_campaign_id, current_funnel_id, current_funnel_position, funnel_message_count")
    .eq("id", conversationId)
    .single();
  if (error || !data) {
    throw new Error(`Failed to load conversation ${conversationId}: ${error?.message ?? "missing"}`);
  }
  return data as unknown as ConversationFunnelRow;
}

export async function getOrInitFunnelState(
  service: ServiceClient,
  conversationId: string,
  campaignId: string,
  funnels: CampaignFunnel[]
): Promise<FunnelState> {
  if (funnels.length === 0) throw new Error("Cannot init funnel state with empty funnels");
  const row = await loadConversationRow(service, conversationId);

  const sameCampaign = row.current_campaign_id === campaignId;
  const knownFunnel = funnels.find((f) => f.id === row.current_funnel_id);

  if (sameCampaign && knownFunnel) {
    return {
      funnel: knownFunnel,
      position: row.current_funnel_position,
      messageCount: row.funnel_message_count,
    };
  }

  const first = funnels[0];
  const { error: updateError } = await service
    .from("conversations")
    .update({
      current_campaign_id: campaignId,
      current_funnel_id: first.id,
      current_funnel_position: 0,
      funnel_message_count: 0,
    })
    .eq("id", conversationId);
  if (updateError) throw new Error(`Failed to update conversation ${conversationId}: ${updateError.message}`);

  return { funnel: first, position: 0, messageCount: 0 };
}

export async function advanceFunnel(
  service: ServiceClient,
  conversationId: string,
  funnels: CampaignFunnel[]
): Promise<{ funnel: CampaignFunnel; position: number; advanced: boolean; completed: boolean }> {
  const row = await loadConversationRow(service, conversationId);
  const currentIndex = funnels.findIndex((f) => f.id === row.current_funnel_id);
  if (currentIndex < 0) {
    throw new Error(`Current funnel ${row.current_funnel_id} not found in campaign funnels`);
  }

  if (currentIndex >= funnels.length - 1) {
    return { funnel: funnels[currentIndex], position: currentIndex, advanced: false, completed: true };
  }

  const next = funnels[currentIndex + 1];
  const { error } = await service
    .from("conversations")
    .update({
      current_funnel_id: next.id,
      current_funnel_position: currentIndex + 1,
      funnel_message_count: 0,
    })
    .eq("id", conversationId);
  if (error) throw new Error(`Failed to update conversation ${conversationId}: ${error.message}`);

  return { funnel: next, position: currentIndex + 1, advanced: true, completed: false };
}

export async function incrementFunnelMessageCount(
  service: ServiceClient,
  conversationId: string
): Promise<void> {
  const row = await loadConversationRow(service, conversationId);
  const { error } = await service
    .from("conversations")
    .update({ funnel_message_count: row.funnel_message_count + 1 })
    .eq("id", conversationId);
  if (error) throw new Error(`Failed to update conversation ${conversationId}: ${error.message}`);
}

export async function markFunnelCompletedByActionPage(
  service: ServiceClient,
  conversationId: string,
  actionPageId: string,
  funnels: CampaignFunnel[]
): Promise<{ advanced: boolean }> {
  const row = await loadConversationRow(service, conversationId);
  const current = funnels.find((f) => f.id === row.current_funnel_id);
  if (!current || current.actionPageId !== actionPageId) {
    return { advanced: false };
  }
  const result = await advanceFunnel(service, conversationId, funnels);
  return { advanced: result.advanced };
}
