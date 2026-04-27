// src/app/api/knowledge/docs/[id]/route.ts
import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await resolveSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const service = createServiceClient();
  const { data, error } = await service
    .from("knowledge_docs")
    .select("id, title, content, type, status, metadata")
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ doc: data });
}
