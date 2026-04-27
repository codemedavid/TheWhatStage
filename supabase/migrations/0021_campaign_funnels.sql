-- supabase/migrations/0021_campaign_funnels.sql
create table campaign_funnels (
  id               uuid primary key default uuid_generate_v4(),
  campaign_id      uuid not null references campaigns(id) on delete cascade,
  tenant_id        uuid not null references tenants(id) on delete cascade,
  position         integer not null,
  action_page_id   uuid not null references action_pages(id) on delete restrict,
  page_description text,
  pitch            text,
  qualification_questions text[] not null default '{}',
  chat_rules       text[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (campaign_id, position)
);

create index on campaign_funnels (campaign_id);
create index on campaign_funnels (tenant_id);

alter table campaign_funnels enable row level security;
create policy "campaign_funnels_all" on campaign_funnels for all
  using (tenant_id = current_tenant_id());
