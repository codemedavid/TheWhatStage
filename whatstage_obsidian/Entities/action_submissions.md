---
tags:
  - entity
table: action_submissions
subsystem: actions
created: 2026-04-18
---

# action_submissions

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default uuid_generate_v4() |
| tenant_id | uuid | FK → tenants, NOT NULL, ON DELETE CASCADE |
| action_page_id | uuid | FK → action_pages, NOT NULL, ON DELETE CASCADE |
| lead_id | uuid | FK → leads, NOT NULL, ON DELETE CASCADE |
| psid | text | NOT NULL |
| data | jsonb | NOT NULL, default '{}' |
| created_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Belongs to** [[tenants]] via `tenant_id`
- **Belongs to** [[action_pages]] via `action_page_id`
- **Belongs to** [[leads]] via `lead_id`

## Used By Features

- [[Form Pages]]
- [[Checkout]]
- [[Analytics]]

## Used By Components

- [[ActionSlugPage]]

## RLS Policy

`action_submissions_all` — Tenants can perform all operations on rows where tenant_id = current_tenant_id().
