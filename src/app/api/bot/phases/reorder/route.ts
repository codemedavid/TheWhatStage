import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const reorderSchema = z.object({
  order: z
    .array(
      z.object({
        id: z.string().uuid(),
        order_index: z.number().int().min(0),
      })
    )
    .min(1),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = reorderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const ids = parsed.data.order.map((item) => item.id);

  // Verify all IDs belong to this tenant before reordering
  const { count, error: countError } = await service
    .from("bot_flow_phases")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("id", ids);

  if (countError || count !== ids.length) {
    return NextResponse.json({ error: "Invalid phase IDs" }, { status: 400 });
  }

  const rows = parsed.data.order.map((item) => ({
    id: item.id,
    tenant_id: tenantId,
    order_index: item.order_index,
  }));

  const { error } = await service
    .from("bot_flow_phases")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ error: "Failed to reorder phases" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
