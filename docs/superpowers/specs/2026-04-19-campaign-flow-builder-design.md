# Campaign Flow Builder — Design Spec

**Date:** 2026-04-19  
**Status:** Approved  
**Phase:** 9 (follows Phase 8: Human Handoff)

---

## Overview

Campaigns replace the existing per-tenant `bot_flow_phases` system and introduce a new layer of control: tenants can create multiple conversation campaigns, run A/B experiments across them, and track per-phase and per-campaign conversion metrics.

A **campaign** is a named, goal-oriented container for a conversation flow (a set of ordered phases). One campaign is always "primary" — the default for all new leads. Tenants can run A/B experiments by grouping campaigns and distributing new leads across them by weight. Assignments are permanent: a lead is always served by the same campaign across all conversations.

---

## Core Concepts

### Campaign
A campaign defines:
- A **goal** (what counts as a conversion): form submission, appointment booked, purchase, or reaching a specific pipeline stage
- A set of **phases** (ordered conversation stages with prompts, tone, action buttons, and image attachments)
- A **follow-up config**: how long to wait before sending a re-engagement message to a silent lead
- A **status**: `draft`, `active`, `paused`, or `archived`
- An `is_primary` flag: exactly one campaign per tenant is primary at all times

### Campaign Phases
Campaign phases replace `bot_flow_phases` entirely. They carry the same fields (name, order_index, max_messages, system_prompt, tone, goals, transition_hint, action_button_ids, image_attachment_ids) but are scoped to a campaign rather than the tenant.

`max_messages` is a **soft guideline** for the AI — a hint for when to consider transitioning, not a hard gate. The conversation engine already decides transitions based on context; phases are guardrails, not a rigid pipeline.

### Lead Campaign Assignment
On a lead's first message, the system assigns them to a campaign and records it in `lead_campaign_assignments`. This assignment is **permanent** — the same lead always runs through the same campaign regardless of how many conversations they have.

Assignment logic (in order):
1. If an experiment is `running` for this tenant → pick campaign by weighted random draw across `experiment_campaigns`
2. Otherwise → assign to the tenant's `is_primary` campaign

### Experiments
An experiment groups 2–4 campaigns for an A/B test over a defined period. Each variant has a weight (percentage of new leads assigned to it). The system tracks per-campaign conversion rates and surfaces a winner suggestion when:
- Every variant has reached `min_sample_size` assigned leads (default: 50)
- One variant's conversion rate is >10% better than all others (relative)

The tenant always makes the final call — the system suggests, never auto-promotes.

### Phase Success & Drop-off
A phase is considered **successful for a lead** when the lead advances to the next phase (or reaches the campaign goal). Phase success rate = `advanced / entered`.

A lead is considered to have **dropped off** from a phase when:
1. They have been silent for `follow_up_delay_minutes` → system sends the campaign's follow-up message via Facebook Messenger
2. If still no reply after another `follow_up_delay_minutes` → phase is marked `exit_reason = 'dropped'`

"Dropped" means the lead ignored even the re-engagement — a true cold lead.

### Campaign Conversion
A conversion is recorded when a `lead_event` insert matches the campaign's goal:

| Campaign goal | Matching lead_event.type |
|---|---|
| `form_submit` | `form_submit` |
| `appointment_booked` | `appointment_booked` |
| `purchase` | `purchase` |
| `stage_reached` | `stage_changed` + `payload.stage_id` matches `goal_config.stage_id` |

On match: insert `campaign_conversions`, mark open `conversation_phases.exit_reason = 'converted'`.

---

## Data Model

### New Tables

