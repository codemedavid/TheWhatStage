-- =============================================================
-- WhatStage — Initial Database Schema
-- =============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =============================================================
-- TENANTS
-- =============================================================

create type business_type as enum ('ecommerce', 'real_estate', 'digital_product', 'services');
create type bot_goal as enum ('qualify_leads', 'sell', 'understand_intent', 'collect_lead_info');

create table tenants (
  id            uuid primary key default uuid_generate_v4(),
  slug          text unique not null check (slug ~ '^[a-z0-9][a-z0-9\-]{1,61}[a-z0-9]$'),
  name          text not null,
  business_type business_type not null default 'services',
  bot_goal      bot_goal not null default 'qualify_leads',
  fb_page_id    text,
  fb_page_token text,   -- encrypted at app level before storing
  fb_app_secret text,   -- encrypted at app level before storing
  fb_verify_token text,
  created_at    timestamptz not null default now()
);

create table tenant_members (
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner', 'admin', 'agent')) default 'owner',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

-- Helper function: resolve tenant_id from current auth session
create or replace function current_tenant_id()
returns uuid
language sql
stable
security definer
as $$
  select tenant_id
  from tenant_members
  where user_id = auth.uid()
  limit 1;
$$;

-- =============================================================
-- LEADS & PIPELINE
-- =============================================================

create table stages (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  order_index integer not null default 0,
  color       text not null default '#6366f1'
);

create table leads (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  psid            text not null,
  fb_name         text,
  fb_profile_pic  text,
  stage_id        uuid references stages(id) on delete set null,
  tags            text[] not null default '{}',
  created_at      timestamptz not null default now(),
  last_active_at  timestamptz not null default now(),
  unique (tenant_id, psid)
);

create type lead_event_type as enum (
  'message_in',
  'message_out',
  'action_click',
  'form_submit',
  'appointment_booked',
  'purchase',
  'stage_changed'
);

create table lead_events (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  lead_id    uuid not null references leads(id) on delete cascade,
  type       lead_event_type not null,
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- =============================================================
-- CONVERSATIONS & MESSAGES
-- =============================================================

create table conversations (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  lead_id         uuid not null references leads(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  unique (tenant_id, lead_id)
);

create table messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction       text not null check (direction in ('in', 'out')),
  text            text,
  attachments     jsonb,
  mid             text,  -- Facebook message ID
  created_at      timestamptz not null default now()
);

-- =============================================================
-- ACTION PAGES
-- =============================================================

create type action_page_type as enum ('form', 'calendar', 'sales', 'product_catalog', 'checkout');

create table action_pages (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  slug       text not null,
  type       action_page_type not null,
  title      text not null,
  config     jsonb not null default '{}',
  published  boolean not null default false,
  version    integer not null default 1,
  created_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create table action_submissions (
  id             uuid primary key default uuid_generate_v4(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  action_page_id uuid not null references action_pages(id) on delete cascade,
  lead_id        uuid not null references leads(id) on delete cascade,
  psid           text not null,
  data           jsonb not null default '{}',
  created_at     timestamptz not null default now()
);

-- =============================================================
-- COMMERCE
-- =============================================================

create table products (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  price_cents integer not null check (price_cents >= 0),
  currency   text not null default 'usd',
  images     jsonb not null default '[]',
  stock      integer,
  created_at timestamptz not null default now()
);

create type order_status as enum ('pending', 'paid', 'fulfilled', 'cancelled');

create table orders (
  id                       uuid primary key default uuid_generate_v4(),
  tenant_id                uuid not null references tenants(id) on delete cascade,
  lead_id                  uuid not null references leads(id) on delete cascade,
  status                   order_status not null default 'pending',
  total_cents              integer not null check (total_cents >= 0),
  items                    jsonb not null default '[]',
  payment_reference text,  -- manual or third-party reference
  created_at               timestamptz not null default now()
);

create type appointment_status as enum ('scheduled', 'confirmed', 'cancelled', 'completed');

create table appointments (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  lead_id    uuid not null references leads(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  status     appointment_status not null default 'scheduled',
  notes      text,
  created_at timestamptz not null default now()
);

-- =============================================================
-- BOT & WORKFLOWS
-- =============================================================

create table bot_flows (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  trigger    text not null,
  config     jsonb not null default '{}',
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);

create table workflows (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  trigger    jsonb not null default '{}',
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);

create type workflow_step_type as enum (
  'send_message',
  'send_image',
  'wait',
  'condition',
  'move_stage',
  'tag',
  'http'
);

create table workflow_steps (
  id          uuid primary key default uuid_generate_v4(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  order_index integer not null default 0,
  type        workflow_step_type not null,
  config      jsonb not null default '{}'
);

create type workflow_run_status as enum ('running', 'completed', 'failed');

create table workflow_runs (
  id          uuid primary key default uuid_generate_v4(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  lead_id     uuid not null references leads(id) on delete cascade,
  status      workflow_run_status not null default 'running',
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  log         jsonb not null default '[]'
);

-- =============================================================
-- INDEXES
-- =============================================================

create index on leads (tenant_id);
create index on leads (tenant_id, stage_id);
create index on leads (tenant_id, psid);
create index on lead_events (tenant_id, lead_id);
create index on lead_events (tenant_id, type);
create index on messages (conversation_id, created_at);
create index on action_pages (tenant_id, slug);
create index on action_submissions (tenant_id, action_page_id);
create index on workflow_runs (workflow_id, status);

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

alter table tenants enable row level security;
alter table tenant_members enable row level security;
alter table stages enable row level security;
alter table leads enable row level security;
alter table lead_events enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table action_pages enable row level security;
alter table action_submissions enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table appointments enable row level security;
alter table bot_flows enable row level security;
alter table workflows enable row level security;
alter table workflow_steps enable row level security;
alter table workflow_runs enable row level security;

-- tenants: members can read their own tenant
create policy "tenant_members_read_tenant"
  on tenants for select
  using (id = current_tenant_id());

create policy "tenant_members_update_tenant"
  on tenants for update
  using (id = current_tenant_id());

-- tenant_members
create policy "tenant_members_select"
  on tenant_members for select
  using (tenant_id = current_tenant_id());

-- Generic macro for tenant-scoped tables
-- Each table: select/insert/update/delete scoped to current_tenant_id()

-- stages
create policy "stages_all" on stages for all
  using (tenant_id = current_tenant_id());

-- leads
create policy "leads_all" on leads for all
  using (tenant_id = current_tenant_id());

-- lead_events
create policy "lead_events_all" on lead_events for all
  using (tenant_id = current_tenant_id());

-- conversations
create policy "conversations_all" on conversations for all
  using (tenant_id = current_tenant_id());

-- messages (via conversation → tenant)
create policy "messages_all" on messages for all
  using (
    conversation_id in (
      select id from conversations where tenant_id = current_tenant_id()
    )
  );

-- action_pages
create policy "action_pages_all" on action_pages for all
  using (tenant_id = current_tenant_id());

-- action_submissions
create policy "action_submissions_all" on action_submissions for all
  using (tenant_id = current_tenant_id());

-- products
create policy "products_all" on products for all
  using (tenant_id = current_tenant_id());

-- orders
create policy "orders_all" on orders for all
  using (tenant_id = current_tenant_id());

-- appointments
create policy "appointments_all" on appointments for all
  using (tenant_id = current_tenant_id());

-- bot_flows
create policy "bot_flows_all" on bot_flows for all
  using (tenant_id = current_tenant_id());

-- workflows
create policy "workflows_all" on workflows for all
  using (tenant_id = current_tenant_id());

-- workflow_steps (via workflow → tenant)
create policy "workflow_steps_all" on workflow_steps for all
  using (
    workflow_id in (
      select id from workflows where tenant_id = current_tenant_id()
    )
  );

-- workflow_runs
create policy "workflow_runs_all" on workflow_runs for all
  using (
    workflow_id in (
      select id from workflows where tenant_id = current_tenant_id()
    )
  );

-- =============================================================
-- SEED: Default stages for new tenants (via trigger)
-- =============================================================

create or replace function seed_default_stages()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into stages (tenant_id, name, order_index, color)
  values
    (new.id, 'New Lead',   0, '#6366f1'),
    (new.id, 'Engaged',    1, '#f59e0b'),
    (new.id, 'Qualified',  2, '#10b981'),
    (new.id, 'Customer',   3, '#3b82f6');
  return new;
end;
$$;

create trigger on_tenant_created
  after insert on tenants
  for each row execute function seed_default_stages();
