import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  max_messages: z.number().int().min(1).max(50).optional(),
  system_prompt: z.string().min(1).max(5000).optional(),
  tone: z.string().max(200).optional(),
  goals: z.string().max(2000).nullable().optional(),
  transition_hint: z.string().max(1000).nullable().optional(),
  action_button_ids: z.array(z.string().uuid()).optional(),
  image_attachment_ids: z.array(z.string().uuid()).optional(),
});

async function authenticate() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Unauthorized", status: 401 };
  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) return { error: "No tenant associated", status: 403 };
  return { tenantId };
}

type RouteContext = { params: Promise<{ id: string; phaseId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

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
    .eq("tenant_id", auth.tenantId)
    .select("*")
    .single();

  if (error || !phase) {
    return NextResponse.json({ error: "Failed to update phase" }, { status: 500 });
  }

  return NextResponse.json({ phase });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { phaseId } = await context.params;
  const service = createServiceClient();

  const { error } = await service
    .from("campaign_phases")
    .delete()
    .eq("id", phaseId)
    .eq("tenant_id", auth.tenantId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete phase" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
