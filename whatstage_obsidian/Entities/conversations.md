---
tags:
  - entity
table: conversations
subsystem: messenger
created: 2026-04-18
---

# conversations

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default uuid_generate_v4() |
| tenant_id | uuid | FK → tenants, NOT NULL, ON DELETE CASCADE |
| lead_id | uuid | FK → leads, NOT NULL, ON DELETE CASCADE |
| last_message_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Belongs to** [[tenants]] via `tenant_id`
- **Belongs to** [[leads]] via `lead_id`
- **Has many** [[messages]]

## Used By Features

- [[Message Handling]]
- [[Conversation Inbox]]
- [[Test Conversation]]

## Used By Components

- [[FbWebhookRoute]]
- [[DashboardNav]]
- [[BotPage]]

## RLS Policy

`conversations_all` — Tenants can perform all operations on rows where tenant_id = current_tenant_id().
