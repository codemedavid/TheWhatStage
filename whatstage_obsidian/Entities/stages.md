---
tags:
  - entity
table: stages
subsystem: leads
created: 2026-04-18
---

# stages

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default uuid_generate_v4() |
| tenant_id | uuid | FK → tenants, NOT NULL, ON DELETE CASCADE |
| name | text | NOT NULL |
| order_index | integer | NOT NULL, default 0 |
| color | text | NOT NULL, default '#6366f1' |

## Relationships

- **Belongs to** [[tenants]] via `tenant_id`
- **Has many** [[leads]]

## Used By Features

- [[Lead Pipeline]]
- [[Stage Management]]
- [[Dashboard Home]]

## Used By Components

- [[LeadsPage]]
- [[SettingsPage]]

## RLS Policy

`stages_all` — Tenants can perform all operations on rows where tenant_id = current_tenant_id().
