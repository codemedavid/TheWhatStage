---
tags:
  - entity
table: tenant_members
subsystem: auth
created: 2026-04-18
---

# tenant_members

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| tenant_id | uuid | PK (composite), FK → tenants, NOT NULL, ON DELETE CASCADE |
| user_id | uuid | PK (composite), FK → auth.users, NOT NULL, ON DELETE CASCADE |
| role | text | NOT NULL, check in ('owner','admin','agent'), default 'owner' |
| created_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Belongs to** [[tenants]] via `tenant_id`

## Used By Features

- [[Auth Flow]]
- [[Tenant Management]]
- [[Onboarding]]

## Used By Components

- [[LoginPage]]
- [[SignupPage]]
- [[AuthCallbackRoute]]
- [[SettingsPage]]
- [[OnboardingPage]]

## RLS Policy

`tenant_members_select` — Members can only SELECT rows where tenant_id = current_tenant_id().
