create or replace function public.bootstrap_first_manager()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_organization_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtext('team-hub:first-manager'));

  select membership.organization_id
  into target_organization_id
  from public.organization_members membership
  where membership.user_id = current_user_id
  limit 1;

  if target_organization_id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = target_organization_id
      and membership.role = 'manager'
      and membership.status = 'active'
      and membership.is_active
  ) then
    return false;
  end if;

  update public.organization_members
  set
    role = 'manager',
    status = 'active',
    is_active = true,
    approved_at = now(),
    approved_by = current_user_id
  where organization_id = target_organization_id
    and user_id = current_user_id;

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id)
  values (target_organization_id, current_user_id, 'bootstrap_manager', 'organization_member', current_user_id::text);

  return found;
end;
$$;

revoke all on function public.bootstrap_first_manager() from public, anon;
grant execute on function public.bootstrap_first_manager() to authenticated;
