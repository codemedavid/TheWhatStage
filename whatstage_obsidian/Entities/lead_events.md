---
tags:
  - entity
table: lead_events
subsystem: leads
created: 2026-04-18
---

# lead_events

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default uuid_generate_v4() |
| tenant_id | uuid | FK → tenants, NOT NULL, ON DELETE CASCADE |
| lead_id | uuid | FK → leads, NOT NULL, ON DELETE CASCADE |
| type | lead_event_type enum | NOT NULL |
| payload | jsonb | NOT NULL, default '{}' |
| created_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Belongs to** [[tenants]] via `tenant_id`
- **Belongs to** [[leads]] via `lead_id`

## Used By Features

- [[Activity Tracking]]
- [[Message Handling]]
- [[AI Reasoning]]
- [[Dashboard Home]]
- [[Analytics]]

## Used By Components

- [[LeadsPage]]
- [[DashboardNav]]
- [[FbWebhookRoute]]

## RLS Policy

`lead_events_all` — Tenants can perform all operations on rows where tenant_id = current_tenant_id().
