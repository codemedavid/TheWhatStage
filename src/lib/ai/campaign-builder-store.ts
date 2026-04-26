import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type {
  CampaignBuilderTenantContext,
  CampaignGoal,
  CampaignPlan,
  GeneratedCampaignPhase,
  PhaseEditResponse,
} from "@/lib/ai/campaign-builder";

type ServiceClient = SupabaseClient<Database>;

async function countCampaignRows(
  service: ServiceClient,
  table: "lead_campaign_assignments" | "campaign_conversions",
  campaignId: string
) {
  const { count, error } = await service
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  if (error) throw new Error("Failed to check campaign activity");
  return count ?? 0;
}

async function assertDraftCampaignEditable(
  service: ServiceClient,
  tenantId: string,
  campaignId: string
) {
  const { data, error } = await service
    .from("campaigns")
    .select("id, status, is_primary")
    .eq("id", campaignId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !data) throw new Error("Campaign not found");
  if (data.is_primary || data.status !== "draft") {
    throw new Error("Only non-primary draft campaigns can be edited");
  }

  const [assignments, conversions] = await Promise.all([
    countCampaignRows(service, "lead_campaign_assignments", campaignId),
    countCampaignRows(service, "campaign_conversions", campaignId),
  ]);

  if (assignments > 0 || conversions > 0) {
    throw new Error("Draft campaign already has lead activity");
  }
}

export async function loadBuilderTenantContext(
  service: ServiceClient,
  tenantId: string
): Promise<CampaignBuilderTenantContext> {
  const { data: tenant, error } = await service
    .from("tenants")
    .select("name, business_type, bot_goal, business_description, main_action, differentiator, qualification_criteria")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) throw new Error("Tenant context not found");

  const { data: primary } = await service
    .from("campaigns")
    .select("id, name, description, goal")
    .eq("tenant_id", tenantId)
    .eq("is_primary", true)
    .maybeSingle();

  return {
    tenantName: tenant.name,
    businessType: tenant.business_type,
    botGoal: tenant.bot_goal,
    businessDescription: tenant.business_description,
    mainAction: tenant.main_action,
    differentiator: tenant.differentiator,
    qualificationCriteria: tenant.qualification_criteria,
    primaryCampaign: primary ?? null,
  };
}

// --- Plan persistence ---

export async function loadCampaignPlanForRevision(
  service: ServiceClient,
  tenantId: string,
  campaignId: string
): Promise<{ plan: CampaignPlan | null; rules: string[] }> {
  await assertDraftCampaignEditable(service, tenantId, campaignId);

  const { data, error } = await service
    .from("campaigns")
    .select("campaign_plan, campaign_rules")
    .eq("id", campaignId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !data) throw new Error("Campaign not found");

  return {
    plan: (data.campaign_plan as CampaignPlan | null) ?? null,
    rules: (data.campaign_rules ?? []) as string[],
  };
}

