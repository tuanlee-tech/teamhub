-- TeamHub mobile foundation: kiosk role, device OTP, auto-approve toggle,
-- org-scoped late projection, and RLS adjustments for minimal kiosk leakage.

-- 1. Enum extensions ---------------------------------------------------------
-- NOTE: enum values must commit before any statement in this session uses them
-- (PostgreSQL 55P04), so these run outside the transaction below.

alter type public.app_role add value if not exists 'kiosk';
alter type public.check_in_method add value if not exists 'otp';

begin;

-- 2. Settings and membership metadata ---------------------------------------

alter table public.organization_settings
  add column auto_approve_members boolean not null default false;

alter table public.organization_members
  add column approval_source text not null default 'manual'
  check (approval_source in ('auto', 'manual'));

-- 3. Kiosk OTP challenges ----------------------------------------------------

create table public.kiosk_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  otp_hash bytea not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index kiosk_otp_active_idx on public.kiosk_otp_challenges (organization_id, expires_at) where revoked_at is null;

alter table public.kiosk_otp_challenges enable row level security;

create policy "kiosk can view own or managers can view otp challenges"
on public.kiosk_otp_challenges for select to authenticated
using (user_id = auth.uid() or public.is_manager(organization_id));

-- Direct inserts are not allowed by any policy; writes go through the RPCs.

-- 4. Role helper -------------------------------------------------------------

create or replace function public.is_kiosk(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and membership.role = 'kiosk'
      and membership.status = 'active'
      and membership.is_active
  );
$$;

revoke all on function public.is_kiosk(uuid) from public, anon;
grant execute on function public.is_kiosk(uuid) to authenticated;

-- 5. Kiosk session window ----------------------------------------------------
-- A kiosk device may only emit challenges while the configured working session
-- for the current organizational work day is active.

