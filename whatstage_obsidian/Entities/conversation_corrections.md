---
tags:
  - entity
table: conversation_corrections
subsystem: rag
created: 2026-04-18
---

# conversation_corrections

_Table not yet in migrations -- schema based on design spec._

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| conversation_id | uuid | FK → conversations, NOT NULL |
| message_id | uuid | FK → messages, NOT NULL |
| correction_text | text | NOT NULL |
| applied_as_rule | boolean | NOT NULL, default false |
| created_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Belongs to** [[conversations]] via `conversation_id`
- **Belongs to** [[messages]] via `message_id`
- **Belongs to** [[bot_rules]] (when applied as rule)

## Used By Features

- [[Conversation Review]]

## Used By Components

- [[BotPage]]

## RLS Policy

None defined yet.
