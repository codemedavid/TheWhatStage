---
tags:
  - entity
table: action_conditions
subsystem: goals
created: 2026-04-18
---

# action_conditions

_Table not yet in migrations -- schema based on design spec._

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| tenant_id | uuid | FK → tenants, NOT NULL, ON DELETE CASCADE |
| action_page_id | uuid | FK → action_pages, NOT NULL, ON DELETE CASCADE |
| condition | jsonb | NOT NULL |
| actions | jsonb | NOT NULL, default '{}' |
| created_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Belongs to** [[tenants]] via `tenant_id`
- **Belongs to** [[action_pages]] via `action_page_id`

## Used By Features

- [[Action Conditions]]

## Used By Components

- [[ActionsPage]]

## RLS Policy

None defined yet.
