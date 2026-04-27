import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { z } from "zod";
import type { Json } from "@/types/database";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  main_goal: z.string().max(1000).nullable().optional(),
  campaign_personality: z.string().max(1000).nullable().optional(),
  goal: z.enum(["form_submit", "appointment_booked", "purchase", "stage_reached"]).optional(),
  goal_config: z.record(z.unknown()).optional(),
  is_primary: z.boolean().optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
  follow_up_delay_minutes: z.number().int().min(15).max(1440).optional(),
  follow_up_message: z.string().max(500).nullable().optional(),
  campaign_rules: z.array(z.string().min(1).max(300)).max(10).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const { id } = await context.params;
  const service = createServiceClient();
  const { data: campaign, error } = await service
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({ campaign });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

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

  if (parsed.data.is_primary === true) {
    await service
      .from("campaigns")
      .update({ is_primary: false })
      .eq("tenant_id", tenantId)
      .eq("is_primary", true);
  }

  const updates = {
    ...parsed.data,
    goal_config: parsed.data.goal_config as Json | undefined,
    updated_at: new Date().toISOString(),
  };

  if (updates.goal_config === undefined) {
    delete updates.goal_config;
  }

  const { data: campaign, error } = await service
    .from("campaigns")
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
  }

  return NextResponse.json({ campaign });
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const { id } = await context.params;
  const service = createServiceClient();

  const { error } = await service
    .from("campaigns")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
