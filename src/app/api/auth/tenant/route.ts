import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/auth/tenant
 * Returns the authenticated user's tenant info (if they own one).
 * Used by login/signup to determine where to redirect after auth.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: membership } = await service
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ tenant: null }, { status: 200 });
  }

  const { data: tenant } = await service
    .from("tenants")
    .select("id, slug")
    .eq("id", membership.tenant_id)
    .single();

  return NextResponse.json({ tenant }, { status: 200 });
}
