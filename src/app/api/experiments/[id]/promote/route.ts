import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const promoteSchema = z.object({
  winner_campaign_id: z.string().uuid(),
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

export async function POST(request: Request, context: RouteContext) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

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
    .eq("tenant_id", auth.tenantId);

  if (expError) {
    return NextResponse.json({ error: "Failed to update experiment" }, { status: 500 });
  }

  await service
    .from("campaigns")
    .update({ is_primary: false })
    .eq("tenant_id", auth.tenantId)
    .eq("is_primary", true);

  const { error: campError } = await service
    .from("campaigns")
    .update({ is_primary: true, status: "active" })
    .eq("id", parsed.data.winner_campaign_id)
    .eq("tenant_id", auth.tenantId);

  if (campError) {
    return NextResponse.json({ error: "Failed to promote campaign" }, { status: 500 });
  }

  return NextResponse.json({ success: true, promoted: parsed.data.winner_campaign_id });
}
