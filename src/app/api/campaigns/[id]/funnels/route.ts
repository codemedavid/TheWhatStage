import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import {
  listFunnelsForCampaign,
  saveFunnelsForCampaign,
} from "@/lib/db/campaign-funnels";
import type { ActionPageType } from "@/lib/ai/funnel-templates";
import type { AvailablePage } from "@/lib/ai/funnel-builder";

const funnelSchema = z.object({
  actionPageId: z.string().min(1),
  pageDescription: z.string().max(2000).nullable(),
  pitch: z.string().max(1000).nullable().default(null),
  qualificationQuestions: z.array(z.string().min(1).max(300)).max(8).default([]),
  chatRules: z.array(z.string().min(1).max(500)).min(1).max(20),
});

const bodySchema = z.object({
  funnels: z.array(funnelSchema).min(1).max(3),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const service = createServiceClient();

  const { data: campaign, error: campaignError } = await service
    .from("campaigns")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const funnels = await listFunnelsForCampaign(service, id);

  const { data: pages } = await service
    .from("action_pages")
    .select("id, type, title")
    .eq("tenant_id", session.tenantId)
    .eq("published", true);

  const availablePages: AvailablePage[] = (pages ?? []).map((p) => ({
    id: p.id,
    type: p.type as ActionPageType,
    title: p.title,
  }));

  return NextResponse.json({ funnels, availablePages });
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: campaign, error: campaignError } = await service
    .from("campaigns")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const pageIds = body.funnels.map((f) => f.actionPageId);
  const { data: pages, error: pagesError } = await service
    .from("action_pages")
    .select("id, tenant_id")
    .in("id", pageIds)
    .eq("tenant_id", session.tenantId);

  if (pagesError) {
    return NextResponse.json({ error: pagesError.message }, { status: 500 });
  }
  if ((pages ?? []).length !== new Set(pageIds).size) {
    return NextResponse.json(
      { error: "One or more action pages not found or do not belong to this tenant" },
      { status: 400 }
    );
  }

  try {
    const funnels = await saveFunnelsForCampaign(
      service,
      session.tenantId,
      id,
      body.funnels
    );
    return NextResponse.json({ funnels });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save funnels";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
