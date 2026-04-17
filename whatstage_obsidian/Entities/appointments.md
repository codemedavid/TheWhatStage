---
tags:
  - entity
table: appointments
subsystem: commerce
created: 2026-04-18
---

# appointments

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default uuid_generate_v4() |
| tenant_id | uuid | FK → tenants, NOT NULL, ON DELETE CASCADE |
| lead_id | uuid | FK → leads, NOT NULL, ON DELETE CASCADE |
| starts_at | timestamptz | NOT NULL |
| ends_at | timestamptz | NOT NULL |
| status | appointment_status enum | NOT NULL, default 'scheduled' |
| notes | text | nullable |
| created_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Belongs to** [[tenants]] via `tenant_id`
- **Belongs to** [[leads]] via `lead_id`

## Used By Features

- [[Appointment Management]]
- [[Calendar Booking]]
- [[Booking Integration]]

## Used By Components

- [[LeadsPage]]
- [[ActionSlugPage]]

## RLS Policy

`appointments_all` — Tenants can perform all operations on rows where tenant_id = current_tenant_id().
