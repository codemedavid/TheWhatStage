---
tags:
  - entity
table: knowledge_chunks
subsystem: rag
created: 2026-04-18
---

# knowledge_chunks

_Table not yet in migrations -- schema based on design spec._

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| doc_id | uuid | FK → knowledge_docs, NOT NULL, ON DELETE CASCADE |
| content | text | NOT NULL |
| embedding | vector | nullable |
| metadata | jsonb | NOT NULL, default '{}' |
| created_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Belongs to** [[knowledge_docs]] via `doc_id`

## Used By Features

- [[Knowledge Base]]
- [[RAG Pipeline]]
- [[AI Reasoning]]

## Used By Components

- [[BotPage]]

## RLS Policy

None defined yet.
