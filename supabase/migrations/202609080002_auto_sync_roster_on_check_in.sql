-- Keep daily roster membership current without requiring a manager to open the roster page.
-- Check-in already resolves the attendance day, so use that path to idempotently add
-- every active member before the member roster row is looked up.

create or replace function private.get_or_create_attendance_day(
  p_organization_id uuid,
  p_work_date date
)
returns public.attendance_days
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_day public.attendance_days;
  tz text;
  session_start_val time;
  session_end_val time;
  valid_check_in_val time;
  highest_threshold integer;
  tier_rows jsonb;
begin
  select * into found_day
  from public.attendance_days
  where attendance_days.organization_id = $1
    and attendance_days.work_date = $2
  limit 1;

  if found_day.id is null then
    select settings.timezone, settings.session_start, settings.session_end, settings.valid_check_in_time
      into tz, session_start_val, session_end_val, valid_check_in_val
    from public.organization_settings settings
    where settings.organization_id = $1
    for share;

    if tz is null then
      raise exception 'organization settings not found';
    end if;

    select coalesce(max(tiers.threshold_minutes), 0)
      into highest_threshold
    from public.penalty_tiers tiers
    where tiers.organization_id = $1
      and tiers.is_active;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'threshold_minutes', tiers.threshold_minutes,
          'amount_vnd', tiers.amount_vnd
        )
        order by tiers.threshold_minutes
      ),
      '[]'::jsonb
    )
      into tier_rows
    from public.penalty_tiers tiers
    where tiers.organization_id = $1
      and tiers.is_active;

    insert into public.attendance_days (
      organization_id,
      work_date,
      timezone,
      session_start_at,
      session_end_at,
      valid_check_in_at,
      auto_late_at,
      tier_snapshot,
      status
    )
    values (
      $1,
      $2,
      tz,
      (($2 + session_start_val)::timestamp at time zone tz),
      (($2 + session_end_val)::timestamp at time zone tz),
      (($2 + valid_check_in_val)::timestamp at time zone tz),
      case
        when highest_threshold > 0
          then (($2 + valid_check_in_val)::timestamp at time zone tz) + make_interval(mins => highest_threshold + 1)
        else (($2 + session_end_val)::timestamp at time zone tz)
      end,
      tier_rows,
      'open'
    )
    on conflict (organization_id, work_date) do nothing;

    select * into found_day
    from public.attendance_days
    where attendance_days.organization_id = $1
      and attendance_days.work_date = $2
    limit 1;
  end if;

  insert into public.daily_roster (organization_id, attendance_day_id, user_id)
  select membership.organization_id, found_day.id, membership.user_id
  from public.organization_members membership
  where membership.organization_id = $1
    and membership.status = 'active'
    and membership.is_active
    and not exists (
      select 1
      from public.daily_roster existing
      where existing.attendance_day_id = found_day.id
        and existing.user_id = membership.user_id
    )
  on conflict (attendance_day_id, user_id) do nothing;

  return found_day;
end;
$$;
