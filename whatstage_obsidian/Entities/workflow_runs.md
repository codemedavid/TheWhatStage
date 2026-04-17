---
tags:
  - entity
table: workflow_runs
subsystem: workflows
created: 2026-04-18
---

# workflow_runs

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default uuid_generate_v4() |
| workflow_id | uuid | FK → workflows, NOT NULL, ON DELETE CASCADE |
| lead_id | uuid | FK → leads, NOT NULL, ON DELETE CASCADE |
| status | workflow_run_status enum | NOT NULL, default 'running' |
| started_at | timestamptz | NOT NULL, default now() |
| finished_at | timestamptz | nullable |
| log | jsonb | NOT NULL, default '[]' |

## Relationships

- **Belongs to** [[workflows]] via `workflow_id`
- **Belongs to** [[leads]] via `lead_id`

## Used By Features

- [[Workflow Engine]]

## Used By Components

- [[WorkflowsPage]]

## RLS Policy

`workflow_runs_all` — Runs are accessible when their workflow_id belongs to a workflow where tenant_id = current_tenant_id().
