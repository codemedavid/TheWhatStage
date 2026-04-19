import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  goal: z.enum(["form_submit", "appointment_booked", "purchase", "stage_reached"]),
  goal_config: z.record(z.unknown()).optional(),
  follow_up_delay_minutes: z.number().int().min(15).max(1440).optional(),
  follow_up_message: z.string().max(500).optional(),
});

async function authenticate() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Unauthorized", status: 401 };
  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) return { error: "No tenant associated", status: 403 };
  return { tenantId };
}

export async function GET() {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const service = createServiceClient();
  const { data: campaigns, error } = await service
    .from("campaigns")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }

  return NextResponse.json({ campaigns: campaigns ?? [] });
}

export async function POST(request: Request) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data: campaign, error } = await service
    .from("campaigns")
    .insert({
      tenant_id: auth.tenantId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      goal: parsed.data.goal,
      goal_config: parsed.data.goal_config ?? {},
      follow_up_delay_minutes: parsed.data.follow_up_delay_minutes ?? 120,
      follow_up_message: parsed.data.follow_up_message ?? null,
    })
    .select("*")
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }

  return NextResponse.json({ campaign }, { status: 201 });
}
