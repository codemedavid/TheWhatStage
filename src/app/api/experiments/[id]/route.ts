import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(["draft", "running", "paused", "completed"]).optional(),
  min_sample_size: z.number().int().min(10).max(10000).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const { id } = await context.params;
  const service = createServiceClient();
  const { data: experiment, error } = await service
    .from("experiments")
    .select("*, experiment_campaigns(campaign_id, weight, campaigns(id, name, status))")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !experiment) {
    return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  }

  return NextResponse.json({ experiment });
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

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "running") {
    updateData.started_at = new Date().toISOString();
  } else if (parsed.data.status === "completed") {
    updateData.ended_at = new Date().toISOString();
  }

  const { data: experiment, error } = await service
    .from("experiments")
    .update(updateData)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();

  if (error || !experiment) {
    return NextResponse.json({ error: "Failed to update experiment" }, { status: 500 });
  }

  return NextResponse.json({ experiment });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const { id } = await context.params;
  const service = createServiceClient();

  const { error } = await service
    .from("experiments")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete experiment" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
