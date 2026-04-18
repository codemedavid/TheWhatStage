import { NextResponse, type NextRequest } from "next/server";
import { extractSubdomain, resolveTenantBySlug } from "@/lib/tenant/resolve";
import { updateSession } from "@/lib/supabase/middleware";

// Subdomains that belong to the platform itself, not a tenant
const PLATFORM_SUBDOMAINS = new Set(["www", "app", "api"]);

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const subdomain = extractSubdomain(host);

  // --- Tenant subdomain path ---
  if (subdomain && !PLATFORM_SUBDOMAINS.has(subdomain)) {
    const tenant = await resolveTenantBySlug(subdomain);

    if (!tenant) {
      return new NextResponse("Tenant not found", { status: 404 });
    }

    // Attach tenant context as a header so server components can read it
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-tenant-id", tenant.id);
    requestHeaders.set("x-tenant-slug", tenant.slug);

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });

    // Keep Supabase session cookies fresh
    return updateSession(request, response);
  }

  // --- Platform / marketing path ---
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
