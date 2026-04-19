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

export async function getOrAssignCampaign(
  leadId: string,
  tenantId: string
): Promise<string> {
  const supabase = createServiceClient();

  // Check for existing assignment
  const { data: existing } = await supabase
    .from("lead_campaign_assignments")
    .select("campaign_id")
    .eq("lead_id", leadId)
    .single();

  if (existing) return existing.campaign_id;

  // Check for running experiment
  const { data: experiment } = await supabase
    .from("experiments")
    .select("id, experiment_campaigns(campaign_id, weight)")
    .eq("tenant_id", tenantId)
    .eq("status", "running")
    .limit(1)
    .single();

  let campaignId: string;

  if (experiment?.experiment_campaigns?.length > 0) {
    campaignId = weightedRandomCampaign(experiment.experiment_campaigns);
  } else {
    // Assign to primary campaign
    const { data: primary } = await supabase
      .from("campaigns")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_primary", true)
      .single();

    if (!primary) {
      throw new Error("No primary campaign configured for tenant");
    }

    campaignId = primary.id;
  }

  // Insert permanent assignment
  await supabase.from("lead_campaign_assignments").insert({
    lead_id: leadId,
    campaign_id: campaignId,
  });

  return campaignId;
}
