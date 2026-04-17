---
tags:
  - entity
table: qualification_responses
subsystem: goals
created: 2026-04-18
---

# qualification_responses

_Table not yet in migrations -- schema based on design spec._

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| form_id | uuid | FK → qualification_forms, NOT NULL, ON DELETE CASCADE |
| lead_id | uuid | FK → leads, NOT NULL, ON DELETE CASCADE |
| answers | jsonb | NOT NULL, default '{}' |
| score | integer | nullable |
| triggered_conditions | jsonb | NOT NULL, default '[]' |
| created_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Belongs to** [[qualification_forms]] via `form_id`
- **Belongs to** [[leads]] via `lead_id`

## Used By Features

- [[Qualification Engine]]
- [[Qualification Data View]]
- [[Lead Profile]]

## Used By Components

- [[LeadsPage]]
- [[ActionSlugPage]]

## RLS Policy

None defined yet.
