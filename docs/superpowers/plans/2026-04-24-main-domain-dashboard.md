# Main Domain Dashboard Access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to log in and access the dashboard on the main domain (`whatstage.app/app/*`) without requiring navigation to a tenant subdomain, while keeping subdomain access fully functional.

**Architecture:** Middleware gains a second tenant resolution path: for main-domain `/app/*` requests, it reads a `ws-tenant-slug` cookie (set at login) and falls back to a DB membership lookup when the cookie is missing. Downstream code (layouts, pages, API routes) is unchanged — they still read `x-tenant-id`/`x-tenant-slug` headers injected by middleware.

**Tech Stack:** Next.js middleware, Supabase auth, cookies API

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/auth/tenant-cookie.ts` | Create | Cookie helpers: get/set/clear `ws-tenant-slug` |
| `src/middleware.ts` | Modify | Add main-domain `/app/*` tenant resolution |
| `src/lib/auth/redirect.ts` | Modify | Return main-domain path + set tenant cookie |
| `src/app/api/auth/tenant/route.ts` | Modify | Include `slug` in response for cookie setting |
| `src/app/api/auth/logout/route.ts` | Modify | Clear tenant cookie on logout |
| `tests/unit/tenant-cookie.test.ts` | Create | Unit tests for cookie helpers |
| `tests/unit/middleware-main-domain.test.ts` | Create | Unit tests for main-domain resolution |
| `tests/unit/redirect.test.ts` | Create | Unit tests for updated redirect logic |

---

### Task 1: Tenant Cookie Helpers

**Files:**
- Create: `src/lib/auth/tenant-cookie.ts`
- Create: `tests/unit/tenant-cookie.test.ts`

- [ ] **Step 1: Write failing tests for cookie helpers**

```typescript
// tests/unit/tenant-cookie.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock cookie-domain module
vi.mock("@/lib/supabase/cookie-domain", () => ({
  getCookieDomain: () => ".lvh.me",
}));

describe("tenant-cookie", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("TENANT_COOKIE_NAME", () => {
    it("exports the cookie name constant", async () => {
      const { TENANT_COOKIE_NAME } = await import("@/lib/auth/tenant-cookie");
      expect(TENANT_COOKIE_NAME).toBe("ws-tenant-slug");
    });
  });

  describe("tenantCookieOptions", () => {
    it("returns cookie options with shared domain", async () => {
      const { tenantCookieOptions } = await import("@/lib/auth/tenant-cookie");
      const opts = tenantCookieOptions();
      expect(opts).toEqual({
        path: "/",
        domain: ".lvh.me",
        sameSite: "lax" as const,
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/tenant-cookie.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/auth/tenant-cookie.ts
import { getCookieDomain } from "@/lib/supabase/cookie-domain";

export const TENANT_COOKIE_NAME = "ws-tenant-slug";

/**
 * Cookie options for the tenant slug cookie.
 * Uses the shared domain so it's readable from both
 * main domain and tenant subdomains.
 */
