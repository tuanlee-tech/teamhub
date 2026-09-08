-- Milestone 4: auto-late processing and roster maintenance.
-- pg_cron is not available on this hosted project, so these functions are
-- invoked by the app's cron route using the admin (service_role) client.

-- Select the highest active tier that a late_minutes value reaches.
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

-- Mark every required roster member without an attendance record as late on an
-- open day that has reached its auto_late_at, then close the day. Idempotent.
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

-- Convenience: create today's roster (and attendance day) for an organization.
create or replace function public.ensure_todays_roster(
  organization_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  work_date date;
  day_row public.attendance_days;
begin
  work_date := private.current_work_date(organization_id);
  select * into day_row from private.get_or_create_attendance_day(organization_id, work_date);
  perform public.ensure_roster_for_date(organization_id, work_date);
  return day_row.id;
end;
$$;

revoke all on function public.auto_late_idempotent() from public, anon, authenticated;
revoke all on function public.ensure_todays_roster(uuid) from public, anon, authenticated;
