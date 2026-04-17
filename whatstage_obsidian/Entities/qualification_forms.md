---
tags:
  - entity
table: qualification_forms
subsystem: goals
created: 2026-04-18
---

# qualification_forms

_Table not yet in migrations -- schema based on design spec._

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| tenant_id | uuid | FK → tenants, NOT NULL, ON DELETE CASCADE |
| fields | jsonb | NOT NULL, default '[]' |
| scoring_rules | jsonb | NOT NULL, default '{}' |
| conditions | jsonb | NOT NULL, default '[]' |
| created_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Belongs to** [[tenants]] via `tenant_id`
- **Has many** [[qualification_responses]]

## Used By Features

- [[Qualification Engine]]

## Used By Components

- [[ActionsPage]]
- [[ActionSlugPage]]

## RLS Policy

None defined yet.
