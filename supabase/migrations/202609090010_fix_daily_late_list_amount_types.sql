-- SUM(bigint) returns numeric in PostgreSQL. Cast the monetary projection back
-- to bigint so it matches get_daily_late_list's declared return type.

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
    end::text,
    fine.id,
    fine.code,
    fine.status::text,
    fine.amount_vnd,
    coalesce(fine_alloc.allocated_vnd, 0)::bigint,
    greatest(fine.amount_vnd - coalesce(fine_alloc.allocated_vnd, 0), 0)::bigint
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
