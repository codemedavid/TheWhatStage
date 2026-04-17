---
tags:
  - entity
table: leads
subsystem: leads
created: 2026-04-18
---

# leads

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default uuid_generate_v4() |
| tenant_id | uuid | FK → tenants, NOT NULL, ON DELETE CASCADE |
| psid | text | NOT NULL |
| fb_name | text | nullable |
| fb_profile_pic | text | nullable |
| stage_id | uuid | FK → stages, nullable, ON DELETE SET NULL |
| tags | text[] | NOT NULL, default '{}' |
| created_at | timestamptz | NOT NULL, default now() |
| last_active_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Belongs to** [[tenants]] via `tenant_id`
- **Belongs to** [[stages]] via `stage_id`
- **Has many** [[lead_events]]
- **Has many** [[conversations]]
- **Has many** [[action_submissions]]
- **Has many** [[orders]]
- **Has many** [[appointments]]
- **Has many** [[qualification_responses]]

## Used By Features

- [[Lead Pipeline]]
- [[Lead Profile]]
- [[Message Handling]]
- [[AI Reasoning]]
- [[Dashboard Home]]
- [[Conversation Inbox]]
- [[Analytics]]
- [[Qualification Data View]]

## Used By Components

- [[LeadsPage]]
- [[FbWebhookRoute]]
- [[DashboardNav]]

## RLS Policy

`leads_all` — Tenants can perform all operations on rows where tenant_id = current_tenant_id().