export async function saveCampaignPlan(
  service: ServiceClient,
  tenantId: string,
  input: {
    campaignId?: string;
    campaignName: string;
    campaignDescription: string;
    campaignGoal: CampaignGoal;
    plan: CampaignPlan;
    rules: string[];
  }
) {
  if (input.campaignId) {
    await assertDraftCampaignEditable(service, tenantId, input.campaignId);

    const { data, error } = await service
      .from("campaigns")
      .update({
        name: input.campaignName,
        description: input.campaignDescription,
        goal: input.campaignGoal,
        campaign_plan: input.plan,
        campaign_rules: input.rules,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.campaignId)
      .eq("tenant_id", tenantId)
      .select("id, name, status")
      .single();

    if (error || !data) throw new Error("Failed to update campaign plan");
    return data;
  }

  const { data, error } = await service
    .from("campaigns")
    .insert({
      tenant_id: tenantId,
      name: input.campaignName,
      description: input.campaignDescription,
      goal: input.campaignGoal,
      campaign_plan: input.plan,
      campaign_rules: input.rules,
      is_primary: false,
      status: "draft",
    })
    .select("id, name, status")
    .single();

  if (error || !data) throw new Error("Failed to create campaign with plan");
  return data;
}

// --- Phase generation persistence ---

export async function loadCampaignForPhaseGen(
  service: ServiceClient,
  tenantId: string,
  campaignId: string
): Promise<{ plan: CampaignPlan; rules: string[] }> {
  const { data, error } = await service
    .from("campaigns")
    .select("id, campaign_plan, campaign_rules, status, is_primary")
    .eq("id", campaignId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !data) throw new Error("Campaign not found");
  if (data.is_primary) throw new Error("Cannot generate phases for primary campaign");
  if (!data.campaign_plan) throw new Error("No campaign plan found");
  await assertDraftCampaignEditable(service, tenantId, campaignId);

  return {
    plan: data.campaign_plan as CampaignPlan,
    rules: (data.campaign_rules ?? []) as string[],
  };
}

function phaseRows(tenantId: string, campaignId: string, phases: GeneratedCampaignPhase[]) {
  return phases.map((phase, index) => ({
    campaign_id: campaignId,
    tenant_id: tenantId,
    name: phase.name,
    order_index: index,
    max_messages: phase.max_messages,
    system_prompt: phase.system_prompt,
    tone: phase.tone,
    goals: phase.goals,
    transition_hint: phase.transition_hint,
    action_button_ids: [],
    image_attachment_ids: [],
  }));
}

export async function saveGeneratedPhases(
  service: ServiceClient,
  tenantId: string,
  campaignId: string,
  phases: GeneratedCampaignPhase[]
) {
  await assertDraftCampaignEditable(service, tenantId, campaignId);

  const { error: deleteError } = await service
    .from("campaign_phases")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("tenant_id", tenantId);

  if (deleteError) throw new Error("Failed to clear existing phases");

  const { error: insertError } = await service
    .from("campaign_phases")
    .insert(phaseRows(tenantId, campaignId, phases));

  if (insertError) throw new Error("Failed to save generated phases");
}

// --- Phase edit persistence ---

export async function loadCampaignForPhaseEdit(
  service: ServiceClient,
  tenantId: string,
  campaignId: string
): Promise<{ plan: CampaignPlan; rules: string[]; phases: GeneratedCampaignPhase[] }> {
  const { plan, rules } = await loadCampaignForPhaseGen(service, tenantId, campaignId);

  const { data: phaseData, error } = await service
    .from("campaign_phases")
    .select("name, order_index, max_messages, system_prompt, tone, goals, transition_hint")
    .eq("campaign_id", campaignId)
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: true });

  if (error) throw new Error("Failed to load phases");

  const phases: GeneratedCampaignPhase[] = (phaseData ?? []).map((p) => ({
    name: p.name,
    order_index: p.order_index,
    max_messages: p.max_messages,
    system_prompt: p.system_prompt,
    tone: p.tone ?? "friendly and helpful",
    goals: p.goals ?? "",
    transition_hint: p.transition_hint ?? "",
  }));

  return { plan, rules, phases };
}

export async function applyPhaseEdit(
  service: ServiceClient,
  tenantId: string,
  campaignId: string,
  editResult: PhaseEditResponse
) {
  await assertDraftCampaignEditable(service, tenantId, campaignId);

  const { error: deleteError } = await service
    .from("campaign_phases")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("tenant_id", tenantId);

  if (deleteError) throw new Error("Failed to clear phases for edit");

  const { error: insertError } = await service
    .from("campaign_phases")
    .insert(phaseRows(tenantId, campaignId, editResult.phases));

  if (insertError) throw new Error("Failed to save edited phases");

  if (editResult.rulesUpdate) {
    const { error: rulesError } = await service
      .from("campaigns")
      .update({ campaign_rules: editResult.rulesUpdate, updated_at: new Date().toISOString() })
      .eq("id", campaignId)
      .eq("tenant_id", tenantId);

    if (rulesError) throw new Error("Failed to update campaign rules");
  }
}
