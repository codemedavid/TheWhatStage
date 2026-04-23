import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  order_index: z.number().int().min(0),
  max_messages: z.number().int().min(1).max(50).default(3),
  system_prompt: z.string().min(1).max(5000),
  tone: z.string().max(200).optional(),
  goals: z.string().max(2000).optional(),
  transition_hint: z.string().max(1000).optional(),
  action_button_ids: z.array(z.string().uuid()).optional(),
  image_attachment_ids: z.array(z.string().uuid()).optional(),
});

export async function GET() {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const service = createServiceClient();
  const { data: phases, error } = await service
    .from("bot_flow_phases")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch phases" }, { status: 500 });
  }

  return NextResponse.json({ phases: phases ?? [] });
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
  const { data: phase, error } = await service
    .from("bot_flow_phases")
    .insert({
      tenant_id: tenantId,
      name: parsed.data.name,
      order_index: parsed.data.order_index,
      max_messages: parsed.data.max_messages,
      system_prompt: parsed.data.system_prompt,
      tone: parsed.data.tone ?? "friendly and helpful",
      goals: parsed.data.goals ?? null,
      transition_hint: parsed.data.transition_hint ?? null,
      action_button_ids: parsed.data.action_button_ids ?? null,
      image_attachment_ids: parsed.data.image_attachment_ids ?? [],
    })
    .select("*")
    .single();

  if (error || !phase) {
    return NextResponse.json({ error: "Failed to create phase" }, { status: 500 });
  }

  return NextResponse.json({ phase }, { status: 201 });
}
