import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
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
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

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

  // Update each phase's order_index individually (avoids upsert NOT NULL issues)
  const updates = parsed.data.order.map((item) =>
    service
      .from("bot_flow_phases")
      .update({ order_index: item.order_index })
      .eq("id", item.id)
      .eq("tenant_id", tenantId)
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);

  if (failed?.error) {
    return NextResponse.json({ error: "Failed to reorder phases" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