export function tenantCookieOptions() {
  return {
    path: "/",
    domain: getCookieDomain(),
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/tenant-cookie.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/tenant-cookie.ts tests/unit/tenant-cookie.test.ts
git commit -m "feat: add tenant cookie helpers for main-domain access"
```

---

### Task 2: Update Auth Redirect to Use Main Domain

**Files:**
- Modify: `src/lib/auth/redirect.ts`
- Create: `tests/unit/redirect.test.ts`

- [ ] **Step 1: Write failing tests for updated redirect**

```typescript
// tests/unit/redirect.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("redirectAfterAuth", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("returns /app/leads with tenant slug when user has tenant", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tenant: { id: "t1", slug: "acme" } }),
    });

    const { redirectAfterAuth } = await import("@/lib/auth/redirect");
    const result = await redirectAfterAuth("token123");

    expect(result).toEqual({ path: "/app/leads", slug: "acme" });
    expect(mockFetch).toHaveBeenCalledWith("/api/auth/tenant", {
      headers: { Authorization: "Bearer token123" },
    });
  });

  it("returns /onboarding with null slug when user has no tenant", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tenant: null }),
    });

    const { redirectAfterAuth } = await import("@/lib/auth/redirect");
    const result = await redirectAfterAuth("token");

    expect(result).toEqual({ path: "/onboarding", slug: null });
  });

  it("returns /onboarding with null slug on fetch error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network"));

    const { redirectAfterAuth } = await import("@/lib/auth/redirect");
    const result = await redirectAfterAuth();

    expect(result).toEqual({ path: "/onboarding", slug: null });
  });

  it("returns /onboarding with null slug on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const { redirectAfterAuth } = await import("@/lib/auth/redirect");
    const result = await redirectAfterAuth();

    expect(result).toEqual({ path: "/onboarding", slug: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/redirect.test.ts`
Expected: FAIL — return type mismatch (currently returns string, tests expect `{ path, slug }`)

- [ ] **Step 3: Update the implementation**

Replace the full content of `src/lib/auth/redirect.ts`:

```typescript
// src/lib/auth/redirect.ts

/**
 * After authentication, check if the user has a tenant and return
 * the redirect path + tenant slug.
 *
 * Returns { path, slug } so the caller can set the tenant cookie
 * before redirecting. The slug is null when no tenant exists.
 *
 * Accepts an optional access token to pass as Authorization header.
 * This avoids a race condition where cookies set by signInWithPassword()
 * may not yet be available to the server on the immediate next request.
 */
export async function redirectAfterAuth(
  accessToken?: string
): Promise<{ path: string; slug: string | null }> {
  try {
    const headers: HeadersInit = {};
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const res = await fetch("/api/auth/tenant", { headers });

    if (!res.ok) {
      return { path: "/onboarding", slug: null };
    }

    const { tenant } = await res.json();

    if (tenant?.slug) {
      return { path: "/app/leads", slug: tenant.slug };
    }

    return { path: "/onboarding", slug: null };
  } catch {
    return { path: "/onboarding", slug: null };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/redirect.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/redirect.ts tests/unit/redirect.test.ts
git commit -m "feat: update redirectAfterAuth to return main-domain path + slug"
```

---

### Task 3: Update Login Page to Set Tenant Cookie

**Files:**
- Modify: `src/app/(marketing)/login/page.tsx`

- [ ] **Step 1: Update the login page handleSubmit**

In `src/app/(marketing)/login/page.tsx`, update the import and `handleSubmit` function.

Replace the import line:

```typescript
import { redirectAfterAuth } from "@/lib/auth/redirect";
```

with:

```typescript
import { redirectAfterAuth } from "@/lib/auth/redirect";
import { TENANT_COOKIE_NAME, tenantCookieOptions } from "@/lib/auth/tenant-cookie";
```

Replace the try block inside `handleSubmit` (lines 100-111):

```typescript
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      const accessToken = data.session?.access_token;
      const destination = await redirectAfterAuth(accessToken);
      window.location.href = destination;
```

with:

```typescript
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      const accessToken = data.session?.access_token;
      const { path, slug } = await redirectAfterAuth(accessToken);

      if (slug) {
        const opts = tenantCookieOptions();
        document.cookie = `${TENANT_COOKIE_NAME}=${slug}; path=${opts.path}; domain=${opts.domain}; samesite=${opts.sameSite}; max-age=${opts.maxAge}`;
      }

      window.location.href = path;
```

- [ ] **Step 2: Verify the login page compiles**

Run: `npm run typecheck`
Expected: No errors related to login page

- [ ] **Step 3: Commit**

```bash
git add src/app/(marketing)/login/page.tsx
git commit -m "feat: login sets tenant cookie for main-domain dashboard"
```

---

### Task 4: Update Signup Page to Set Tenant Cookie

**Files:**
- Modify: `src/app/(marketing)/signup/page.tsx`

- [ ] **Step 1: Update the signup page handleSubmit**

In `src/app/(marketing)/signup/page.tsx`, update the import and `handleSubmit` function.

Replace the import line:

```typescript
import { redirectAfterAuth } from "@/lib/auth/redirect";
```

with:

```typescript
import { redirectAfterAuth } from "@/lib/auth/redirect";
import { TENANT_COOKIE_NAME, tenantCookieOptions } from "@/lib/auth/tenant-cookie";
```

Replace the post-signIn block inside `handleSubmit` (lines 153-164):

```typescript
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      const accessToken = data.session?.access_token;
      const destination = await redirectAfterAuth(accessToken);
      window.location.href = destination;
```

with:

```typescript
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      const accessToken = data.session?.access_token;
      const { path, slug } = await redirectAfterAuth(accessToken);

      if (slug) {
        const opts = tenantCookieOptions();
        document.cookie = `${TENANT_COOKIE_NAME}=${slug}; path=${opts.path}; domain=${opts.domain}; samesite=${opts.sameSite}; max-age=${opts.maxAge}`;
      }

      window.location.href = path;
```

- [ ] **Step 2: Verify the signup page compiles**

Run: `npm run typecheck`
Expected: No errors related to signup page

- [ ] **Step 3: Commit**

```bash
git add src/app/(marketing)/signup/page.tsx
git commit -m "feat: signup sets tenant cookie for main-domain dashboard"
```

---

### Task 5: Update Middleware for Main-Domain Tenant Resolution

**Files:**
- Modify: `src/middleware.ts`
- Create: `tests/unit/middleware-main-domain.test.ts`

- [ ] **Step 1: Write failing tests for main-domain middleware path**

```typescript
// tests/unit/middleware-main-domain.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies
vi.mock("@/lib/tenant/resolve", () => ({
  extractSubdomain: vi.fn(),
  resolveTenantBySlug: vi.fn(),
}));

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: vi.fn((_req, res) => res),
}));

vi.mock("@/lib/supabase/cookie-domain", () => ({
  getCookieDomain: () => ".lvh.me",
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(),
        })),
      })),
    })),
  }),
}));

