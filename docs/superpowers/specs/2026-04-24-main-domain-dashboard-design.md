# Main Domain Dashboard Access

**Date:** 2026-04-24
**Status:** Approved

## Problem

Users currently must navigate to their tenant subdomain (e.g., `acme.whatstage.app`) to access the dashboard. This adds friction — users must remember their subdomain slug, and login always redirects away from the main domain.

## Goal

Allow users to log in and access the full dashboard on the main domain (`whatstage.app/app/leads`, `whatstage.app/app/campaigns`, etc.) while keeping subdomain access fully functional as a backwards-compatible option.

## Design Decisions

1. **Main domain login** — users log in at `whatstage.app/login`, stay on main domain
2. **Tenant resolution** — auto-resolve from `ws-tenant-slug` cookie, falling back to DB membership lookup
3. **Subdomains still work** — no breaking changes, subdomain routing unchanged
4. **Clean dashboard URLs** — `whatstage.app/app/leads` (no slug in path), tenant from session/cookie
5. **Transparent middleware resolution** — middleware handles cookie-miss by querying DB and setting cookie in one request

## Architecture

### Tenant Context Resolution (Updated Flow)

The middleware currently resolves tenant context from subdomains only. The updated flow adds a second resolution path for main domain requests:

```
Request arrives at middleware
├── Is subdomain? (e.g., acme.whatstage.app)
│   └── Existing flow: resolveTenantBySlug(subdomain)
│       └── Set x-tenant-id / x-tenant-slug headers
│
├── Is main domain + /app/* path?
│   ├── Has ws-tenant-slug cookie?
│   │   └── resolveTenantBySlug(cookieValue)
│   │       └── Set x-tenant-id / x-tenant-slug headers
│   │
│   └── No cookie?
│       └── Get user from Supabase session
│           └── Query tenant_members for user's membership
│               ├── Found: set ws-tenant-slug cookie + tenant headers
│               └── Not found: redirect to /onboarding
│
└── Other main domain paths (/, /login, /signup, /onboarding)
    └── No tenant resolution needed (existing behavior)
```

### Cookie: `ws-tenant-slug`

| Property | Value |
|----------|-------|
| Name | `ws-tenant-slug` |
| Value | Tenant slug string (e.g., `acme`) |
| Domain | `.whatstage.app` (shared, same as auth cookies) |
| Path | `/` |
| HttpOnly | No (may need client-side reads for tenant switcher later) |
| SameSite | Lax |
| Set on | Login redirect, middleware fallback resolution |
| Cleared on | Logout |

### Multi-Tenant Users

If a user belongs to multiple tenants, the first membership returned by the DB query is used (existing behavior via `resolveSession`). A tenant switcher component can be added later — it would update the `ws-tenant-slug` cookie and reload.

## File Changes

### `src/middleware.ts`

Add main-domain tenant resolution logic:
- Detect main domain requests to `/app/*` paths
- Check for `ws-tenant-slug` cookie
- If cookie present: resolve tenant via `resolveTenantBySlug(cookieValue)` and set headers
- If cookie missing: authenticate user via Supabase session, query `tenant_members` for first membership, set cookie + headers
- If no membership found: redirect to `/onboarding`
- All other middleware behavior unchanged

### `src/lib/auth/redirect.ts`

Change `redirectAfterAuth()`:
- Instead of building subdomain URL (`{slug}.domain.com/app/leads`), return main domain URL (`/app/leads`)
- Set `ws-tenant-slug` cookie with the resolved tenant slug before redirecting
- Remove `buildTenantUrl()` helper (no longer needed for login flow, but keep if used elsewhere)

### `src/lib/auth/session.ts`

Add tenant cookie helpers:
- `setTenantCookie(slug: string)` — sets `ws-tenant-slug` cookie with shared domain
- `clearTenantCookie()` — removes the cookie
- `getTenantCookie()` — reads cookie value from request

### `src/app/api/auth/logout/route.ts`

Add `clearTenantCookie()` call alongside `supabase.auth.signOut()`.

### `src/app/(marketing)/login/page.tsx`

Update redirect target: `redirectAfterAuth()` now returns main domain path, so `window.location.href` assignment works without change. The function itself handles the cookie.

### `src/app/(marketing)/signup/page.tsx`

Same as login — redirect target changes are encapsulated in `redirectAfterAuth()`.

## What Does NOT Change

- `getTenantContext()` — still reads `x-tenant-id` / `x-tenant-slug` headers
- `requireTenantContext()` — unchanged
- Dashboard layout (`(tenant)/app/layout.tsx`) — still uses tenant context from headers
- All dashboard pages and components — unchanged
- All API routes — unchanged
- Subdomain routing — fully preserved
- Cookie domain sharing for auth — unchanged
- Supabase client configuration — unchanged

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Cookie slug points to deleted tenant | Middleware clears cookie, falls back to DB lookup |
| User removed from tenant but cookie still set | Middleware resolves tenant, but layout guard catches membership check failure and redirects to `/login` |
| User has no tenant membership | Middleware redirects to `/onboarding` |
| User accesses subdomain with different cookie | Subdomain takes precedence (subdomain resolution runs first) |
| Unauthenticated user hits `/app/*` on main domain | No session, no cookie resolution possible, layout redirects to `/login` |

## Testing

- Unit: middleware tenant resolution from cookie
- Unit: middleware tenant resolution from DB fallback
- Unit: cookie set/clear helpers
- Integration: login flow redirects to main domain
- Integration: logout clears tenant cookie
- E2E: full login -> dashboard on main domain flow
- E2E: subdomain access still works
