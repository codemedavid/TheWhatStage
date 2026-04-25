import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/auth/tenant
 * Returns the authenticated user's tenant info (if they own one).
 * Used by login/signup to determine where to redirect after auth.
 *
 * Supports two auth methods:
 * 1. Authorization: Bearer <token> header (used immediately after sign-in
 *    when cookies may not yet be propagated)
 * 2. Cookie-based session (standard server-side auth)
 */
export async function GET(request: NextRequest) {
  let user = null;

  // Try Authorization header first (handles post-login race condition)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const service = createServiceClient();
    const { data, error } = await service.auth.getUser(token);
    if (!error && data.user) {
      user = data.user;
    }
  }

  // Fall back to cookie-based auth
  if (!user) {
    const supabase = await createClient();
    const { data, error: authError } = await supabase.auth.getUser();
    if (!authError && data.user) {
      user = data.user;
    }
  }

  if (!user) {
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
