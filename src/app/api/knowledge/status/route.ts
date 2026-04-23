import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";

export async function GET(request: Request) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const { searchParams } = new URL(request.url);
  const docId = searchParams.get("docId");

  if (!docId) {
    return NextResponse.json({ error: "docId is required" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: doc, error } = await service
    .from("knowledge_docs")
    .select("id, status, metadata")
    .eq("id", docId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json({
    docId: doc.id,
    status: doc.status,
    metadata: doc.metadata,
  });
}
