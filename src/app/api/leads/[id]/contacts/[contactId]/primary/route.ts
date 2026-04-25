import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";

type RouteContext = { params: Promise<{ id: string; contactId: string }> };

export async function PUT(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: leadId, contactId } = await context.params;
  const supabase = createServiceClient();

  // Fetch the contact to get its type
  const { data: contact, error: contactError } = await supabase
    .from("lead_contacts")
    .select("id, lead_id, type, value")
    .eq("id", contactId)
    .eq("lead_id", leadId)
    .eq("tenant_id", session.tenantId)
    .single();

  if (contactError || !contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // Clear existing primary for this lead + type
  await supabase
    .from("lead_contacts")
    .update({ is_primary: false })
    .eq("lead_id", leadId)
    .eq("tenant_id", session.tenantId)
    .eq("type", contact.type);

  // Set this contact as primary
  const { data: updated, error: updateError } = await supabase
    .from("lead_contacts")
    .update({ is_primary: true })
    .eq("id", contactId)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ contact: updated });
}
