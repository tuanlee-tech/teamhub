-- Expose a lightweight success watermark to kiosk clients so QR rotation does
-- not depend solely on Realtime delivery or kiosk table visibility.

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
  latest_successful_check_in_at timestamptz;
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

  select max(attempt.server_received_at)
    into latest_successful_check_in_at
  from public.check_in_attempts attempt
  where attempt.organization_id = p_organization_id
    and attempt.succeeded;

  if day_row.id is null then
    return jsonb_build_object(
      'active', false,
      'session_start_at', null,
      'session_end_at', null,
      'last_successful_check_in_at', latest_successful_check_in_at
    );
  end if;

  result := jsonb_build_object(
    'active', now() >= day_row.session_start_at and now() <= day_row.session_end_at,
    'work_date', to_char(day_row.work_date, 'YYYY-MM-DD'),
    'session_start_at', day_row.session_start_at,
    'session_end_at', day_row.session_end_at,
    'last_successful_check_in_at', latest_successful_check_in_at
  );
  return result;
end;
$$;
