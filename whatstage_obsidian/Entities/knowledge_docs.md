---
tags:
  - entity
table: knowledge_docs
subsystem: rag
created: 2026-04-18
---

# knowledge_docs

_Table not yet in migrations -- schema based on design spec._

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| tenant_id | uuid | FK → tenants, NOT NULL, ON DELETE CASCADE |
| title | text | NOT NULL |
| content | text | NOT NULL |
| type | text | NOT NULL |
| created_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Belongs to** [[tenants]] via `tenant_id`
- **Has many** [[knowledge_chunks]]

## Used By Features

- [[Knowledge Base]]
- [[Training Dashboard]]

## Used By Components

- [[BotPage]]

## RLS Policy

None defined yet.