describe("middleware — main domain /app/* resolution", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("resolves tenant from ws-tenant-slug cookie on main domain /app/* request", async () => {
    const { extractSubdomain, resolveTenantBySlug } = await import("@/lib/tenant/resolve");
    vi.mocked(extractSubdomain).mockReturnValue(null);
    vi.mocked(resolveTenantBySlug).mockResolvedValue({
      id: "t1",
      slug: "acme",
      name: "Acme Corp",
    });

    const { middleware } = await import("@/middleware");
    const req = new NextRequest("http://lvh.me:3000/app/leads", {
      headers: { host: "lvh.me:3000" },
    });
    req.cookies.set("ws-tenant-slug", "acme");

    const res = await middleware(req);
    expect(resolveTenantBySlug).toHaveBeenCalledWith("acme");
    expect(res.status).toBe(200);
  });

  it("passes through non-/app paths on main domain without tenant resolution", async () => {
    const { extractSubdomain, resolveTenantBySlug } = await import("@/lib/tenant/resolve");
    vi.mocked(extractSubdomain).mockReturnValue(null);

    const { middleware } = await import("@/middleware");
    const req = new NextRequest("http://lvh.me:3000/login", {
      headers: { host: "lvh.me:3000" },
    });

    const res = await middleware(req);
    expect(resolveTenantBySlug).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/middleware-main-domain.test.ts`
Expected: FAIL — middleware doesn't handle main-domain /app/* yet

- [ ] **Step 3: Update the middleware**

Replace the full content of `src/middleware.ts`:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { extractSubdomain, resolveTenantBySlug } from "@/lib/tenant/resolve";
import { updateSession } from "@/lib/supabase/middleware";
import { TENANT_COOKIE_NAME, tenantCookieOptions } from "@/lib/auth/tenant-cookie";
import { createServiceClient } from "@/lib/supabase/service";

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
      // Cookie slug invalid — fall through to DB lookup
    }

    // No cookie or invalid cookie — try DB lookup via Supabase session
    const response = NextResponse.next();
    const sessionResponse = await updateSession(request, response);

    // Read the refreshed auth cookies to get the user
    const service = createServiceClient();

    // Extract the Supabase access token from cookies
    const allCookies = request.cookies.getAll();
    const accessTokenCookie = allCookies.find((c) =>
      c.name.endsWith("-auth-token") || c.name.includes("auth-token")
    );

    if (!accessTokenCookie) {
      // No auth session — let the layout handle the redirect to /login
      return sessionResponse;
    }

    // Try to get user from the token
    let userId: string | null = null;
    try {
      // Parse the base64 code point cookie value if needed
      let tokenValue = accessTokenCookie.value;
      // Supabase stores tokens as base64 JSON chunks; try direct auth
      const { data: userData } = await service.auth.getUser(tokenValue);
      if (userData?.user) {
        userId = userData.user.id;
      }
    } catch {
      // Can't resolve user — let layout handle redirect
      return sessionResponse;
    }

    if (!userId) {
      return sessionResponse;
    }

    // Look up tenant membership
    const { data: membership } = await service
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership?.tenant_id) {
      // No tenant — redirect to onboarding
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }

    // Look up tenant slug
    const { data: tenantData } = await service
      .from("tenants")
      .select("id, slug, name")
      .eq("id", membership.tenant_id)
      .single();

    if (!tenantData) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }

    // Set the cookie for future requests
    const cookieOpts = tenantCookieOptions();
    const newResponse = NextResponse.next({
      request: {
        headers: (() => {
          const h = new Headers(request.headers);
          h.set("x-tenant-id", tenantData.id);
          h.set("x-tenant-slug", tenantData.slug);
          return h;
        })(),
      },
    });
    newResponse.cookies.set(TENANT_COOKIE_NAME, tenantData.slug, cookieOpts);

    return updateSession(request, newResponse);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/middleware-main-domain.test.ts`
Expected: PASS

- [ ] **Step 5: Verify all existing tests still pass**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/middleware.ts tests/unit/middleware-main-domain.test.ts
git commit -m "feat: middleware resolves tenant from cookie on main domain /app/*"
```

---

### Task 6: Clear Tenant Cookie on Logout

**Files:**
- Modify: `src/app/api/auth/logout/route.ts`

- [ ] **Step 1: Update the logout route**

Replace the full content of `src/app/api/auth/logout/route.ts`:

```typescript
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
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/logout/route.ts
git commit -m "feat: clear tenant cookie on logout"
```

---

### Task 7: Verify Full Flow and Run All Tests

**Files:** None (verification only)

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 4: Start dev server and test manually**

Run: `npm run dev`

Test the following flows:

1. **Login on main domain:** Go to `http://lvh.me:3000/login`, sign in, verify redirect to `http://lvh.me:3000/app/leads`
2. **Dashboard on main domain:** After login, navigate to `http://lvh.me:3000/app/campaigns` — should show dashboard
3. **Cookie is set:** Check browser dev tools → Application → Cookies → verify `ws-tenant-slug` cookie exists with correct value
4. **Subdomain still works:** Navigate to `http://acme.lvh.me:3000/app/leads` — should still work
5. **Logout clears cookie:** Click logout, verify `ws-tenant-slug` cookie is cleared
6. **Fresh session fallback:** Clear `ws-tenant-slug` cookie manually, navigate to `http://lvh.me:3000/app/leads` — should resolve from DB and set cookie

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```
