import { createServiceClient } from "@/lib/supabase/service";

export function weightedRandomCampaign(
  variants: { campaign_id: string; weight: number }[]
): string {
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  let random = Math.random() * totalWeight;

  for (const variant of variants) {
    random -= variant.weight;
    if (random <= 0) return variant.campaign_id;
  }

  return variants[variants.length - 1].campaign_id;
}

// Postgres unique-violation SQLSTATE
const UNIQUE_VIOLATION = "23505";

export async function getOrAssignCampaign(
  leadId: string,
  tenantId: string
): Promise<string | null> {
  const supabase = createServiceClient();
  const log = (msg: string) =>
    console.log(`[campaign-assign] lead=${leadId} tenant=${tenantId} ${msg}`);

  log("start");

  // 1. Existing assignment? maybeSingle so 0 rows returns clean null.
  const { data: existing, error: existingError } = await supabase
    .from("lead_campaign_assignments")
    .select("campaign_id")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (existingError) {
    console.error(
      `[campaign-assign] lookup failed for lead ${leadId}: ${existingError.message} (code=${existingError.code})`
    );
  }

  if (existing) {
    log(`already assigned to ${existing.campaign_id}`);
    // Self-heal: backfill leads.campaign_id if it drifted (e.g. legacy rows
    // from before this column was being mirrored).
    await supabase
      .from("leads")
      .update({ campaign_id: existing.campaign_id })
      .eq("id", leadId)
      .is("campaign_id", null);
    return existing.campaign_id;
  }

  // 2. Pick a campaign: running experiment wins, else primary.
  const { data: experiment, error: expError } = await supabase
    .from("experiments")
    .select("id, experiment_campaigns(campaign_id, weight)")
    .eq("tenant_id", tenantId)
    .eq("status", "running")
    .limit(1)
    .maybeSingle();

  if (expError) {
    console.error(
      `[campaign-assign] experiment lookup failed: ${expError.message} (code=${expError.code})`
    );
  }

  let campaignId: string | null = null;

  if (experiment && experiment.experiment_campaigns?.length > 0) {
    campaignId = weightedRandomCampaign(experiment.experiment_campaigns);
    log(`picked via experiment ${experiment.id} -> ${campaignId}`);
  } else {
    // Fallback chain: explicit primary → oldest active campaign → oldest of any
    // status. This rescues legacy tenants whose campaigns were created before
    // the is_primary flag existed in the dashboard.
    const { data: primary, error: primaryError } = await supabase
      .from("campaigns")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_primary", true)
      .maybeSingle();

    if (primaryError) {
      console.error(
        `[campaign-assign] primary lookup failed: ${primaryError.message} (code=${primaryError.code})`
      );
    }

    if (primary) {
      campaignId = primary.id;
      log(`picked primary -> ${campaignId}`);
    } else {
      const { data: active } = await supabase
        .from("campaigns")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (active) {
        campaignId = active.id;
      } else {
        const { data: anyCampaign } = await supabase
          .from("campaigns")
          .select("id")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!anyCampaign) {
          console.warn(
            `No campaigns at all for tenant ${tenantId}; lead ${leadId} left unassigned`
          );
          return null;
        }
        campaignId = anyCampaign.id;
      }
    }
  }

  // 3. Persist. On race (concurrent webhooks for same new lead), the unique
  // constraint on (lead_id) causes the second insert to fail — re-read the
  // winning assignment instead of throwing.
  const { error: insertError } = await supabase
    .from("lead_campaign_assignments")
    .insert({ lead_id: leadId, campaign_id: campaignId });

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) {
      const { data: winner } = await supabase
        .from("lead_campaign_assignments")
        .select("campaign_id")
        .eq("lead_id", leadId)
        .maybeSingle();
      if (winner) {
        log(`race recovered -> ${winner.campaign_id}`);
        await supabase
          .from("leads")
          .update({ campaign_id: winner.campaign_id })
          .eq("id", leadId)
          .is("campaign_id", null);
        return winner.campaign_id;
      }
    }
    console.error(
      `[campaign-assign] failed to persist for lead ${leadId} -> campaign ${campaignId}: ${insertError.message} (code=${insertError.code})`
    );
    return null;
  }

  log(`persisted assignment -> ${campaignId}`);

  // Mirror to leads.campaign_id so dashboards and ad-hoc queries against the
  // leads table see the assignment too. lead_campaign_assignments remains the
  // source of truth.
  const { error: leadUpdateError } = await supabase
    .from("leads")
    .update({ campaign_id: campaignId })
    .eq("id", leadId);
  if (leadUpdateError) {
    console.warn(
      `[campaign-assign] mirror to leads.campaign_id failed: ${leadUpdateError.message} (code=${leadUpdateError.code})`
    );
  }

  // Best-effort activity log; if the enum migration hasn't shipped yet this
  // will fail silently rather than rolling back the assignment above.
  const { error: eventError } = await supabase.from("lead_events").insert({
    tenant_id: tenantId,
    lead_id: leadId,
    type: "campaign_assigned",
    payload: {
      campaign_id: campaignId,
      via_experiment: !!experiment && experiment.experiment_campaigns?.length > 0,
    },
  });
  if (eventError) {
    console.warn(
      `[campaign-assign] lead_events log failed (assignment still persisted): ${eventError.message} (code=${eventError.code})`
    );
  }

  return campaignId;
}
