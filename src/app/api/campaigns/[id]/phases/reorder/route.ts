import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { z } from "zod";

const reorderSchema = z.array(
  z.object({
    id: z.string().uuid(),
    order_index: z.number().int().min(0),
  })
);

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

  for (const item of parsed.data) {
    await service
      .from("campaign_phases")
      .update({ order_index: item.order_index })
      .eq("id", item.id)
      .eq("tenant_id", tenantId);
  }

  return NextResponse.json({ success: true });
}
