-- =============================================================
-- Bot Rules table
-- =============================================================

create table bot_rules (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  rule_text  text not null,
  category   text not null check (category in ('tone', 'boundary', 'behavior')) default 'behavior',
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);

create index on bot_rules (tenant_id);

alter table bot_rules enable row level security;

create policy "bot_rules_all" on bot_rules for all
  using (tenant_id = current_tenant_id());
