---
tags:
  - entity
table: action_pages
subsystem: actions
created: 2026-04-18
---

# action_pages

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default uuid_generate_v4() |
| tenant_id | uuid | FK → tenants, NOT NULL, ON DELETE CASCADE |
| slug | text | NOT NULL |
| type | action_page_type enum | NOT NULL |
| title | text | NOT NULL |
| config | jsonb | NOT NULL, default '{}' |
| published | boolean | NOT NULL, default false |
| version | integer | NOT NULL, default 1 |
| created_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Belongs to** [[tenants]] via `tenant_id`
- **Has many** [[action_submissions]]
- **Has many** [[action_conditions]]

## Used By Features

- [[Form Pages]]
- [[Calendar Booking]]
- [[Sales Pages]]
- [[Product Catalog]]
- [[Action Page Builder]]
- [[Booking Integration]]
- [[Sales Push]]

## Used By Components

- [[ActionSlugPage]]
- [[ActionsPage]]

## RLS Policy

`action_pages_all` — Tenants can perform all operations on rows where tenant_id = current_tenant_id().
