---
tags:
  - feature
status: implemented
subsystem: auth
created: 2026-04-18
---

# Tenant Account Setup

The signup → onboarding → tenant creation → dashboard redirect flow.

## Components

- [[SignupPage]] — email/password signup with auto-confirm/email-confirm branching
- [[OnboardingPage]] — multi-step wizard (business type → bot goal → workspace name)
- [[CreateTenantRoute]] — `POST /api/onboarding/create-tenant` with RPC, tenant limit, reserved slugs

## Utilities

- [[Slug Utilities]] — `generateSlug()`, `validateSlug()`, `isReservedSlug()`
- [[Auth Helpers]] — `needsEmailConfirmation()`

## Database

- `create_tenant_with_owner` — Postgres function for atomic tenant + owner creation
- [[tenants]] table — workspace records
- [[tenant_members]] table — user-tenant relationships

## Flow

1. User signs up at `/signup`
2. If auto-confirm: redirect to `/onboarding`. If email-confirm: show "check your email"
3. Auth callback exchanges code for session, redirects to `/onboarding`
4. Onboarding guard checks session (redirects to `/login` if unauthenticated)
5. User selects business type → bot goal → enters business name (slug auto-generates)
6. `POST /api/onboarding/create-tenant` creates tenant + owner atomically
7. Redirect to `{slug}.{domain}/app/leads`

## Security

- Server-side auth guard on onboarding
- Reserved slug protection (www, app, api) at client + DB level
- Tenant limit: 1 tenant per user (owner role)
- Atomic transaction via Postgres function
- Zod input validation on API route

## Related Flows

- [[Signup to Dashboard Flow]]
- [[Tenant Onboarding Flow]]
