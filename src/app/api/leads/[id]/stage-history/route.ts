import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;
  const { id } = await context.params;
  const service = createServiceClient();

  const { data, error } = await service.from("lead_stage_history").select("*")
    .eq("lead_id", id).eq("tenant_id", tenantId)
    .order("created_at", { ascending: false }).limit(100);

  if (error) return NextResponse.json({ error: "Failed to fetch stage history" }, { status: 500 });
  return NextResponse.json({ stageHistory: data });
}
