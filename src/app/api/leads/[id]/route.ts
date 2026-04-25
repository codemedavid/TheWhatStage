import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { moveLeadToStage } from "@/lib/leads/move-stage";
import { z } from "zod";

const updateSchema = z.object({
  first_name: z.string().max(100).nullable().optional(),
  last_name: z.string().max(100).nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  stage_id: z.string().uuid().optional(),
  stage_reason: z.string().min(1).max(500).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;
  const { id } = await context.params;
  const service = createServiceClient();

  const [leadResult, contactsResult, knowledgeResult, historyResult, notesResult] =
    await Promise.all([
      service.from("leads").select("*").eq("id", id).eq("tenant_id", tenantId).single(),
      service
        .from("lead_contacts")
        .select("*")
        .eq("lead_id", id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true }),
      service
        .from("lead_knowledge")
        .select("*")
        .eq("lead_id", id)
        .eq("tenant_id", tenantId)
        .order("key", { ascending: true }),
      service
        .from("lead_stage_history")
        .select("*")
        .eq("lead_id", id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50),
      service
        .from("lead_notes")
        .select("*")
        .eq("lead_id", id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  if (leadResult.error || !leadResult.data) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json({
    lead: leadResult.data,
    contacts: contactsResult.data ?? [],
    knowledge: knowledgeResult.data ?? [],
    stageHistory: historyResult.data ?? [],
    notes: notesResult.data ?? [],
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId, userId } = session;
  const { id } = await context.params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { stage_id, stage_reason, ...leadFields } = parsed.data;

  if (stage_id) {
    const { data: currentLead } = await service
      .from("leads")
      .select("stage_id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (currentLead && currentLead.stage_id !== stage_id) {
      await moveLeadToStage({
        tenantId,
        leadId: id,
        fromStageId: currentLead.stage_id,
        toStageId: stage_id,
        reason: stage_reason ?? "Stage changed by agent",
        actorType: "agent",
        actorId: userId,
      });
    }
  }

  if (Object.keys(leadFields).length > 0) {
    await service.from("leads").update(leadFields).eq("id", id).eq("tenant_id", tenantId);
  }

  const { data: lead } = await service
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  return NextResponse.json({ lead });
}
