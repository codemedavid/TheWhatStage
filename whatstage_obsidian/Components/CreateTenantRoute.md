---
tags:
  - component
  - api-route
file_path: src/app/api/onboarding/create-tenant/route.ts
route: /api/onboarding/create-tenant
subsystem: auth
context: api
created: 2026-04-18
---

# CreateTenantRoute

## Description

API endpoint that creates a new tenant record, associates the current user as owner, and seeds default pipeline stages.

## Route

`/api/onboarding/create-tenant` -- api context

## Data Consumed

- [[tenants]]
- [[tenant_members]]
- [[stages]]

## Part Of

- [[Onboarding]]
- [[Tenant Onboarding Flow]]

## Source

`src/app/api/onboarding/create-tenant/route.ts`
