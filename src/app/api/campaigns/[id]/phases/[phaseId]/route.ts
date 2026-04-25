import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  max_messages: z.number().int().min(1).max(50).optional(),
  system_prompt: z.string().min(1).max(5000).optional(),
  tone: z.string().max(200).nullable().optional(),
  goals: z.string().max(2000).nullable().optional(),
  transition_hint: z.string().max(1000).nullable().optional(),
  action_button_ids: z.array(z.string().uuid()).optional(),
  image_attachment_ids: z.array(z.string().uuid()).optional(),
});

type RouteContext = { params: Promise<{ id: string; phaseId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const { phaseId } = await context.params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data: phase, error } = await service
    .from("campaign_phases")
    .update(parsed.data)
    .eq("id", phaseId)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();

  if (error || !phase) {
    return NextResponse.json({ error: "Failed to update phase" }, { status: 500 });
  }

  return NextResponse.json({ phase });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const { phaseId } = await context.params;
  const service = createServiceClient();

  const { error } = await service
    .from("campaign_phases")
    .delete()
    .eq("id", phaseId)
    .eq("tenant_id", tenantId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete phase" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
