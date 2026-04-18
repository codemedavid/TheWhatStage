import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database";
import { getCookieDomain } from "./cookie-domain";

/**
 * Refreshes the Supabase session on every request.
 * Must be called from middleware — cannot use next/headers here.
 */
export async function updateSession(
  request: NextRequest,
  response: NextResponse
): Promise<NextResponse> {
  const domain = getCookieDomain();

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, { ...options, domain, path: "/" })
          );
        },
      },
    }
  );

  // Refresh session — do not remove, required for Server Components
  await supabase.auth.getUser();

  return response;
}
