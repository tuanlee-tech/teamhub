-- Initial snapshot for kiosk activity. Realtime only delivers events after
-- subscription, so the UI also needs a safe server-side recent projection.

create or replace function public.get_recent_check_in_attempts(
  p_organization_id uuid,
  p_limit integer default 10
)
returns table (
  attempt_id bigint,
  user_id uuid,
  display_name text,
  method text,
  succeeded boolean,
  rejection_reason text,
  server_received_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_kiosk(p_organization_id) and not public.is_manager(p_organization_id) then
    raise exception 'not a kiosk or manager';
  end if;

  return query
  select
    attempt.id,
    attempt.user_id,
    profile.display_name,
    attempt.method::text,
    attempt.succeeded,
    attempt.rejection_reason,
    attempt.server_received_at
  from public.check_in_attempts attempt
  join public.profiles profile on profile.user_id = attempt.user_id
  where attempt.organization_id = p_organization_id
  order by attempt.server_received_at desc, attempt.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
end;
$$;

revoke all on function public.get_recent_check_in_attempts(uuid, integer) from public, anon;
grant execute on function public.get_recent_check_in_attempts(uuid, integer) to authenticated;
