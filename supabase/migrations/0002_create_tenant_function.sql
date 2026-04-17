-- =============================================================
-- Atomic tenant creation with owner membership
-- =============================================================

create or replace function create_tenant_with_owner(
  p_name        text,
  p_slug        text,
  p_business_type business_type,
  p_bot_goal    bot_goal,
  p_user_id     uuid
)
returns table(id uuid, slug text)
language plpgsql
security definer
as $$
declare
  v_tenant_id uuid;
  v_reserved  text[] := array['www', 'app', 'api'];
begin
  -- Check reserved slugs
  if p_slug = any(v_reserved) then
    raise exception 'Slug "%" is reserved', p_slug
      using errcode = 'P0001';
  end if;

  -- Insert tenant
  insert into tenants (name, slug, business_type, bot_goal)
  values (p_name, p_slug, p_business_type, p_bot_goal)
  returning tenants.id into v_tenant_id;

  -- Insert owner membership
  insert into tenant_members (tenant_id, user_id, role)
  values (v_tenant_id, p_user_id, 'owner');

  -- Return the created tenant
  return query select v_tenant_id as id, p_slug as slug;
end;
$$;
