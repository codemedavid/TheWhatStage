---
tags:
  - entity
table: bot_rules
subsystem: rag
created: 2026-04-18
---

# bot_rules

_Table not yet in migrations -- schema based on design spec._

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| tenant_id | uuid | FK → tenants, NOT NULL, ON DELETE CASCADE |
| rule_text | text | NOT NULL |
| source | text | NOT NULL, check in ('manual','correction') |
| enabled | boolean | NOT NULL, default true |
| created_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Belongs to** [[tenants]] via `tenant_id`
- **Has many** [[conversation_corrections]]

## Used By Features

- [[Bot Rules & Persona]]
- [[Conversation Review]]
- [[Training Dashboard]]

## Used By Components

- [[BotPage]]

## RLS Policy

None defined yet.
