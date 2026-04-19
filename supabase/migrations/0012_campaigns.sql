-- =============================================================
-- Phase 9: Campaign Flow Builder
-- New tables for campaigns, experiments, and conversion tracking
-- =============================================================

-- CAMPAIGNS
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

create index on campaigns (tenant_id);
create unique index campaigns_one_primary_per_tenant on campaigns (tenant_id) where is_primary = true;

-- CAMPAIGN PHASES (replaces bot_flow_phases)
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

create index on campaign_phases (campaign_id);
create index on campaign_phases (tenant_id);

-- LEAD CAMPAIGN ASSIGNMENTS (permanent, one per lead)
create table lead_campaign_assignments (
  id           uuid primary key default uuid_generate_v4(),
  lead_id      uuid not null references leads(id) on delete cascade,
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  assigned_at  timestamptz not null default now(),
  unique (lead_id)
);

create index on lead_campaign_assignments (campaign_id);

-- EXPERIMENTS
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

create index on experiments (tenant_id);

-- EXPERIMENT ↔ CAMPAIGN join (with weight)
create table experiment_campaigns (
  experiment_id  uuid not null references experiments(id) on delete cascade,
  campaign_id    uuid not null references campaigns(id) on delete cascade,
  weight         integer not null default 50 check (weight > 0 and weight <= 100),
  primary key (experiment_id, campaign_id)
);

-- CAMPAIGN CONVERSIONS
create table campaign_conversions (
  id            uuid primary key default uuid_generate_v4(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  lead_id       uuid not null references leads(id) on delete cascade,
  converted_at  timestamptz not null default now(),
  metadata      jsonb not null default '{}'
);

create index on campaign_conversions (campaign_id);
create index on campaign_conversions (lead_id);

-- ALTER conversation_phases: add exit tracking + follow-up sentinel
alter table conversation_phases
  add column exited_at          timestamptz,
  add column exit_reason        text check (exit_reason in ('advanced', 'dropped', 'converted', 'human_handoff')),
  add column follow_ups_sent_at timestamptz;

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

alter table campaigns enable row level security;
create policy "campaigns_all" on campaigns for all
  using (tenant_id = current_tenant_id());

alter table campaign_phases enable row level security;
create policy "campaign_phases_all" on campaign_phases for all
  using (tenant_id = current_tenant_id());

alter table lead_campaign_assignments enable row level security;
create policy "lead_campaign_assignments_all" on lead_campaign_assignments for all
  using (lead_id in (select id from leads where tenant_id = current_tenant_id()));

alter table experiments enable row level security;
create policy "experiments_all" on experiments for all
  using (tenant_id = current_tenant_id());

alter table experiment_campaigns enable row level security;
create policy "experiment_campaigns_all" on experiment_campaigns for all
  using (experiment_id in (select id from experiments where tenant_id = current_tenant_id()));

alter table campaign_conversions enable row level security;
create policy "campaign_conversions_all" on campaign_conversions for all
  using (campaign_id in (select id from campaigns where tenant_id = current_tenant_id()));
