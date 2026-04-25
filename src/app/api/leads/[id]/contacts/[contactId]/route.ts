import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ id: string; contactId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;
  const { contactId } = await context.params;
  const service = createServiceClient();

  const { error } = await service
    .from("lead_contacts")
    .delete()
    .eq("id", contactId)
    .eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 });
  return NextResponse.json({ success: true });
}
