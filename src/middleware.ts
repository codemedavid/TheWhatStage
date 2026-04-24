import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { extractSubdomain, resolveTenantBySlug } from "@/lib/tenant/resolve";
import { updateSession } from "@/lib/supabase/middleware";
import { TENANT_COOKIE_NAME, tenantCookieOptions } from "@/lib/auth/tenant-cookie";
import { createServiceClient } from "@/lib/supabase/service";
import { getCookieDomain } from "@/lib/supabase/cookie-domain";
import type { Database } from "@/types/database";

// Subdomains that belong to the platform itself, not a tenant
const PLATFORM_SUBDOMAINS = new Set(["www", "app", "api"]);

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const subdomain = extractSubdomain(host);

  // --- Tenant subdomain path (existing, unchanged) ---
  if (subdomain && !PLATFORM_SUBDOMAINS.has(subdomain)) {
    const tenant = await resolveTenantBySlug(subdomain);

    if (!tenant) {
      return new NextResponse("Tenant not found", { status: 404 });
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-tenant-id", tenant.id);
    requestHeaders.set("x-tenant-slug", tenant.slug);

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });

    return updateSession(request, response);
  }

  // --- Main domain /app/* path (new) ---
  if (!subdomain && request.nextUrl.pathname.startsWith("/app")) {
    const slugFromCookie = request.cookies.get(TENANT_COOKIE_NAME)?.value;

    // Try resolving from cookie first
    if (slugFromCookie) {
      const tenant = await resolveTenantBySlug(slugFromCookie);
      if (tenant) {
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set("x-tenant-id", tenant.id);
        requestHeaders.set("x-tenant-slug", tenant.slug);

        const response = NextResponse.next({
          request: { headers: requestHeaders },
        });

        return updateSession(request, response);
      }
      // Cookie slug invalid — clear it and fall through to DB lookup
    }

    // No cookie or invalid cookie — try DB lookup via Supabase session
    // Create a temporary response to work with updateSession
    const tempResponse = NextResponse.next();
    const domain = getCookieDomain();

    // Create a Supabase client from request cookies to get the user
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            cookiesToSet.forEach(({ name, value, options }) =>
              tempResponse.cookies.set(name, value, { ...options, domain, path: "/" })
            );
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      // No auth session — let the request through, layout will redirect to /login
      return updateSession(request, tempResponse);
    }

    // Look up tenant membership
    const service = createServiceClient();
    const { data: membership } = await service
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership?.tenant_id) {
      // No tenant — redirect to onboarding
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }

    // Look up tenant details
    const { data: tenantData } = await service
      .from("tenants")
      .select("id, slug, name")
      .eq("id", membership.tenant_id)
      .single();

    if (!tenantData) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }

    // Set tenant context headers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-tenant-id", tenantData.id);
    requestHeaders.set("x-tenant-slug", tenantData.slug);

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });

    // Set the cookie for future requests
    const cookieOpts = tenantCookieOptions();
    response.cookies.set(TENANT_COOKIE_NAME, tenantData.slug, cookieOpts);

    return updateSession(request, response);
  }

  // --- Platform / marketing path (existing, unchanged) ---
  return updateSession(request, NextResponse.next());
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
