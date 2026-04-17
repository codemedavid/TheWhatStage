# Tenant Account Setup — Design Spec

**Date:** 2026-04-18
**Status:** Approved
**Scope:** Make the existing signup → onboarding → tenant dashboard flow work end-to-end with security hardening

## Overview

Fix the broken signup-to-tenant-creation flow (401 on `POST /api/onboarding/create-tenant`) and harden the full auth + onboarding pipeline. Uses Approach C: auto-confirm locally, structured for production email confirmation.

## Root Cause

The signup page calls `supabase.auth.signUp()` and immediately redirects to `/onboarding`. With email confirmation enabled (Supabase default), no session exists yet — so the create-tenant API returns 401.

## Section 1: Auth Flow

### Signup Behavior
- User submits email/password via `supabase.auth.signUp()`
- Check response: if `user.identities` is empty or `user.email_confirmed_at` is null → show "Check your email" message
- If session is immediately available (auto-confirm enabled) → redirect to `/onboarding`
- Single code path handles both local dev (auto-confirm) and production (email confirm)

### Auth Callback
- Existing `/auth/callback` route exchanges code for session, redirects to `/onboarding`
- Supports `next` parameter for deep-linking post-confirmation

### Auth Guard on /onboarding
- Server-side session check in `(marketing)/onboarding/layout.tsx`
- Redirects to `/login` if unauthenticated

## Section 2: Tenant Creation API (Security Hardening)

### Transaction Safety
- Wrap tenant + member insert in a Postgres function `create_tenant_with_owner`
- Single transaction — automatic rollback if either insert fails
- Replaces two separate service client calls

### Slug Validation
- Client-side validation before submit (3+ chars, valid format)
- Inline error messages for invalid slugs

### Tenant Limit
- Check: one user can only own 1 tenant (for now)
- Enforced in the API route before calling the Postgres function

### Reserved Slug Protection
- Check against `PLATFORM_SUBDOMAINS` (`www`, `app`, `api`) in the Postgres function
- Enforced at database level — raises exception if slug is reserved
- Also checked client-side for fast feedback

## Section 3: Supabase Schema & Config

### `supabase/config.toml`
- `enable_confirmations = false` for local dev
- Inbucket configured for local email testing
- Site URL: `http://localhost:3000`
- Redirect URLs: allow `lvh.me` subdomains

### New Migration: `0002_create_tenant_function.sql`

```sql
-- Function: create_tenant_with_owner(name, slug, business_type, bot_goal, user_id)
-- Returns: { id, slug }
-- Behavior:
--   1. Check slug not in reserved list (www, app, api) → raise exception
--   2. Insert into tenants
--   3. Insert into tenant_members with role = 'owner'
--   4. Return tenant id and slug
--   5. Automatic rollback on any failure
```

## Section 4: Onboarding Page & Redirect

### Auth Guard
- New `(marketing)/onboarding/layout.tsx` — server component
- Checks session, redirects to `/login` if unauthenticated
- Page remains a client component for the multi-step form

### Slug Auto-Generation Fix
- Trim leading/trailing hyphens from generated slug
- Inline validation error if slug < 3 chars
- Check reserved slugs client-side

### Post-Creation Redirect
- New env var: `NEXT_PUBLIC_APP_DOMAIN` (e.g., `lvh.me:3000` or `whatstage.app`)
- Construct redirect URL explicitly: `http://{slug}.{NEXT_PUBLIC_APP_DOMAIN}/app/leads`
- Replaces fragile `window.location.host` string manipulation

### File Structure
```
src/app/(marketing)/onboarding/
├── layout.tsx    ← server component, auth guard
└── page.tsx      ← client component, multi-step form (refactored)
```

## Section 5: Testing Strategy

### Extracted Utilities (independently testable)
- `src/lib/utils/slug.ts` — `generateSlug()`, `validateSlug()`, `isReservedSlug()`
- Auth response detection logic — `needsEmailConfirmation(response)`

### Unit Tests (Vitest)
- Slug generation from business names (edge cases: short names, special chars, unicode)
- Slug validation (valid/invalid patterns)
- Reserved slug checking
- Auth response branching (auto-confirm vs email-confirm)

### Integration Tests (Vitest)
- `POST /api/onboarding/create-tenant`:
  - 201: success with valid auth + input
  - 401: no auth
  - 400: invalid input (bad slug, missing fields)
  - 409: duplicate slug
  - 403: reserved slug
  - 409: user already owns a tenant

### Component Tests (Vitest + React Testing Library)
- Signup form: renders, validates, shows "check email" vs redirects
- Onboarding form: step navigation, slug auto-generation, error states, loading

### E2E Tests (Playwright)
- Full flow: signup → onboarding → tenant dashboard redirect
- Requires local Supabase running

### Obsidian Knowledge Graph
- Feature note: "Tenant Account Setup"
- Entity notes for new components/utilities
- Flow note: signup → onboarding → dashboard

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `supabase/config.toml` | Create | Local Supabase config |
| `supabase/migrations/0002_create_tenant_function.sql` | Create | Atomic tenant creation function |
| `src/lib/utils/slug.ts` | Create | Slug utilities (generate, validate, reserved check) |
| `src/lib/auth/helpers.ts` | Create | Auth response helpers (needsEmailConfirmation) |
| `src/app/(marketing)/signup/page.tsx` | Modify | Handle auto-confirm vs email-confirm |
| `src/app/(marketing)/onboarding/layout.tsx` | Create | Server-side auth guard |
| `src/app/(marketing)/onboarding/page.tsx` | Modify | Use slug utils, fix redirect |
| `src/app/api/onboarding/create-tenant/route.ts` | Modify | Use RPC, add tenant limit + reserved slug check |
| `.env.local.example` | Modify | Add `NEXT_PUBLIC_APP_DOMAIN` |
| Tests (multiple) | Create | Unit, integration, component, E2E |
