import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: draftCampaignId } = await context.params;
  const service = createServiceClient();

  const { data: draft, error: draftError } = await service
    .from("campaigns")
    .select("id, name, is_primary, status")
    .eq("id", draftCampaignId)
    .eq("tenant_id", session.tenantId)
    .single();

  if (draftError || !draft) {
    return NextResponse.json({ error: "Draft campaign not found" }, { status: 404 });
  }

  if (draft.is_primary) {
    return NextResponse.json({ error: "Primary campaign is already the control" }, { status: 400 });
  }

  const { data: primary, error: primaryError } = await service
    .from("campaigns")
    .select("id, name, is_primary, status")
    .eq("tenant_id", session.tenantId)
    .eq("is_primary", true)
    .single();

  if (primaryError || !primary) {
    return NextResponse.json({ error: "No primary campaign configured" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { error: activateError } = await service
    .from("campaigns")
    .update({ status: "active", updated_at: now })
    .eq("id", draftCampaignId)
    .eq("tenant_id", session.tenantId);

  if (activateError) {
    return NextResponse.json({ error: "Failed to activate draft campaign" }, { status: 500 });
  }

  const { data: experiment, error: experimentError } = await service
    .from("experiments")
    .insert({
      tenant_id: session.tenantId,
      name: `${primary.name} vs ${draft.name}`,
      status: "running",
      min_sample_size: 50,
      started_at: now,
    })
    .select("*")
    .single();

  if (experimentError || !experiment) {
    return NextResponse.json({ error: "Failed to create experiment" }, { status: 500 });
  }

  const { error: variantsError } = await service.from("experiment_campaigns").insert([
    { experiment_id: experiment.id, campaign_id: primary.id, weight: 50 },
    { experiment_id: experiment.id, campaign_id: draft.id, weight: 50 },
  ]);

  if (variantsError) {
    await service.from("experiments").delete().eq("id", experiment.id).eq("tenant_id", session.tenantId);
    return NextResponse.json({ error: "Failed to create experiment variants" }, { status: 500 });
  }

  return NextResponse.json({ experiment }, { status: 201 });
}
