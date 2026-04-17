---
tags:
  - entity
table: tenants
subsystem: auth
created: 2026-04-18
---

# tenants

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default uuid_generate_v4() |
| slug | text | UNIQUE, NOT NULL, regex check |
| name | text | NOT NULL |
| business_type | business_type enum | NOT NULL, default 'services' |
| bot_goal | bot_goal enum | NOT NULL, default 'qualify_leads' |
| fb_page_id | text | nullable |
| fb_page_token | text | nullable, encrypted at app level |
| fb_app_secret | text | nullable, encrypted at app level |
| fb_verify_token | text | nullable |
| created_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Has many** [[tenant_members]]
- **Has many** [[leads]]
- **Has many** [[stages]]
- **Has many** [[action_pages]]
- **Has many** [[products]]
- **Has many** [[bot_flows]]
- **Has many** [[workflows]]
- **Has many** [[knowledge_docs]]
- **Has many** [[bot_rules]]
- **Has many** [[qualification_forms]]

## Used By Features

- [[Tenant Routing]]
- [[Tenant Management]]
- [[Onboarding]]
- [[Goal Configuration]]

## Used By Components

- [[Middleware]]
- [[SettingsPage]]
- [[OnboardingPage]]
- [[CreateTenantRoute]]

## RLS Policy

`tenant_members_read_tenant` — Members can SELECT their own tenant where id = current_tenant_id(). `tenant_members_update_tenant` — Members can UPDATE their own tenant where id = current_tenant_id().
