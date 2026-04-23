import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";

export async function GET() {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const service = createServiceClient();
  const { data: actionPages, error } = await service
    .from("action_pages")
    .select("id, title, type, slug")
    .eq("tenant_id", tenantId)
    .order("title", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch action pages" }, { status: 500 });
  }

  return NextResponse.json({ actionPages: actionPages ?? [] });
}
