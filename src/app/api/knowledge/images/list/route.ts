import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";

export async function GET() {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const service = createServiceClient();
  const { data: images, error } = await service
    .from("knowledge_images")
    .select("id, url, description, tags")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch images" }, { status: 500 });
  }

  return NextResponse.json({ images: images ?? [] });
}
