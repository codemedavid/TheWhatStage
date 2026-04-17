---
tags:
  - entity
  - utility
category: utility
subsystem: auth
created: 2026-04-18
---

# Slug Utilities

**File:** `src/lib/utils/slug.ts`

Pure functions for tenant slug management.

## Functions

- `generateSlug(name: string): string` — converts business name to kebab-case slug
- `validateSlug(slug: string): string | null` — returns error message or null if valid
- `isReservedSlug(slug: string): boolean` — checks against reserved subdomains (www, app, api)

## Used By

- [[OnboardingPage]] — slug auto-generation and validation
- [[CreateTenantRoute]] — reserved slug check before DB call

## Part Of

- [[Tenant Account Setup]]
