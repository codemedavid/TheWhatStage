-- Add handoff columns to conversations
alter table conversations
  add column bot_paused_at timestamptz,
  add column escalation_reason text,
  add column escalation_message_id uuid references messages(id) on delete set null;

-- Add handoff timeout setting to tenants
alter table tenants
  add column handoff_timeout_hours integer default 24;

-- Create escalation events audit table
create table escalation_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  type text not null,
  reason text,
  agent_user_id uuid,
  created_at timestamptz not null default now()
);

-- Indexes
create index on escalation_events (conversation_id);
create index on escalation_events (tenant_id);
create index on conversations (tenant_id) where needs_human = true;

-- RLS
alter table escalation_events enable row level security;

create policy "Tenant isolation" on escalation_events
  for all
  using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
