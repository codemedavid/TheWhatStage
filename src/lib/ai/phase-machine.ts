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

interface BotFlowPhaseRow {
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
  bot_flow_phases: BotFlowPhaseRow;
}

function mapToCurrentPhase(
  conversationPhaseId: string,
  messageCount: number,
  phase: BotFlowPhaseRow
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
  tenantId: string
): Promise<CurrentPhase> {
  const supabase = createServiceClient();

  // Try to find the most recent conversation_phase
  const { data: existing, error } = await (supabase
    .from("conversation_phases")
    .select("id, phase_id, message_count, bot_flow_phases(*)")
    .eq("conversation_id", conversationId)
    .order("entered_at", { ascending: false })
    .limit(1)
    .single() as Promise<{ data: ConversationPhaseWithJoin | null; error: { code?: string } | null }>);

  if (!error && existing) {
    return mapToCurrentPhase(
      existing.id,
      existing.message_count,
      existing.bot_flow_phases
    );
  }

  // No existing phase — initialize with first phase (order_index = 0)
  const { data: firstPhase } = await (supabase
    .from("bot_flow_phases")
    .select("id, name, order_index, max_messages, system_prompt, tone, goals, transition_hint, action_button_ids")
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: true })
    .limit(1)
    .single() as Promise<{ data: BotFlowPhaseRow | null; error: unknown }>);

  if (!firstPhase) {
    throw new Error(`No bot flow phases found for tenant ${tenantId}`);
  }

  const { data: inserted } = await (supabase
    .from("conversation_phases")
    .insert({ conversation_id: conversationId, phase_id: firstPhase.id, message_count: 0 })
    .select("id, phase_id, message_count")
    .single() as Promise<{ data: { id: string; phase_id: string; message_count: number } | null; error: unknown }>);

  if (!inserted) {
    throw new Error("Failed to insert initial conversation phase");
  }

  return mapToCurrentPhase(inserted.id, inserted.message_count, firstPhase);
}

export async function advancePhase(
  conversationId: string,
  tenantId: string
): Promise<CurrentPhase> {
  const supabase = createServiceClient();

  const current = await getCurrentPhase(conversationId, tenantId);

  // Find the next phase by order_index (gt + order asc + limit 1)
  const { data: nextPhase } = await (supabase
    .from("bot_flow_phases")
    .select("id, name, order_index, max_messages, system_prompt, tone, goals, transition_hint, action_button_ids")
    .eq("tenant_id", tenantId)
    .gt("order_index", current.orderIndex)
    .order("order_index", { ascending: true })
    .limit(1)
    .single() as Promise<{ data: BotFlowPhaseRow | null; error: unknown }>);

  // Already on the last phase — return unchanged
  if (!nextPhase) {
    return current;
  }

  // Insert a new conversation_phases row for the next phase
  const { data: inserted } = await (supabase
    .from("conversation_phases")
    .insert({ conversation_id: conversationId, phase_id: nextPhase.id, message_count: 0 })
    .select("id, phase_id, message_count")
    .single() as Promise<{ data: { id: string; phase_id: string; message_count: number } | null; error: unknown }>);

  if (!inserted) {
    throw new Error("Failed to insert next conversation phase");
  }

  return mapToCurrentPhase(inserted.id, inserted.message_count, nextPhase);
}

export async function incrementMessageCount(
  conversationPhaseId: string
): Promise<void> {
  const supabase = createServiceClient();

  const { data } = await (supabase
    .from("conversation_phases")
    .select("message_count")
    .eq("id", conversationPhaseId)
    .single() as Promise<{ data: { message_count: number } | null; error: unknown }>);

  if (!data) {
    throw new Error(`Conversation phase ${conversationPhaseId} not found`);
  }

  await supabase
    .from("conversation_phases")
    .update({ message_count: data.message_count + 1 })
    .eq("id", conversationPhaseId);
}
