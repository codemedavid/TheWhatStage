import { createServiceClient } from "@/lib/supabase/service";

export interface CurrentPhase {
  conversationPhaseId: string;
  phaseId: string;
  name: string;
  orderIndex: number;
  maxMessages: number;
  systemPrompt: string;
  tone: string;
  goals: string | null;
  transitionHint: string | null;
  actionButtonIds: string[] | null;
  messageCount: number;
}

interface CampaignPhaseRow {
  id: string;
  name: string;
  order_index: number;
  max_messages: number;
  system_prompt: string;
  tone: string;
  goals: string | null;
  transition_hint: string | null;
  action_button_ids: string[] | null;
}

interface ConversationPhaseWithJoin {
  id: string;
  phase_id: string;
  message_count: number;
  campaign_phases: CampaignPhaseRow;
}

function mapToCurrentPhase(
  conversationPhaseId: string,
  messageCount: number,
  phase: CampaignPhaseRow
): CurrentPhase {
  return {
    conversationPhaseId,
    phaseId: phase.id,
    name: phase.name,
    orderIndex: phase.order_index,
    maxMessages: phase.max_messages,
    systemPrompt: phase.system_prompt,
    tone: phase.tone,
    goals: phase.goals,
    transitionHint: phase.transition_hint,
    actionButtonIds: phase.action_button_ids,
    messageCount,
  };
}

export async function getCurrentPhase(
  conversationId: string,
  campaignId: string
): Promise<CurrentPhase> {
  const supabase = createServiceClient();

  const { data: existingRaw, error } = await supabase
    .from("conversation_phases")
    .select("id, phase_id, message_count, campaign_phases(*)")
    .eq("conversation_id", conversationId)
    .is("exited_at", null)
    .order("entered_at", { ascending: false })
    .limit(1)
    .single();

  const existing = existingRaw as ConversationPhaseWithJoin | null;

  if (!error && existing) {
    return mapToCurrentPhase(
      existing.id,
      existing.message_count,
      existing.campaign_phases
    );
  }

  const { data: firstPhaseRaw } = await supabase
    .from("campaign_phases")
    .select("id, name, order_index, max_messages, system_prompt, tone, goals, transition_hint, action_button_ids")
    .eq("campaign_id", campaignId)
    .order("order_index", { ascending: true })
    .limit(1)
    .single();

  const firstPhase = firstPhaseRaw as CampaignPhaseRow | null;

  if (!firstPhase) {
    throw new Error("No campaign phases configured");
  }

  const { data: insertedRaw } = await supabase
    .from("conversation_phases")
    .insert({ conversation_id: conversationId, phase_id: firstPhase.id, message_count: 0 })
    .select("id, phase_id, message_count")
    .single();

  const inserted = insertedRaw as { id: string; phase_id: string; message_count: number } | null;

  if (!inserted) {
    throw new Error("Failed to insert initial conversation phase");
  }

  return mapToCurrentPhase(inserted.id, inserted.message_count, firstPhase);
}

export async function advancePhase(
  conversationId: string,
  campaignId: string
): Promise<CurrentPhase> {
  const supabase = createServiceClient();

  const current = await getCurrentPhase(conversationId, campaignId);

  await supabase
    .from("conversation_phases")
    .update({
      exited_at: new Date().toISOString(),
      exit_reason: "advanced",
    })
    .eq("id", current.conversationPhaseId);

  const { data: nextPhaseRaw } = await supabase
    .from("campaign_phases")
    .select("id, name, order_index, max_messages, system_prompt, tone, goals, transition_hint, action_button_ids")
    .eq("campaign_id", campaignId)
    .gt("order_index", current.orderIndex)
    .order("order_index", { ascending: true })
    .limit(1)
    .single();

  const nextPhase = nextPhaseRaw as CampaignPhaseRow | null;

  if (!nextPhase) {
    await supabase
      .from("conversation_phases")
      .update({ exited_at: null, exit_reason: null })
      .eq("id", current.conversationPhaseId);
    return current;
  }

  const { data: insertedNextRaw } = await supabase
    .from("conversation_phases")
    .insert({ conversation_id: conversationId, phase_id: nextPhase.id, message_count: 0 })
    .select("id, phase_id, message_count")
    .single();

  const insertedNext = insertedNextRaw as { id: string; phase_id: string; message_count: number } | null;

  if (!insertedNext) {
    throw new Error("Failed to insert next conversation phase");
  }

  return mapToCurrentPhase(insertedNext.id, insertedNext.message_count, nextPhase);
}

export async function exitPhase(
  conversationPhaseId: string,
  reason: "converted" | "dropped" | "human_handoff"
): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("conversation_phases")
    .update({
      exited_at: new Date().toISOString(),
      exit_reason: reason,
    })
    .eq("id", conversationPhaseId);
}

export async function incrementMessageCount(
  conversationPhaseId: string
): Promise<void> {
  const supabase = createServiceClient();
  const { data: current } = await supabase
    .from("conversation_phases")
    .select("message_count")
    .eq("id", conversationPhaseId)
    .single();

  if (current) {
    await supabase
      .from("conversation_phases")
      .update({ message_count: current.message_count + 1 })
      .eq("id", conversationPhaseId);
  }
}
