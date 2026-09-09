-- Block every check-in method outside the organization's active session window.
-- The trigger protects GPS, QR, OTP, and any future path that writes a real
-- checked_in_at value to attendance_records.

create or replace function private.enforce_check_in_session_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings_row public.organization_settings;
  local_time time;
begin
  if new.checked_in_at is null then
    return new;
  end if;

  select * into settings_row
  from public.organization_settings
  where organization_settings.organization_id = new.organization_id;

  local_time := (now() at time zone settings_row.timezone)::time;

  if settings_row.organization_id is not null
    and (local_time < settings_row.session_start or local_time > settings_row.session_end) then
    insert into public.check_in_attempts (
      organization_id,
      attendance_day_id,
      user_id,
      method,
      succeeded,
      rejection_reason
    )
    values (
      new.organization_id,
      new.attendance_day_id,
      new.user_id,
      new.check_in_method,
      false,
      'outside_session_window'
    );

    raise exception 'check_in_outside_session';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_check_in_session_window on public.attendance_records;

create trigger enforce_check_in_session_window
before insert or update of checked_in_at on public.attendance_records
for each row
execute function private.enforce_check_in_session_window();
