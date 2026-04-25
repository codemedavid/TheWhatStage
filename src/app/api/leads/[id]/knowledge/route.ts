import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { normalizeKey } from "@/lib/leads/key-normalizer";
import { z } from "zod";

const upsertKnowledgeSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().min(1).max(1000),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;
  const { id } = await context.params;
  const service = createServiceClient();

  const { data, error } = await service
    .from("lead_knowledge")
    .select("*")
    .eq("lead_id", id)
    .eq("tenant_id", tenantId)
    .order("key", { ascending: true });

  if (error) return NextResponse.json({ error: "Failed to fetch knowledge" }, { status: 500 });
  return NextResponse.json({ knowledge: data });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;
  const { id } = await context.params;
  const body = await request.json();
  const parsed = upsertKnowledgeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const canonicalKey = normalizeKey(parsed.data.key);

  const { data, error } = await service
    .from("lead_knowledge")
    .upsert(
      {
        tenant_id: tenantId,
        lead_id: id,
        key: canonicalKey,
        value: parsed.data.value,
        source: "manual",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,lead_id,key" }
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "Failed to save knowledge" }, { status: 500 });
  return NextResponse.json({ knowledge: data });
}
