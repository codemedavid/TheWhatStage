import { createServiceClient } from "@/lib/supabase/service";

const GOAL_EVENT_MAP: Record<string, string> = {
  form_submit: "form_submit",
  appointment_booked: "appointment_booked",
  purchase: "purchase",
  stage_reached: "stage_changed",
};

export async function detectConversion(
  leadId: string,
  eventType: string,
  eventPayload: Record<string, unknown>
): Promise<boolean> {
  const supabase = createServiceClient();

  // Get lead's campaign assignment
  const { data: assignment } = await supabase
    .from("lead_campaign_assignments")
    .select("campaign_id")
    .eq("lead_id", leadId)
    .single();

  if (!assignment) return false;

  // Get campaign goal
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, goal, goal_config")
    .eq("id", assignment.campaign_id)
    .single();

  if (!campaign) return false;

  // Check if event matches campaign goal
  const expectedEvent = GOAL_EVENT_MAP[campaign.goal];
  if (eventType !== expectedEvent) return false;

  // For stage_reached, check that the target stage matches
  if (campaign.goal === "stage_reached") {
    const targetStageId = (campaign.goal_config as Record<string, unknown>)?.stage_id;
    if (targetStageId && eventPayload?.stage_id !== targetStageId) return false;
  }

  // Check if already converted (idempotent)
  const { data: existing } = await supabase
    .from("campaign_conversions")
    .select("id")
    .eq("campaign_id", campaign.id)
    .eq("lead_id", leadId)
    .single();

  if (existing) return false;

  // Record conversion
  await supabase.from("campaign_conversions").insert({
    campaign_id: campaign.id,
    lead_id: leadId,
    metadata: eventPayload,
  });

  // Find lead's active conversation and mark phase as converted
  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("lead_id", leadId)
    .limit(1)
    .single();

  if (conv) {
    await supabase
      .from("conversation_phases")
      .update({ exited_at: new Date().toISOString(), exit_reason: "converted" })
      .eq("conversation_id", conv.id)
      .is("exited_at", null);
  }

  return true;
}
