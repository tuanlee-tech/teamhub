create or replace function public.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_user_id = auth.uid()
    or public.shares_active_organization(target_user_id)
    or exists (
      select 1
      from public.organization_members target_membership
      join public.organization_members manager_membership
        on manager_membership.organization_id = target_membership.organization_id
      where target_membership.user_id = target_user_id
        and manager_membership.user_id = auth.uid()
        and manager_membership.role = 'manager'
        and manager_membership.status = 'active'
        and manager_membership.is_active
    );
$$;

revoke all on function public.can_view_profile(uuid) from public;
grant execute on function public.can_view_profile(uuid) to authenticated;

drop policy "users can view visible profiles" on public.profiles;
create policy "users can view visible profiles"
on public.profiles for select to authenticated
using (public.can_view_profile(user_id));

create policy "managers can insert audit logs"
on public.audit_logs for insert to authenticated
with check (
  actor_id = auth.uid()
  and organization_id is not null
  and public.is_manager(organization_id)
);
