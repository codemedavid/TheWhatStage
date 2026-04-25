import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { z } from "zod";

const createNoteSchema = z.object({
  content: z.string().min(1).max(5000),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;
  const { id } = await context.params;
  const service = createServiceClient();

  const { data, error } = await service.from("lead_notes").select("*")
    .eq("lead_id", id).eq("tenant_id", tenantId)
    .order("created_at", { ascending: false }).limit(100);

  if (error) return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  return NextResponse.json({ notes: data });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId, userId } = session;
  const { id } = await context.params;
  const body = await request.json();
  const parsed = createNoteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service.from("lead_notes").insert({
    tenant_id: tenantId, lead_id: id, type: "agent_note",
    content: parsed.data.content, author_id: userId,
  }).select("*").single();

  if (error) return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  return NextResponse.json({ note: data }, { status: 201 });
}
