-- Standardize organization-scoped broadcast payloads and add missing producers.
-- Events are invalidation signals; payloads intentionally avoid sensitive payment data.

drop trigger if exists broadcast_kiosk_check_in_success on public.check_in_attempts;
drop function if exists private.broadcast_kiosk_check_in_success();
drop policy if exists "active members can receive kiosk broadcasts" on realtime.messages;

create or replace function private.fine_work_date(target_fine_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select to_char(days.work_date, 'YYYY-MM-DD')
  from public.fines fine
  join public.attendance_records record on record.id = fine.attendance_record_id
  join public.attendance_days days on days.id = record.attendance_day_id
  where fine.id = target_fine_id
  limit 1
$$;

create or replace function private.broadcast_check_in_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  record_row public.attendance_records%rowtype;
  fine_row public.fines%rowtype;
  work_date_text text;
begin
  if new.attendance_day_id is not null then
    select * into record_row
    from public.attendance_records
    where attendance_day_id = new.attendance_day_id
      and user_id = new.user_id
    limit 1;

    select to_char(work_date, 'YYYY-MM-DD') into work_date_text
    from public.attendance_days
    where id = new.attendance_day_id;

    if record_row.id is not null then
      select * into fine_row
      from public.fines
      where attendance_record_id = record_row.id
      limit 1;
    end if;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'event_id', gen_random_uuid()::text,
      'organization_id', new.organization_id::text,
      'event_type', 'check-in-status',
      'entity_id', new.id::text,
      'user_id', new.user_id::text,
      'work_date', work_date_text,
      'occurred_at', clock_timestamp(),
      'attempt_id', new.id,
      'display_name', (select display_name from public.profiles where user_id = new.user_id),
      'method', new.method,
      'succeeded', new.succeeded,
      'rejection_reason', new.rejection_reason,
      'server_received_at', new.server_received_at,
      'attendance_state', nullif(record_row.state::text, 'pending'),
      'late_minutes', case when record_row.id is null then null else record_row.late_minutes end,
      'fine_id', fine_row.id,
      'fine_code', fine_row.code
    ),
    'check-in-status',
    'organization:' || new.organization_id::text,
    true
  );
  return new;
end;
$$;

drop trigger if exists broadcast_check_in_status on public.check_in_attempts;
create trigger broadcast_check_in_status
after insert on public.check_in_attempts
for each row execute function private.broadcast_check_in_status();

create or replace function private.broadcast_attendance_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  work_date_text text;
begin
  select to_char(work_date, 'YYYY-MM-DD') into work_date_text
  from public.attendance_days
  where id = new.attendance_day_id;

  perform realtime.send(
    jsonb_build_object(
      'event_id', gen_random_uuid()::text,
      'organization_id', new.organization_id::text,
      'event_type', 'attendance-status',
      'entity_id', new.id::text,
      'user_id', new.user_id::text,
      'work_date', work_date_text,
      'occurred_at', clock_timestamp(),
      'attendance_state', new.state,
      'late_minutes', new.late_minutes,
      'checked_in_at', new.checked_in_at
    ),
    'attendance-status',
    'organization:' || new.organization_id::text,
    true
  );
  return new;
end;
$$;

drop trigger if exists broadcast_attendance_status on public.attendance_records;
create trigger broadcast_attendance_status
after insert or update of state, checked_in_at, late_minutes on public.attendance_records
for each row execute function private.broadcast_attendance_status();

create or replace function private.broadcast_fine_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'event_id', gen_random_uuid()::text,
      'organization_id', new.organization_id::text,
      'event_type', 'fine-status',
      'entity_id', new.id::text,
      'user_id', new.user_id::text,
      'work_date', private.fine_work_date(new.id),
      'occurred_at', clock_timestamp(),
      'fine_id', new.id,
      'fine_code', new.code,
      'status', new.status,
      'amount_vnd', new.amount_vnd,
      'updated_at', new.updated_at
    ),
    'fine-status',
    'organization:' || new.organization_id::text,
    true
  );
  return new;
end;
$$;

