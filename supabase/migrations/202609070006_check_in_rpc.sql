-- Milestone 4: check-in RPCs (GPS + QR)
-- Business rules executed in the database under advisory locks so that
-- concurrent check-ins and the auto-late cron can never double-create a result.

-- Internal helper: resolve the current local work_date for an organization.
create or replace function private.current_work_date(organization_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone settings.timezone)::date
  from public.organization_settings settings
  where settings.organization_id = $1;
$$;

-- Internal helper: find or create the attendance day for a given work_date,
-- snapshotting the current organization settings and active penalty tiers.
-- Idempotent under the unique (organization_id, work_date) constraint.
drop function if exists private.get_or_create_attendance_day(uuid, date);
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

-- Public: create the roster for a work_date from every active member.
-- Used by the roster cron. Idempotent.
create or replace function public.ensure_roster_for_date(
  organization_id uuid,
  work_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  day_row public.attendance_days;
begin
  select * into day_row
  from private.get_or_create_attendance_day(organization_id, work_date);

  insert into public.daily_roster (organization_id, attendance_day_id, user_id)
  select membership.organization_id, day_row.id, membership.user_id
  from public.organization_members membership
  where membership.organization_id = $1
    and membership.status = 'active'
    and membership.is_active
    and not exists (
      select 1
      from public.daily_roster existing
      where existing.attendance_day_id = day_row.id
        and existing.user_id = membership.user_id
    )
  on conflict (attendance_day_id, user_id) do nothing;
end;
$$;

-- Internal: create (or fetch existing) attendance record for a member on a day,
-- computing late minutes and a fine when a tier applies. Runs within the caller
-- transaction and is protected by an advisory lock at the call site.
drop function if exists private.record_check_in(uuid, uuid, uuid, uuid, public.check_in_method, double precision, double precision);
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
  tier_row record;
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
    -- Already have a record (e.g. auto-lated). Update the real check-in time and
    -- method but keep the existing late state, tier, and fine.
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

  is_late := now() > day_row.valid_check_in_at;
  if is_late then
    late_min := greatest(
      0,
      floor(extract(epoch from (now() - day_row.valid_check_in_at)) / 60)::integer
    );
  else
    late_min := 0;
  end if;

  tier_id := null;
  tier_amount := 0;

  if is_late and late_min > 0 and day_row.tier_snapshot <> '[]'::jsonb then
    -- Highest tier the member actually crossed (strict "> threshold" rule).
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

  -- Create an immediate payable fine when a tier applied.
  if tier_id is not null and tier_amount > 0 then
    fine_code := 'F' || upper(substr(md5(new_record.id::text || clock_timestamp()::text), 1, 7));
    insert into public.fines (organization_id, attendance_record_id, user_id, code, amount_vnd)
    values ($1, new_record.id, $3, fine_code, tier_amount)
    on conflict (attendance_record_id) do nothing;
  end if;

  return new_record;
end;
$$;

-- Check-in via GPS. Member-facing and must resolve the member from auth.uid().
create or replace function public.check_in_gps(
  organization_id uuid,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  settings_row public.organization_settings;
  day_row public.attendance_days;
  roster_row public.daily_roster;
  distance_m double precision;
  work_date date;
  lock_key bigint;
  record_row public.attendance_records;
begin
  if actor is null then
    raise exception 'not authenticated';
  end if;

  select * into settings_row
  from public.organization_settings
  where organization_settings.organization_id = $1;

  if settings_row.organization_id is null then
    raise exception 'organization settings not found';
  end if;

  -- Member must be active in this org.
  if not exists (
    select 1 from public.organization_members membership
    where membership.organization_id = $1
      and membership.user_id = actor
      and membership.status = 'active'
      and membership.is_active
  ) then
    raise exception 'member is not active';
  end if;

  -- Reject GPS check-in when the office has no configured coordinates.
  if settings_row.office_latitude is null or settings_row.office_longitude is null then
    insert into public.check_in_attempts (organization_id, user_id, method, succeeded, rejection_reason)
    values ($1, actor, 'gps', false, 'office_not_configured');
    return jsonb_build_object('ok', false, 'reason', 'office_not_configured');
  end if;

  -- GPS accuracy gate: fall back to QR when accuracy is worse than the limit.
  if accuracy_m is null or accuracy_m < 0 or accuracy_m > settings_row.max_gps_accuracy_m then
    insert into public.check_in_attempts (organization_id, user_id, method, succeeded, rejection_reason, gps_accuracy_m)
    values ($1, actor, 'gps', false, 'gps_accuracy_too_low', accuracy_m);
    return jsonb_build_object('ok', false, 'reason', 'gps_accuracy_too_low');
  end if;

  -- Haversine distance against the office.
  select
    6371000 * 2 * asin(sqrt(
      power(sin(radians(latitude - settings_row.office_latitude) / 2), 2) +
      cos(radians(settings_row.office_latitude)) * cos(radians(latitude)) *
      power(sin(radians(longitude - settings_row.office_longitude) / 2), 2)
    ))
    into distance_m;

  if distance_m > settings_row.office_radius_m then
    insert into public.check_in_attempts (organization_id, user_id, method, succeeded, rejection_reason, distance_m, gps_accuracy_m)
    values ($1, actor, 'gps', false, 'outside_office_geofence', distance_m, accuracy_m);
    return jsonb_build_object('ok', false, 'reason', 'outside_office_geofence', 'distance_m', distance_m);
  end if;

  work_date := private.current_work_date($1);
  select * into day_row from private.get_or_create_attendance_day($1, work_date);

  select * into roster_row
  from public.daily_roster
  where daily_roster.attendance_day_id = day_row.id
    and daily_roster.user_id = actor
    and daily_roster.is_required
  limit 1;

  if roster_row.id is null then
    insert into public.check_in_attempts (organization_id, user_id, method, succeeded, rejection_reason)
    values ($1, actor, 'gps', false, 'not_on_roster');
    return jsonb_build_object('ok', false, 'reason', 'not_on_roster');
  end if;

  lock_key := hashtextextended(day_row.id::text || actor::text, 0);
  perform pg_advisory_xact_lock(lock_key);

  record_row := private.record_check_in(
    $1, day_row.id, actor, roster_row.id, 'gps', distance_m, accuracy_m
  );

  insert into public.check_in_attempts (organization_id, attendance_day_id, user_id, method, succeeded, distance_m, gps_accuracy_m)
  values ($1, day_row.id, actor, 'gps', true, distance_m, accuracy_m);

  return jsonb_build_object(
    'ok', true,
    'state', record_row.state,
    'late_minutes', record_row.late_minutes,
    'fine_amount_snapshot', record_row.fine_amount_snapshot
  );
end;
$$;

-- Check-in via an expiring kiosk QR token.
create or replace function public.check_in_qr(
  organization_id uuid,
  token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  v_token_hash bytea;
  challenge public.kiosk_qr_challenges;
  day_row public.attendance_days;
  roster_row public.daily_roster;
  work_date date;
  lock_key bigint;
  record_row public.attendance_records;
begin
  if actor is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.organization_members membership
    where membership.organization_id = $1
      and membership.user_id = actor
      and membership.status = 'active'
      and membership.is_active
  ) then
    raise exception 'member is not active';
  end if;

  if token is null or length(token) < 16 then
    raise exception 'invalid token';
  end if;

  v_token_hash := extensions.digest(convert_to(token, 'UTF8'), 'sha256');

  select * into challenge
  from public.kiosk_qr_challenges
  where kiosk_qr_challenges.token_hash = v_token_hash
    and kiosk_qr_challenges.revoked_at is null
    and kiosk_qr_challenges.expires_at > now()
  limit 1;

  if challenge.id is null then
    insert into public.check_in_attempts (organization_id, user_id, method, succeeded, rejection_reason)
    values ($1, actor, 'qr', false, 'invalid_or_expired_token');
    return jsonb_build_object('ok', false, 'reason', 'invalid_or_expired_token');
  end if;

  work_date := private.current_work_date($1);
  select * into day_row from private.get_or_create_attendance_day($1, work_date);

  select * into roster_row
  from public.daily_roster
  where daily_roster.attendance_day_id = day_row.id
    and daily_roster.user_id = actor
    and daily_roster.is_required
  limit 1;

  if roster_row.id is null then
    insert into public.check_in_attempts (organization_id, user_id, method, succeeded, rejection_reason)
    values ($1, actor, 'qr', false, 'not_on_roster');
    return jsonb_build_object('ok', false, 'reason', 'not_on_roster');
  end if;

  lock_key := hashtextextended(day_row.id::text || actor::text, 0);
  perform pg_advisory_xact_lock(lock_key);

  record_row := private.record_check_in(
    $1, day_row.id, actor, roster_row.id, 'qr', null, null
  );

  insert into public.check_in_attempts (organization_id, attendance_day_id, user_id, method, succeeded)
  values ($1, day_row.id, actor, 'qr', true);

  return jsonb_build_object(
    'ok', true,
    'state', record_row.state,
    'late_minutes', record_row.late_minutes,
    'fine_amount_snapshot', record_row.fine_amount_snapshot
  );
end;
$$;

-- Manager-facing: create a fresh expiring QR challenge. Only a hash is stored.
create or replace function public.create_kiosk_qr_challenge(
  organization_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  raw_token text;
  v_token_hash bytea;
  expires timestamptz;
begin
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

  raw_token := extensions.gen_random_uuid()::text || extensions.gen_random_uuid()::text;
  v_token_hash := extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256');
  expires := now() + interval '30 seconds';

  insert into public.kiosk_qr_challenges (
    organization_id, token_hash, expires_at, created_by
  )
  values ($1, v_token_hash, expires, actor);

  -- Revoke older outstanding challenges for this org to avoid token pile-up.
  update public.kiosk_qr_challenges
  set revoked_at = now()
  where kiosk_qr_challenges.organization_id = $1
    and revoked_at is null
    and id <> (select id from public.kiosk_qr_challenges where kiosk_qr_challenges.token_hash = v_token_hash limit 1);

  return raw_token;
end;
$$;

revoke all on function public.check_in_gps(uuid, double precision, double precision, double precision) from public, anon;
revoke all on function public.check_in_qr(uuid, text) from public, anon;
revoke all on function public.create_kiosk_qr_challenge(uuid) from public, anon;
revoke all on function public.ensure_roster_for_date(uuid, date) from public, anon;
grant execute on function public.check_in_gps(uuid, double precision, double precision, double precision) to authenticated;
grant execute on function public.check_in_qr(uuid, text) to authenticated;
grant execute on function public.create_kiosk_qr_challenge(uuid) to authenticated;
