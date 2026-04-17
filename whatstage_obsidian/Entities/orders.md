---
tags:
  - entity
table: orders
subsystem: commerce
created: 2026-04-18
---

# orders

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default uuid_generate_v4() |
| tenant_id | uuid | FK → tenants, NOT NULL, ON DELETE CASCADE |
| lead_id | uuid | FK → leads, NOT NULL, ON DELETE CASCADE |
| status | order_status enum | NOT NULL, default 'pending' |
| total_cents | integer | NOT NULL, check >= 0 |
| items | jsonb | NOT NULL, default '[]' |
| payment_reference | text | nullable |
| created_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Belongs to** [[tenants]] via `tenant_id`
- **Belongs to** [[leads]] via `lead_id`

## Used By Features

- [[Order Management]]
- [[Checkout]]
- [[Sales Push]]

## Used By Components

- [[LeadsPage]]
- [[ActionSlugPage]]

## RLS Policy

`orders_all` — Tenants can perform all operations on rows where tenant_id = current_tenant_id().
