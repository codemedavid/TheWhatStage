---
tags:
  - entity
table: messages
subsystem: messenger
created: 2026-04-18
---

# messages

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default uuid_generate_v4() |
| conversation_id | uuid | FK → conversations, NOT NULL, ON DELETE CASCADE |
| direction | text | NOT NULL, check in ('in','out') |
| text | text | nullable |
| attachments | jsonb | nullable |
| mid | text | nullable, Facebook message ID |
| created_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Belongs to** [[conversations]] via `conversation_id`

## Used By Features

- [[Message Handling]]
- [[Send API]]
- [[Conversation Inbox]]
- [[Test Conversation]]

## Used By Components

- [[FbWebhookRoute]]
- [[DashboardNav]]
- [[BotPage]]

## RLS Policy

`messages_all` — Messages are accessible when their conversation_id belongs to a conversation where tenant_id = current_tenant_id().
