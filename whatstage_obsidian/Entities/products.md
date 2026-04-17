---
tags:
  - entity
table: products
subsystem: commerce
created: 2026-04-18
---

# products

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default uuid_generate_v4() |
| tenant_id | uuid | FK → tenants, NOT NULL, ON DELETE CASCADE |
| name | text | NOT NULL |
| price_cents | integer | NOT NULL, check >= 0 |
| currency | text | NOT NULL, default 'usd' |
| images | jsonb | NOT NULL, default '[]' |
| stock | integer | nullable |
| created_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Belongs to** [[tenants]] via `tenant_id`
- **Has many** [[orders]]

## Used By Features

- [[Product Management]]
- [[Product Catalog]]
- [[Sales Push]]

## Used By Components

- [[ActionsPage]]
- [[ActionSlugPage]]

## RLS Policy

`products_all` — Tenants can perform all operations on rows where tenant_id = current_tenant_id().
