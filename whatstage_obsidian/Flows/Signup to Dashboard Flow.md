---
tags:
  - flow
status: implemented
subsystem: auth
created: 2026-04-18
---

# Signup to Dashboard Flow

## Diagram

```mermaid
graph TD
    A[User visits /signup] --> B[Submits email + password]
    B --> C{Auto-confirm enabled?}
    C -->|Yes| D[Redirect to /onboarding]
    C -->|No| E[Show "Check your email"]
    E --> F[User clicks email link]
    F --> G[/auth/callback exchanges code]
    G --> D
    D --> H{Session exists?}
    H -->|No| I[Redirect to /login]
    H -->|Yes| J[Step 1: Select business type]
    J --> K[Step 2: Select bot goal]
    K --> L[Step 3: Enter business name]
    L --> M[POST /api/onboarding/create-tenant]
    M --> N{Success?}
    N -->|Yes| O[Redirect to slug.domain/app/leads]
    N -->|No| P[Show error message]
```

## Key Files

| File | Role |
|------|------|
| `src/app/(marketing)/signup/page.tsx` | Signup form with email-confirm branching |
| `src/app/(marketing)/onboarding/layout.tsx` | Server-side auth guard |
| `src/app/(marketing)/onboarding/page.tsx` | Multi-step onboarding wizard |
| `src/app/api/onboarding/create-tenant/route.ts` | Tenant creation API |
| `src/app/auth/callback/route.ts` | Auth callback for email confirmation |
| `src/lib/utils/slug.ts` | Slug generation and validation |
| `src/lib/auth/helpers.ts` | Email confirmation detection |
| `supabase/migrations/0002_create_tenant_function.sql` | Atomic tenant creation |

## Components Involved

- [[SignupPage]]
- [[AuthCallbackRoute]]
- [[OnboardingPage]]
- [[CreateTenantRoute]]

## Entities Involved

- [[tenants]]
- [[tenant_members]]

## Part Of

- [[Tenant Account Setup]]