create or replace function private.kiosk_session_active(
  p_organization_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  day_row public.attendance_days;
begin
  select * into day_row
  from private.get_or_create_attendance_day(
    p_organization_id,
    private.current_work_date(p_organization_id)
  );

  if day_row.id is null then
    return false;
  end if;

  return now() >= day_row.session_start_at and now() <= day_row.session_end_at;
end;
$$;

-- 6. Exclude kiosk accounts from daily roster ---------------------------------

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
    and membership.role <> 'kiosk'
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
    and membership.role <> 'kiosk'
    and not exists (
      select 1
      from public.daily_roster existing
      where existing.attendance_day_id = day_row.id
        and existing.user_id = membership.user_id
    )
  on conflict (attendance_day_id, user_id) do nothing;
end;
$$;

-- 7. Auto-late: never fine a kiosk account -----------------------------------

create or replace function public.auto_late_idempotent()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  day_row record;
  member_row record;
  tier_record record;
  lock_key bigint;
  late_min integer;
  tier_id uuid;
  tier_amount bigint;
  fine_code text;
  processed integer := 0;
begin
  for day_row in
    select *
    from public.attendance_days
    where status = 'open'
      and auto_late_at <= now()
    order by auto_late_at
  loop
    lock_key := hashtextextended(day_row.id::text, 0);
    perform pg_advisory_xact_lock(lock_key);

    for member_row in
      select roster.id as roster_id, roster.user_id
      from public.daily_roster roster
      where roster.attendance_day_id = day_row.id
        and roster.is_required
        and not exists (
          select 1
          from public.attendance_records records
          where records.attendance_day_id = day_row.id
            and records.user_id = roster.user_id
        )
        and not exists (
          select 1
          from public.organization_members om
          where om.organization_id = day_row.organization_id
            and om.user_id = roster.user_id
            and om.role = 'kiosk'
        )
    loop
      late_min := greatest(
        0,
        floor(extract(epoch from (day_row.auto_late_at - day_row.valid_check_in_at)) / 60)::integer
      );

      tier_record := private.penalty_tier_for_late_minutes(day_row.organization_id, late_min, day_row.tier_snapshot);
      tier_id := null;
      tier_amount := 0;
      if tier_record is not null then
        tier_id := tier_record.id;
        tier_amount := tier_record.amount_vnd;
      end if;

      insert into public.attendance_records (
        organization_id,
        attendance_day_id,
        roster_id,
        user_id,
        state,
        marked_late_at,
        late_minutes,
        penalty_tier_id,
        fine_amount_snapshot
      )
      values (
        day_row.organization_id,
        day_row.id,
        member_row.roster_id,
        member_row.user_id,
        'late'::public.attendance_state,
        day_row.auto_late_at,
        late_min,
        tier_id,
        tier_amount
      )
      on conflict (attendance_day_id, user_id) do nothing;

      if tier_id is not null and tier_amount > 0 then
        fine_code := 'F' || upper(substr(md5(member_row.user_id::text || day_row.id::text || clock_timestamp()::text), 1, 7));
        insert into public.fines (organization_id, attendance_record_id, user_id, code, amount_vnd)
        select day_row.organization_id, records.id, records.user_id, fine_code, tier_amount
        from public.attendance_records records
        where records.attendance_day_id = day_row.id
          and records.user_id = member_row.user_id
        on conflict (attendance_record_id) do nothing;
      end if;
    end loop;

    update public.attendance_days
    set status = 'auto_late_processed',
        roster_generated_at = coalesce(roster_generated_at, now()),
        updated_at = now()
    where attendance_days.id = day_row.id
      and attendance_days.status = 'open';

    processed := processed + 1;
  end loop;

  return processed;
end;
$$;

-- 8. Kiosk challenge issuance -------------------------------------------------
-- Manager and kiosk devices can both issue challenges. Kiosk devices only while
-- the configured session is active. Rotation revokes only the issuing device's
-- own outstanding challenges so multiple kiosks never revoke one another.

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
  if not (public.is_manager($1) or public.is_kiosk($1)) then
    raise exception 'not allowed';
  end if;

  if public.is_kiosk($1) and not private.kiosk_session_active($1) then
    raise exception 'kiosk session is not active';
  end if;

  raw_token := extensions.gen_random_uuid()::text || extensions.gen_random_uuid()::text;
  v_token_hash := extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256');
  expires := now() + interval '30 seconds';

  insert into public.kiosk_qr_challenges (
    organization_id, token_hash, expires_at, created_by
  )
  values ($1, v_token_hash, expires, actor);

  update public.kiosk_qr_challenges
  set revoked_at = now()
  where organization_id = $1
    and created_by = actor
    and revoked_at is null
    and id <> (select id from public.kiosk_qr_challenges where kiosk_qr_challenges.token_hash = v_token_hash limit 1);

  return raw_token;
end;
$$;

-- 9. Kiosk OTP issuance -------------------------------------------------------

create or replace function public.create_kiosk_otp(
  organization_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  code text;
  v_code_hash bytea;
  expires timestamptz;
begin
  if not (public.is_manager($1) or public.is_kiosk($1)) then
    raise exception 'not allowed';
  end if;

  if public.is_kiosk($1) and not private.kiosk_session_active($1) then
    raise exception 'kiosk session is not active';
  end if;

  code := lpad(((floor(random() * 1000000))::integer % 1000000)::text, 6, '0');
  v_code_hash := extensions.digest(convert_to(code, 'UTF8'), 'sha256');
  expires := now() + interval '5 minutes';

  insert into public.kiosk_otp_challenges (organization_id, user_id, otp_hash, expires_at)
  values ($1, actor, v_code_hash, expires);

  update public.kiosk_otp_challenges
  set revoked_at = now()
  where organization_id = $1
    and user_id = actor
    and revoked_at is null
    and id <> (select id from public.kiosk_otp_challenges where otp_hash = v_code_hash limit 1);

  return code;
end;
$$;

-- 10. Check-in via OTP -------------------------------------------------------
-- Full check-in path equivalent to check_in_qr; attempts are throttled per
-- challenge and a valid code is revoked after a successful check-in.

create or replace function public.check_in_otp(
  organization_id uuid,
  code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  v_code_hash bytea;
  challenge public.kiosk_otp_challenges;
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
      and membership.role <> 'kiosk'
  ) then
    raise exception 'member is not active';
  end if;

  if code is null or length(code) <> 6 then
    raise exception 'invalid otp';
  end if;

  v_code_hash := extensions.digest(convert_to(code, 'UTF8'), 'sha256');

  select * into challenge
  from public.kiosk_otp_challenges
  where kiosk_otp_challenges.organization_id = $1
    and kiosk_otp_challenges.otp_hash = v_code_hash
    and kiosk_otp_challenges.revoked_at is null
    and kiosk_otp_challenges.expires_at > now()
  limit 1;

  if challenge.id is null then
    insert into public.check_in_attempts (organization_id, user_id, method, succeeded, rejection_reason)
    values ($1, actor, 'otp', false, 'invalid_or_expired_otp');
    return jsonb_build_object('ok', false, 'reason', 'invalid_or_expired_otp');
  end if;

  if challenge.attempt_count >= 5 then
    update public.kiosk_otp_challenges set revoked_at = now() where id = challenge.id;
    insert into public.check_in_attempts (organization_id, user_id, method, succeeded, rejection_reason)
    values ($1, actor, 'otp', false, 'otp_attempts_exceeded');
    return jsonb_build_object('ok', false, 'reason', 'otp_attempts_exceeded');
  end if;

  update public.kiosk_otp_challenges
  set attempt_count = attempt_count + 1
  where id = challenge.id;

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
    values ($1, actor, 'otp', false, 'not_on_roster');
    return jsonb_build_object('ok', false, 'reason', 'not_on_roster');
  end if;

  lock_key := hashtextextended(day_row.id::text || actor::text, 0);
  perform pg_advisory_xact_lock(lock_key);

  record_row := private.record_check_in(
    $1, day_row.id, actor, roster_row.id, 'otp', null, null
  );

  update public.kiosk_otp_challenges
  set revoked_at = now()
  where id = challenge.id;

  insert into public.check_in_attempts (organization_id, attendance_day_id, user_id, method, succeeded)
  values ($1, day_row.id, actor, 'otp', true);

  return jsonb_build_object(
    'ok', true,
    'state', record_row.state,
    'late_minutes', record_row.late_minutes,
    'fine_amount_snapshot', record_row.fine_amount_snapshot
  );
end;
$$;

-- 11. Auto-approve registrations ---------------------------------------------
-- When organization_settings.auto_approve_members is enabled, a brand new
-- registration is activated immediately (approval_source = 'auto'). Existing
-- pending rows are never swept. Kiosk accounts are manager-created and never
-- reach this path.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_organization_id uuid;
  auto_approve boolean;
  proposed_username extensions.citext;
  proposed_display_name text;
begin
  proposed_username := nullif(lower(trim(new.raw_user_meta_data ->> 'username')), '')::extensions.citext;
  proposed_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    proposed_username::text,
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (user_id, username, display_name)
  values (new.id, proposed_username, proposed_display_name);

  insert into private.login_identifiers (user_id, username, email)
  values (new.id, proposed_username, lower(new.email)::extensions.citext);

  select id into default_organization_id from public.organizations where is_default limit 1;

  if default_organization_id is not null then
    select auto_approve_members into auto_approve
    from public.organization_settings
    where organization_id = default_organization_id;

    if coalesce(auto_approve, false) then
      insert into public.organization_members (organization_id, user_id, status, approved_at, approval_source)
      values (default_organization_id, new.id, 'active'::public.membership_status, now(), 'auto');
    else
      insert into public.organization_members (organization_id, user_id, status, approval_source)
      values (default_organization_id, new.id, 'pending'::public.membership_status, 'manual');
    end if;
  end if;

  return new;
end;
$$;

-- 12. Late list projection ----------------------------------------------------
-- Minimal org-internal read projection used by the mobile late list. Never
-- exposes GPS fields, emails or bank transaction detail. Valid for any active
-- member including kiosk; the caller must be a member of the target org.

create or replace function public.get_daily_late_list(
  p_organization_id uuid,
  p_work_date date
)
returns table (
  user_id uuid,
  display_name text,
  username text,
  attendance_state text,
  late_minutes integer,
  checked_in_at timestamptz,
  late_kind text,
  fine_id uuid,
  fine_code text,
  fine_status text,
  original_vnd bigint,
  allocated_vnd bigint,
  outstanding_vnd bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member(p_organization_id) then
    raise exception 'not an active member';
  end if;

  return query
  select
    profile.user_id,
    profile.display_name,
    profile.username::text,
    record.state::text,
    record.late_minutes,
    record.checked_in_at,
    case
      when record.state = 'late'::public.attendance_state
        then case when record.checked_in_at is not null then 'checked_in_late' else 'auto_late' end
      else 'not_late'
    end::text as late_kind,
    fine.id,
    fine.code,
    fine.status::text,
    fine.amount_vnd,
    coalesce(fine_alloc.allocated_vnd, 0),
    greatest(fine.amount_vnd - coalesce(fine_alloc.allocated_vnd, 0), 0)
  from public.daily_roster roster
  join public.attendance_days day_record
    on day_record.id = roster.attendance_day_id
  join public.profiles profile
    on profile.user_id = roster.user_id
  left join public.attendance_records record
    on record.attendance_day_id = roster.attendance_day_id
    and record.user_id = roster.user_id
  left join public.fines fine
    on fine.attendance_record_id = record.id
  left join lateral (
    select sum(alloc.amount_vnd) as allocated_vnd
    from public.fine_allocations alloc
    join public.fund_transactions fund_tx on fund_tx.id = alloc.fund_transaction_id
    where alloc.fine_id = fine.id
      and fund_tx.voided_at is null
  ) fine_alloc on true
  where day_record.organization_id = p_organization_id
    and day_record.work_date = p_work_date
    and roster.is_required
    and not exists (
      select 1
      from public.organization_members om
      where om.organization_id = day_record.organization_id
        and om.user_id = roster.user_id
        and om.role = 'kiosk'
    )
    and (record.state = 'late'::public.attendance_state or fine.id is not null)
  order by profile.display_name;
end;
$$;

-- 12b. Kiosk session info -----------------------------------------------------
-- Public projection a kiosk needs: whether the current working session is
-- active and the boundaries to render "next session" when it is not.

create or replace function public.kiosk_session_info(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  day_row public.attendance_days;
  result jsonb;
begin
  if not public.is_kiosk(p_organization_id) and not public.is_manager(p_organization_id) then
    raise exception 'not a kiosk or manager';
  end if;

  select * into day_row
  from private.get_or_create_attendance_day(
    p_organization_id,
    private.current_work_date(p_organization_id)
  );

  if day_row.id is null then
    return jsonb_build_object('active', false, 'session_start_at', null, 'session_end_at', null);
  end if;

  result := jsonb_build_object(
    'active', now() >= day_row.session_start_at and now() <= day_row.session_end_at,
    'work_date', to_char(day_row.work_date, 'YYYY-MM-DD'),
    'session_start_at', day_row.session_start_at,
    'session_end_at', day_row.session_end_at
  );
  return result;
end;
$$;

-- 13. RLS adjustments ---------------------------------------------------------
-- Kiosk accounts remain active members but must not see coworker membership
-- details, attendance/GPS records, roster exclusion reasons, or financial rows.

drop policy if exists "users can view their membership or active coworkers"
on public.organization_members;

create policy "users can view their membership or active coworkers"
on public.organization_members for select to authenticated
using (
  user_id = auth.uid()
  or (not public.is_kiosk(organization_id) and public.is_active_member(organization_id))
);

drop policy if exists "active members can view attendance records"
on public.attendance_records;

create policy "users can view their attendance records or managers"
on public.attendance_records for select to authenticated
using (user_id = auth.uid() or public.is_manager(organization_id));

drop policy if exists "active members can view daily roster"
on public.daily_roster;

create policy "users can view their roster or managers"
on public.daily_roster for select to authenticated
using (user_id = auth.uid() or public.is_manager(organization_id));

drop policy if exists "active members can view fund transactions"
on public.fund_transactions;

create policy "users can view their fund transactions or managers"
on public.fund_transactions for select to authenticated
using (
  public.is_manager(organization_id)
  or exists (
    select 1
    from public.fine_allocations alloc
    join public.fines fine on fine.id = alloc.fine_id
    where alloc.fund_transaction_id = fund_transactions.id
      and fine.user_id = auth.uid()
  )
);

drop policy if exists "active members can view fine allocations"
on public.fine_allocations;

create policy "users can view their fine allocations or managers"
on public.fine_allocations for select to authenticated
using (
  public.is_manager(organization_id)
  or exists (
    select 1
    from public.fines fine
    where fine.id = fine_id
      and fine.user_id = auth.uid()
  )
);

drop policy if exists "managers can view kiosk challenges"
on public.kiosk_qr_challenges;

create policy "kiosk can view own or managers can view qr challenges"
on public.kiosk_qr_challenges for select to authenticated
using (created_by = auth.uid() or public.is_manager(organization_id));

-- 14. Grants ------------------------------------------------------------------

revoke all on function public.create_kiosk_qr_challenge(uuid) from public, anon;
revoke all on function public.create_kiosk_otp(uuid) from public, anon;
revoke all on function public.check_in_otp(uuid, text) from public, anon;
revoke all on function public.get_daily_late_list(uuid, date) from public, anon;
revoke all on function public.kiosk_session_info(uuid) from public, anon;

grant execute on function public.create_kiosk_qr_challenge(uuid) to authenticated;
grant execute on function public.create_kiosk_otp(uuid) to authenticated;
grant execute on function public.check_in_otp(uuid, text) to authenticated;
grant execute on function public.get_daily_late_list(uuid, date) to authenticated;
grant execute on function public.kiosk_session_info(uuid) to authenticated;

commit;