---
tags:
  - entity
  - utility
category: utility
subsystem: auth
created: 2026-04-18
---

# Auth Helpers

**File:** `src/lib/auth/helpers.ts`

Pure functions for authentication response handling.

## Functions

- `needsEmailConfirmation(result): boolean` — detects if Supabase signup requires email verification

## Used By

- [[SignupPage]] — branches between "check your email" and redirect to onboarding

## Part Of

- [[Tenant Account Setup]]
- [[Auth Flow]]
