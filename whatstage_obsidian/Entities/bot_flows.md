---
tags:
  - entity
table: bot_flows
subsystem: messenger
created: 2026-04-18
---

# bot_flows

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default uuid_generate_v4() |
| tenant_id | uuid | FK → tenants, NOT NULL, ON DELETE CASCADE |
| trigger | text | NOT NULL |
| config | jsonb | NOT NULL, default '{}' |
| enabled | boolean | NOT NULL, default true |
| created_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Belongs to** [[tenants]] via `tenant_id`

## Used By Features

- [[Bot Flows]]

## Used By Components

- [[BotPage]]

## RLS Policy

`bot_flows_all` — Tenants can perform all operations on rows where tenant_id = current_tenant_id().
