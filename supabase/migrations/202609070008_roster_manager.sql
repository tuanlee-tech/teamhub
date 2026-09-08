-- Milestone 4: manager roster operations with auditing.
-- Removing a member from a required day does not delete data; any fine already
-- generated from auto-late is waived and the change is written to audit_logs.

create or replace function public.update_roster_membership(
  organization_id uuid,
  work_date date,
  target_user_id uuid,
  must_attend boolean,
  exclusion_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  day_row public.attendance_days;
  roster_row public.daily_roster;
  target_membership record;
begin
  if actor is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.organization_members membership
    where membership.organization_id = $1
      and membership.user_id = actor
      and membership.role = 'manager'
      and membership.status = 'active'
      and membership.is_active
  ) then
    raise exception 'not a manager';
  end if;

  select * into target_membership
  from public.organization_members membership
  where membership.organization_id = $1
    and membership.user_id = $3
    and membership.status = 'active'
    and membership.is_active;

  if target_membership.user_id is null then
    raise exception 'target is not an active member';
  end if;

  select * into day_row from private.get_or_create_attendance_day($1, $2);

  select * into roster_row
  from public.daily_roster
  where daily_roster.attendance_day_id = day_row.id
    and daily_roster.user_id = $3
  limit 1;

  if roster_row.id is null then
    raise exception 'target is not on the roster';
  end if;

  if $4 then
    update public.daily_roster
    set is_required = true,
        exclusion_reason = null,
        changed_by = actor,
        updated_at = now()
    where daily_roster.id = roster_row.id
      and daily_roster.is_required = false;
  else
    if exclusion_reason is null or trim(exclusion_reason) = '' then
      raise exception 'exclusion reason is required';
    end if;

    update public.daily_roster
    set is_required = false,
        exclusion_reason = trim($5),
        changed_by = actor,
        updated_at = now()
    where daily_roster.id = roster_row.id
      and daily_roster.is_required = true;

    -- Waive any fine already generated for this member on this day.
    update public.fines fines
    set status = 'waived',
        waived_at = now(),
        waived_by = actor,
        waiver_reason = 'removed from roster: ' || trim($5),
        updated_at = now()
    from public.attendance_records records
    where records.attendance_day_id = day_row.id
      and records.user_id = $3
      and fines.attendance_record_id = records.id
      and fines.status in ('unpaid');
  end if;

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    $1,
    actor,
    case when $4 then 'roster_member_restored' else 'roster_member_removed' end,
    'daily_roster',
    roster_row.id::text,
    jsonb_build_object(
      'work_date', $2,
      'user_id', $3,
      'is_required', $4,
      'exclusion_reason', $5
    )
  );
end;
$$;

revoke all on function public.update_roster_membership(uuid, date, uuid, boolean, text) from public, anon;
grant execute on function public.update_roster_membership(uuid, date, uuid, boolean, text) to authenticated;
