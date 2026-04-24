import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TENANT_COOKIE_NAME, tenantCookieOptions } from "@/lib/auth/tenant-cookie";

/**
 * POST /api/auth/logout
 * Signs the user out, clears the Supabase session and tenant cookie.
 */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const response = NextResponse.json({ ok: true });

  // Clear the tenant cookie
  const opts = tenantCookieOptions();
  response.cookies.set(TENANT_COOKIE_NAME, "", {
    ...opts,
    maxAge: 0,
  });

  return response;
}
