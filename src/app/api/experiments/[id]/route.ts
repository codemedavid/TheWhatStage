import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(["draft", "running", "paused", "completed"]).optional(),
  min_sample_size: z.number().int().min(10).max(10000).optional(),
});

async function authenticate() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Unauthorized", status: 401 };
  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) return { error: "No tenant associated", status: 403 };
  return { tenantId };
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const service = createServiceClient();
  const { data: experiment, error } = await service
    .from("experiments")
    .select("*, experiment_campaigns(campaign_id, weight, campaigns(id, name, status))")
    .eq("id", id)
    .eq("tenant_id", auth.tenantId)
    .single();

  if (error || !experiment) {
    return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  }

  return NextResponse.json({ experiment });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

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
    .eq("tenant_id", auth.tenantId)
    .select("*")
    .single();

  if (error || !experiment) {
    return NextResponse.json({ error: "Failed to update experiment" }, { status: 500 });
  }

  return NextResponse.json({ experiment });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const service = createServiceClient();

  const { error } = await service
    .from("experiments")
    .delete()
    .eq("id", id)
    .eq("tenant_id", auth.tenantId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete experiment" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