```sql
-- campaigns
create table campaigns (
  id                       uuid primary key default uuid_generate_v4(),
  tenant_id                uuid not null references tenants(id) on delete cascade,
  name                     text not null,
  description              text,
  goal                     text not null check (goal in ('form_submit', 'appointment_booked', 'purchase', 'stage_reached')),
  goal_config              jsonb not null default '{}',
  is_primary               boolean not null default false,
  status                   text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  follow_up_delay_minutes  integer not null default 120,
  follow_up_message        text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
-- Enforce one primary per tenant
create unique index campaigns_primary_unique on campaigns (tenant_id) where is_primary = true;

-- campaign_phases (replaces bot_flow_phases)
create table campaign_phases (
  id                    uuid primary key default uuid_generate_v4(),
  campaign_id           uuid not null references campaigns(id) on delete cascade,
  tenant_id             uuid not null references tenants(id) on delete cascade,
  name                  text not null,
  order_index           integer not null default 0,
  max_messages          integer not null default 3,
  system_prompt         text not null,
  tone                  text default 'friendly and helpful',
  goals                 text,
  transition_hint       text,
  action_button_ids     uuid[] not null default '{}',
  image_attachment_ids  uuid[] not null default '{}',
  created_at            timestamptz not null default now()
);

-- lead_campaign_assignments
create table lead_campaign_assignments (
  id           uuid primary key default uuid_generate_v4(),
  lead_id      uuid not null references leads(id) on delete cascade,
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  assigned_at  timestamptz not null default now(),
  unique (lead_id)  -- one permanent assignment per lead
);

-- experiments
create table experiments (
  id                  uuid primary key default uuid_generate_v4(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  name                text not null,
  status              text not null default 'draft' check (status in ('draft', 'running', 'paused', 'completed')),
  min_sample_size     integer not null default 50,
  started_at          timestamptz,
  ended_at            timestamptz,
  winner_campaign_id  uuid references campaigns(id) on delete set null,
  created_at          timestamptz not null default now()
);

-- experiment_campaigns (join: experiment ↔ campaign with weight)
create table experiment_campaigns (
  experiment_id  uuid not null references experiments(id) on delete cascade,
  campaign_id    uuid not null references campaigns(id) on delete cascade,
  weight         integer not null default 50 check (weight > 0 and weight <= 100),
  primary key (experiment_id, campaign_id)
);

-- campaign_conversions
create table campaign_conversions (
  id            uuid primary key default uuid_generate_v4(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  lead_id       uuid not null references leads(id) on delete cascade,
  converted_at  timestamptz not null default now(),
  metadata      jsonb not null default '{}'
);
```

### Modified Tables

```sql
-- conversation_phases: add exit tracking + follow-up sentinel
alter table conversation_phases
  add column exited_at          timestamptz,
  add column exit_reason        text check (exit_reason in ('advanced', 'dropped', 'converted', 'human_handoff')),
  add column follow_ups_sent_at timestamptz;  -- set when follow-up message is sent; prevents double-send

-- conversation_phases.phase_id FK changes from bot_flow_phases → campaign_phases
-- (handled in migration script, see Migration section)
```

### Deprecated Table

`bot_flow_phases` is kept as a read-only backup during rollout and dropped once migration is verified.

---

## API Routes

| Method | Route | Purpose |
|---|---|---|
| GET/POST | `/api/campaigns` | List + create campaigns |
| GET/PATCH/DELETE | `/api/campaigns/[id]` | Read, update, delete campaign |
| GET/POST | `/api/campaigns/[id]/phases` | List + create phases |
| PATCH/DELETE | `/api/campaigns/[id]/phases/[phaseId]` | Update, delete phase |
| POST | `/api/campaigns/[id]/phases/reorder` | Bulk reorder phases |
| GET | `/api/campaigns/[id]/metrics` | Phase funnel + conversion stats |
| GET/POST | `/api/experiments` | List + create experiments |
| GET/PATCH/DELETE | `/api/experiments/[id]` | Read, update, delete experiment |
| POST | `/api/experiments/[id]/promote` | Set winner + make campaign primary |
| POST | `/api/cron/drop-off-scanner` | Vercel Cron — runs every 15min |

---

## UI Structure

### Navigation change
`/app/campaigns` becomes a **top-level nav item**. The "Flow Builder" tab is removed from `/app/bot` — the campaign editor's Flow tab fully replaces it.

### Pages

**`/app/campaigns`** — Campaign list  
Shows all campaigns with status badges (PRIMARY, ACTIVE, IN TEST, DRAFT, ARCHIVED), conversion rate, and lead count. Links to `/app/campaigns/experiments`. "New Campaign" button.

**`/app/campaigns/new`** — Campaign creation  
Name, goal, follow-up config. Redirects to editor on create.

**`/app/campaigns/[id]`** — Campaign editor (3 tabs)  
- **Flow tab**: existing PhaseList/PhaseCard/PhaseForm components, now loading phases from `campaign_phases` for this campaign. Drag-to-reorder, action button picker, image picker — all unchanged UX.
- **Settings tab**: name, goal selector, goal_config (e.g., target stage), follow-up delay + message, status toggle, is_primary toggle.
- **Metrics tab**: summary stats (total leads, conversion rate, avg phases to convert, highest drop-off phase) + per-phase funnel with progress bars showing advance/drop rates.

**`/app/campaigns/experiments`** — Experiment list  
Shows running, completed, and draft experiments with status.

**`/app/campaigns/experiments/new`** — Create experiment  
Pick 2–4 campaigns, set weights (must be valid non-zero values), set min_sample_size, name the experiment.

**`/app/campaigns/experiments/[id]`** — Experiment detail  
Side-by-side metrics for each variant. Winner suggestion banner when criteria met. "Promote Winner" button (sets `winner_campaign_id`, marks experiment `completed`, makes winning campaign primary). "Pause" / "End" controls.

---

## Conversation Engine Changes

