import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const session = await resolveSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const service = createServiceClient();

  const { data, error } = await service
    .from("knowledge_docs")
    .select("id, title, content, display_order")
    .eq("tenant_id", session.tenantId)
    .eq("type", "richtext")
    .order("display_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sections = (data ?? []).map((d, i) => ({
    id: d.id,
    title: d.title,
    content: d.content ?? "",
    order: d.display_order ?? i,
  }));

  return NextResponse.json({ sections });
}
