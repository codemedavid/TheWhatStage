import { createServiceClient } from "@/lib/supabase/service";

export interface MoveStageParams {
  tenantId: string;
  leadId: string;
  fromStageId: string | null;
  toStageId: string;
  reason: string;
  actorType: "ai" | "agent" | "automation";
  actorId: string | null;
}

export async function moveLeadToStage(params: MoveStageParams): Promise<void> {
  const { tenantId, leadId, fromStageId, toStageId, reason, actorType, actorId } = params;
  const supabase = createServiceClient();

  // Look up the previous stage history entry to compute duration
  let durationSeconds: number | null = null;

  const { data: previousEntry } = await supabase
    .from("lead_stage_history")
    .select("created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousEntry?.created_at) {
    const previousTime = new Date(previousEntry.created_at).getTime();
    durationSeconds = Math.round((Date.now() - previousTime) / 1000);
  }

  // Insert new stage history entry
  await supabase.from("lead_stage_history").insert({
    tenant_id: tenantId,
    lead_id: leadId,
    from_stage_id: fromStageId,
    to_stage_id: toStageId,
    reason,
    actor_type: actorType,
    actor_id: actorId,
    duration_seconds: durationSeconds,
  });

  // Update the lead's current stage
  await supabase
    .from("leads")
    .update({ stage_id: toStageId })
    .eq("id", leadId)
    .eq("tenant_id", tenantId);
}
