-- Fix the meaning of the late boundary and empty penalty configuration.
-- A valid_check_in_time of 09:36 means valid through 09:35:59.
-- Without penalty tiers, auto-late should run at the end of the session.

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

  if found_day.id is not null then
    return found_day;
  end if;

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

  return found_day;
end;
$$;

create or replace function private.penalty_tier_for_late_minutes(
  organization_id uuid,
  late_minutes integer,
  tier_snapshot jsonb
)
returns record
language plpgsql
security definer
set search_path = ''
as $$
declare
  result record;
begin
  if late_minutes <= 0 or tier_snapshot = '[]'::jsonb then
    return null;
  end if;

  select tiers.id, tiers.amount_vnd
    into result
  from public.penalty_tiers tiers
  where tiers.organization_id = $1
    and tiers.is_active
    and late_minutes >= tiers.threshold_minutes
  order by tiers.threshold_minutes desc
  limit 1;

  return result;
end;
$$;

create or replace function private.record_check_in(
  p_organization_id uuid,
  p_attendance_day_id uuid,
  p_user_id uuid,
  p_roster_id uuid,
  p_method public.check_in_method,
  p_distance_m double precision,
  p_gps_accuracy_m double precision
)
returns public.attendance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  day_row public.attendance_days;
  existing_record public.attendance_records;
  new_record public.attendance_records;
  is_late boolean;
  late_min integer;
  tier_id uuid;
  tier_amount bigint;
  fine_code text;
begin
  select * into day_row
  from public.attendance_days
  where attendance_days.id = $2
    and attendance_days.organization_id = $1
  limit 1;

  if day_row.id is null then
    raise exception 'attendance day not found';
  end if;

  select * into existing_record
  from public.attendance_records
  where attendance_records.attendance_day_id = $2
    and attendance_records.user_id = $3
  limit 1;

  if existing_record.id is not null then
    update public.attendance_records
    set checked_in_at = now(),
        check_in_method = $5,
        distance_m = $6,
        gps_accuracy_m = $7,
        updated_at = now()
    where attendance_records.id = existing_record.id
    returning * into new_record;
    return new_record;
  end if;

  is_late := now() >= day_row.valid_check_in_at;
  if is_late then
    late_min := greatest(
      1,
      ceil(extract(epoch from (now() - day_row.valid_check_in_at)) / 60)::integer
    );
  else
    late_min := 0;
  end if;

  tier_id := null;
  tier_amount := 0;

  if is_late and day_row.tier_snapshot <> '[]'::jsonb then
    select tiers.id, tiers.amount_vnd
      into tier_id, tier_amount
    from public.penalty_tiers tiers
    where tiers.organization_id = $1
      and tiers.is_active
      and late_min >= tiers.threshold_minutes
    order by tiers.threshold_minutes desc
    limit 1;
  end if;

  insert into public.attendance_records (
    organization_id,
    attendance_day_id,
    roster_id,
    user_id,
    state,
    checked_in_at,
    check_in_method,
    late_minutes,
    distance_m,
    gps_accuracy_m,
    penalty_tier_id,
    fine_amount_snapshot
  )
  values (
    $1,
    $2,
    $4,
    $3,
    case when is_late then 'late'::public.attendance_state else 'on_time'::public.attendance_state end,
    now(),
    $5,
    late_min,
    $6,
    $7,
    tier_id,
    tier_amount
  )
  on conflict (attendance_day_id, user_id) do nothing
  returning * into new_record;

  if new_record.id is null then
    select * into new_record
    from public.attendance_records
    where attendance_records.attendance_day_id = $2
      and attendance_records.user_id = $3
    limit 1;
    return new_record;
  end if;

  if tier_id is not null and tier_amount > 0 then
    fine_code := 'F' || upper(substr(md5(new_record.id::text || clock_timestamp()::text), 1, 7));
    insert into public.fines (organization_id, attendance_record_id, user_id, code, amount_vnd)
    values ($1, new_record.id, $3, fine_code, tier_amount)
    on conflict (attendance_record_id) do nothing;
  end if;

  return new_record;
end;
$$;
