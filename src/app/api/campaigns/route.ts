import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  goal: z.enum(["form_submit", "appointment_booked", "purchase", "stage_reached"]),
  goal_config: z.record(z.unknown()).optional(),
  follow_up_delay_minutes: z.number().int().min(15).max(1440).optional(),
  follow_up_message: z.string().max(500).optional(),
});

export async function GET() {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const service = createServiceClient();
  const { data: campaigns, error } = await service
    .from("campaigns")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }

  return NextResponse.json({ campaigns: campaigns ?? [] });
}

export async function POST(request: Request) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

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
      tenant_id: tenantId,
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
