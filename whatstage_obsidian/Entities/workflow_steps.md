---
tags:
  - entity
table: workflow_steps
subsystem: workflows
created: 2026-04-18
---

# workflow_steps

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default uuid_generate_v4() |
| workflow_id | uuid | FK → workflows, NOT NULL, ON DELETE CASCADE |
| order_index | integer | NOT NULL, default 0 |
| type | workflow_step_type enum | NOT NULL |
| config | jsonb | NOT NULL, default '{}' |

## Relationships

- **Belongs to** [[workflows]] via `workflow_id`

## Used By Features

- [[Workflow Engine]]
- [[Workflow Builder]]
- [[Workflow Steps]]

## Used By Components

- [[WorkflowsPage]]

## RLS Policy

`workflow_steps_all` — Steps are accessible when their workflow_id belongs to a workflow where tenant_id = current_tenant_id().
