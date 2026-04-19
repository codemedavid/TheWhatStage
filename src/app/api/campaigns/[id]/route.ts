import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  goal: z.enum(["form_submit", "appointment_booked", "purchase", "stage_reached"]).optional(),
  goal_config: z.record(z.unknown()).optional(),
  is_primary: z.boolean().optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
  follow_up_delay_minutes: z.number().int().min(15).max(1440).optional(),
  follow_up_message: z.string().max(500).nullable().optional(),
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
  const { data: campaign, error } = await service
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", auth.tenantId)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({ campaign });
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

  if (parsed.data.is_primary === true) {
    await service
      .from("campaigns")
      .update({ is_primary: false })
      .eq("tenant_id", auth.tenantId)
      .eq("is_primary", true);
  }

  const { data: campaign, error } = await service
    .from("campaigns")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", auth.tenantId)
    .select("*")
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
  }

  return NextResponse.json({ campaign });
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const service = createServiceClient();

  const { error } = await service
    .from("campaigns")
    .delete()
    .eq("id", id)
    .eq("tenant_id", auth.tenantId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
