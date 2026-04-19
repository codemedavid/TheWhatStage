-- =============================================================
-- Migrate bot_flow_phases → campaign_phases
-- Creates a "Default Campaign" per tenant, copies phases,
-- re-points conversation_phases FKs, renames old table.
-- =============================================================

do $$
declare
  t record;
  new_campaign_id uuid;
  phase record;
  new_phase_id uuid;
begin
  -- For each tenant that has bot_flow_phases rows: create a campaign + copy phases
  for t in select distinct bfp.tenant_id, tn.bot_goal
           from bot_flow_phases bfp
           join tenants tn on tn.id = bfp.tenant_id
  loop
    insert into campaigns (tenant_id, name, description, goal, is_primary, status)
    values (
      t.tenant_id,
      'Default Campaign',
      'Migrated from flow builder',
      case t.bot_goal
        when 'sell' then 'purchase'
        when 'qualify_leads' then 'form_submit'
        when 'understand_intent' then 'form_submit'
        when 'collect_lead_info' then 'form_submit'
      end,
      true,
      'active'
    )
    returning id into new_campaign_id;

    for phase in
      select * from bot_flow_phases
      where tenant_id = t.tenant_id
      order by order_index
    loop
      insert into campaign_phases (
        campaign_id, tenant_id, name, order_index, max_messages,
        system_prompt, tone, goals, transition_hint,
        action_button_ids, image_attachment_ids, created_at
      ) values (
        new_campaign_id, phase.tenant_id, phase.name, phase.order_index,
        phase.max_messages, phase.system_prompt, phase.tone, phase.goals,
        phase.transition_hint,
        coalesce(phase.action_button_ids, '{}'),
        coalesce(phase.image_attachment_ids, '{}'),
        phase.created_at
      )
      returning id into new_phase_id;

      -- Re-point conversation_phases to the new campaign_phases row
      update conversation_phases
        set phase_id = new_phase_id
        where phase_id = phase.id;
    end loop;
  end loop;

  -- Create empty primary campaign for tenants with no existing phases
  insert into campaigns (tenant_id, name, goal, is_primary, status)
  select id, 'Default Campaign', 'form_submit', true, 'active'
  from tenants
  where id not in (select tenant_id from campaigns);
end $$;

-- Drop old FK constraint on conversation_phases → bot_flow_phases
alter table conversation_phases
  drop constraint conversation_phases_phase_id_fkey;

-- Add new FK constraint → campaign_phases
alter table conversation_phases
  add constraint conversation_phases_phase_id_fkey
  foreign key (phase_id) references campaign_phases(id) on delete cascade;

-- Rename old table (keep as backup, drop in a future migration)
alter table bot_flow_phases rename to _deprecated_bot_flow_phases;