drop trigger if exists broadcast_fine_status on public.fines;
create trigger broadcast_fine_status
after insert or update of status, paid_at, waived_at, amount_vnd, waiver_reason on public.fines
for each row execute function private.broadcast_fine_status();

create or replace function private.broadcast_fine_allocation_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.fine_allocations%rowtype;
  old_fine public.fines%rowtype;
  new_fine public.fines%rowtype;
  action_text text;
begin
  if tg_op = 'DELETE' then
    current_row := old;
    action_text := 'delete';
  else
    current_row := new;
    action_text := lower(tg_op);
  end if;

  select * into new_fine from public.fines where id = current_row.fine_id;

  if tg_op = 'UPDATE' and old.fine_id is distinct from new.fine_id then
    select * into old_fine from public.fines where id = old.fine_id;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'event_id', gen_random_uuid()::text,
      'organization_id', current_row.organization_id::text,
      'event_type', 'fine-allocation-status',
      'entity_id', case when tg_op = 'DELETE' then null else current_row.id::text end,
      'user_id', new_fine.user_id::text,
      'work_date', private.fine_work_date(current_row.fine_id),
      'occurred_at', clock_timestamp(),
      'allocation_id', case when tg_op = 'DELETE' then null else current_row.id end,
      'fine_id', current_row.fine_id,
      'fine_code', new_fine.code,
      'old_fine_id', case when old_fine.id is null then null else old_fine.id end,
      'old_user_id', case when old_fine.id is null then null else old_fine.user_id end,
      'old_work_date', case when old_fine.id is null then null else private.fine_work_date(old_fine.id) end,
      'amount_vnd', current_row.amount_vnd,
      'fund_transaction_id', current_row.fund_transaction_id,
      'action', action_text
    ),
    'fine-allocation-status',
    'organization:' || current_row.organization_id::text,
    true
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists broadcast_fine_allocation_status on public.fine_allocations;
create trigger broadcast_fine_allocation_status
after insert or update or delete on public.fine_allocations
for each row execute function private.broadcast_fine_allocation_status();

create or replace function private.broadcast_fund_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'event_id', gen_random_uuid()::text,
      'organization_id', new.organization_id::text,
      'event_type', 'fund-status',
      'entity_id', new.id::text,
      'user_id', null,
      'work_date', null,
      'occurred_at', clock_timestamp(),
      'transaction_id', new.id,
      'direction', new.direction,
      'amount_vnd', new.amount_vnd,
      'reconciliation_status', new.reconciliation_status,
      'updated_at', new.updated_at,
      'voided_at', new.voided_at,
      'related_fine_ids', coalesce(
        (
          select jsonb_agg(distinct allocation.fine_id::text)
          from public.fine_allocations allocation
          where allocation.fund_transaction_id = new.id
        ),
        '[]'::jsonb
      )
    ),
    'fund-status',
    'organization:' || new.organization_id::text,
    true
  );
  return new;
end;
$$;

drop trigger if exists broadcast_fund_status on public.fund_transactions;
create trigger broadcast_fund_status
after insert or update of reconciliation_status, voided_at, amount_vnd on public.fund_transactions
for each row execute function private.broadcast_fund_status();

create or replace function private.broadcast_tts_settings_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'event_id', gen_random_uuid()::text,
      'organization_id', new.organization_id::text,
      'event_type', 'tts-settings-status',
      'entity_id', new.organization_id::text,
      'user_id', null,
      'work_date', null,
      'occurred_at', clock_timestamp(),
      'updated_at', new.updated_at
    ),
    'tts-settings-status',
    'organization:' || new.organization_id::text,
    true
  );
  return new;
end;
$$;

drop trigger if exists broadcast_tts_settings_status on public.tts_settings;
create trigger broadcast_tts_settings_status
after insert or update on public.tts_settings
for each row execute function private.broadcast_tts_settings_status();

drop policy if exists "active members can receive organization broadcasts" on realtime.messages;
create policy "active members can receive organization broadcasts"
on realtime.messages for select
to authenticated
using (
  split_part(topic, ':', 1) = 'organization'
  and public.is_active_member(split_part(topic, ':', 2)::uuid)
);
