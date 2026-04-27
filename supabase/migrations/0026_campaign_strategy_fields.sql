-- supabase/migrations/0026_campaign_strategy_fields.sql
-- Campaign-level strategy fields and funnel-level pitch/qualification fields.

alter table campaigns
  add column if not exists main_goal text,
  add column if not exists campaign_personality text;

comment on column campaigns.main_goal is
  'Plain-language campaign objective used by the conversation engine as the active mission.';
comment on column campaigns.campaign_personality is
  'Optional campaign-specific personality override. Takes precedence over tenant default persona.';

alter table campaign_funnels
  add column if not exists pitch text,
  add column if not exists qualification_questions text[] not null default '{}';

comment on column campaign_funnels.pitch is
  'Short pitch for why this funnel action page is the right next step.';
comment on column campaign_funnels.qualification_questions is
  'Ordered first questions the bot should ask before pushing this funnel action button.';
