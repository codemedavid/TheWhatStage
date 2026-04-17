---
tags:
  - component
  - api-route
file_path: src/app/auth/callback/route.ts
route: /auth/callback
subsystem: auth
context: api
created: 2026-04-18
---

# AuthCallbackRoute

## Description

Supabase auth callback handler -- exchanges auth code for session, redirects to onboarding or dashboard.

## Route

`/auth/callback` -- api context

## Data Consumed

- [[tenant_members]]

## Part Of

- [[Auth Flow]]
- [[Tenant Onboarding Flow]]

## Source

`src/app/auth/callback/route.ts`
