// src/app/api/campaigns/ai-builder/save/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import { saveFunnelsForCampaign } from "@/lib/db/campaign-funnels";
import { deriveCampaignGoal } from "@/lib/ai/funnel-goal";
import { ACTION_PAGE_TYPES, type ActionPageType } from "@/lib/ai/funnel-templates";

const funnelSchema = z.object({
  actionPageId: z.string().min(1),
  pageDescription: z.string().max(2000).nullable(),
  chatRules: z.array(z.string().min(1).max(500)).min(1).max(20),
});

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  topLevelRules: z.array(z.string().min(1).max(300)).max(10).default([]),
  funnels: z.array(funnelSchema).min(1).max(3),
});

export async function POST(req: Request) {
  // Validate body first — allows 400 before touching auth
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Auth
  let session: { userId: string; tenantId: string };
  try {
    session = await requireTenantSession();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const service = createServiceClient();

  // Verify all action pages exist and belong to this tenant
  const pageIds = body.funnels.map((f) => f.actionPageId);
  const { data: pages, error: pagesError } = await service
    .from("action_pages")
    .select("id, type, tenant_id")
    .in("id", pageIds)
    .eq("tenant_id", session.tenantId);

  if (pagesError) {
    return NextResponse.json({ error: pagesError.message }, { status: 500 });
  }
  if ((pages ?? []).length !== pageIds.length) {
    return NextResponse.json(
      { error: "One or more action pages not found or do not belong to this tenant" },
      { status: 400 }
    );
  }

  // Derive goal from the LAST funnel's page type
  const lastFunnelPageId = body.funnels.at(-1)!.actionPageId;
  const lastPage = pages!.find((p) => p.id === lastFunnelPageId);
  if (!lastPage) {
    return NextResponse.json({ error: "Last funnel page missing" }, { status: 400 });
  }
  if (!ACTION_PAGE_TYPES.includes(lastPage.type as ActionPageType)) {
    return NextResponse.json(
      { error: `Unsupported page type: ${lastPage.type}` },
      { status: 400 }
    );
  }

  const goal = deriveCampaignGoal(lastPage.type as ActionPageType);

  // Insert campaign
  const { data: campaign, error: campaignError } = await service
    .from("campaigns")
    .insert({
      tenant_id: session.tenantId,
      name: body.name,
      description: body.description,
      goal,
      campaign_rules: body.topLevelRules,
      status: "draft",
    })
    .select("id")
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json(
      { error: campaignError?.message ?? "Failed to create campaign" },
      { status: 500 }
    );
  }

  // Save funnels
  try {
    await saveFunnelsForCampaign(service, session.tenantId, campaign.id, body.funnels);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save funnels";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ campaignId: campaign.id });
}
