import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { z } from "zod";

const promoteSchema = z.object({
  winner_campaign_id: z.string().uuid(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const { id } = await context.params;
  const body = await request.json();
  const parsed = promoteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  const { error: expError } = await service
    .from("experiments")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      winner_campaign_id: parsed.data.winner_campaign_id,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (expError) {
    return NextResponse.json({ error: "Failed to update experiment" }, { status: 500 });
  }

  await service
    .from("campaigns")
    .update({ is_primary: false })
    .eq("tenant_id", tenantId)
    .eq("is_primary", true);

  const { error: campError } = await service
    .from("campaigns")
    .update({ is_primary: true, status: "active" })
    .eq("id", parsed.data.winner_campaign_id)
    .eq("tenant_id", tenantId);

  if (campError) {
    return NextResponse.json({ error: "Failed to promote campaign" }, { status: 500 });
  }

  return NextResponse.json({ success: true, promoted: parsed.data.winner_campaign_id });
}