### Assignment (first message)
```
1. Look up lead_campaign_assignments by lead_id
2. Found → load campaign_phases for that campaign_id
3. Not found:
   a. Check for experiments.status = 'running' for this tenant
   b. If running → pick campaign by weighted random (normalize weights)
   c. If none → use campaigns.is_primary = true for this tenant
   d. INSERT lead_campaign_assignments
4. Load campaign_phases ordered by order_index
5. Continue with existing phase machine logic
```

### Phase tracking changes
- On phase entry: existing INSERT into `conversation_phases` is unchanged
- On phase exit (advance): UPDATE `conversation_phases SET exited_at = now(), exit_reason = 'advanced'`
- On conversion: UPDATE `conversation_phases SET exited_at = now(), exit_reason = 'converted'` + INSERT `campaign_conversions`
- On human handoff escalation: UPDATE `exit_reason = 'human_handoff'`

### Conversion detection
On `lead_events` insert (app-level, in the event creation path):
1. Look up the lead's campaign via `lead_campaign_assignments`
2. Check if `lead_event.type` matches `campaign.goal`
3. If match (and not already converted): INSERT `campaign_conversions`, UPDATE open `conversation_phases`

---

## Background Job — Drop-off Scanner

**Route:** `POST /api/cron/drop-off-scanner`  
**Schedule:** `*/15 * * * *` (every 15 minutes, configured in `vercel.json`)  
**Auth:** Vercel Cron secret header

**Logic:**
1. Query all open `conversation_phases` (exited_at IS NULL) where:
   - `entered_at < now() - follow_up_delay_minutes`
   - No messages in the conversation since `entered_at`
2. For each: send `campaign.follow_up_message` via Facebook Messenger
3. Separately: query phases where follow-up was sent and still no reply after another `follow_up_delay_minutes` → `UPDATE exited_at = now(), exit_reason = 'dropped'`

A `follow_ups_sent_at` column on `conversation_phases` tracks whether the follow-up was already sent to avoid double-sending.

---

## Migration Plan

Migration runs as a single SQL transaction in a new migration file:

1. Create all new tables (campaigns, campaign_phases, lead_campaign_assignments, experiments, experiment_campaigns, campaign_conversions)
2. Alter `conversation_phases` (add exited_at, exit_reason, follow_ups_sent_at)
3. For each tenant with existing `bot_flow_phases`:
   - INSERT a "Default Campaign" (`is_primary = true`, `goal` mapped from tenant `bot_goal`)
   - INSERT all `bot_flow_phases` rows → `campaign_phases` (preserving all fields, setting `campaign_id`)
   - UPDATE `conversation_phases.phase_id` to new `campaign_phases` IDs
4. Tenants with no existing phases get an empty primary campaign
5. `bot_flow_phases` table renamed to `_deprecated_bot_flow_phases` (dropped in follow-up migration after verification)

---

## Metrics Computation

All metrics are computed at query time from `conversation_phases` and `campaign_conversions`. No pre-aggregated tables — acceptable at current scale, revisit with materialized views if query time degrades.

**Per-phase metrics:**
- `entered` = COUNT(conversation_phases WHERE phase_id = X)
- `advanced` = COUNT WHERE exit_reason IN ('advanced', 'converted')
- `dropped` = COUNT WHERE exit_reason = 'dropped'
- `success_rate` = advanced / entered
- `avg_messages` = AVG(message_count)
- `avg_time_in_phase` = AVG(exited_at - entered_at) WHERE exited_at IS NOT NULL

**Campaign-level metrics:**
- `total_leads` = COUNT(lead_campaign_assignments WHERE campaign_id = X)
- `converted` = COUNT(campaign_conversions WHERE campaign_id = X)
- `conversion_rate` = converted / total_leads
- `avg_phases_to_convert` = AVG(phase order_index at conversion) for converted leads

**Experiment winner suggestion:**
- All variants >= `min_sample_size` assigned leads
- Best conversion_rate > all others by >10% relative
- Surface as a banner in the experiment detail page — no auto-action

---

## Testing Strategy

- **Unit tests**: campaign assignment logic, weighted random draw, conversion event matching, metrics calculation functions
- **Integration tests**: full assignment flow, conversion detection via lead_event, drop-off scanner logic
- **Component tests**: CampaignList, CampaignEditor tabs, ExperimentDetail, phase funnel chart
- **E2E tests**: create campaign → build phases → lead assigned → converts → metrics update; run experiment → check metrics → promote winner

---

## Out of Scope (future)

- Workflow integration for follow-up (currently just a plain FB message)
- Materialized views for metrics at scale
- Per-phase follow-up configuration (currently per-campaign)
- Campaign duplication / cloning UI
- Time-series metrics charts (currently aggregate only)
