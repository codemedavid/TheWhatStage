-- supabase/migrations/0022_conversations_funnel_state.sql
alter table conversations
  add column current_campaign_id     uuid null references campaigns(id) on delete set null,
  add column current_funnel_id       uuid null references campaign_funnels(id) on delete set null,
  add column current_funnel_position integer not null default 0,
  add column funnel_message_count    integer not null default 0;

create index conversations_current_campaign_id_idx on conversations (current_campaign_id);
create index conversations_current_funnel_id_idx   on conversations (current_funnel_id);
