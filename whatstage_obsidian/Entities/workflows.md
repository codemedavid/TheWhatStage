---
tags:
  - entity
table: workflows
subsystem: workflows
created: 2026-04-18
---

# workflows

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default uuid_generate_v4() |
| tenant_id | uuid | FK → tenants, NOT NULL, ON DELETE CASCADE |
| name | text | NOT NULL |
| trigger | jsonb | NOT NULL, default '{}' |
| enabled | boolean | NOT NULL, default true |
| created_at | timestamptz | NOT NULL, default now() |

## Relationships

- **Belongs to** [[tenants]] via `tenant_id`
- **Has many** [[workflow_steps]]
- **Has many** [[workflow_runs]]

## Used By Features

- [[Workflow Engine]]
- [[Workflow Builder]]
- [[Workflow Triggers]]

## Used By Components

- [[WorkflowsPage]]

## RLS Policy

`workflows_all` — Tenants can perform all operations on rows where tenant_id = current_tenant_id().
