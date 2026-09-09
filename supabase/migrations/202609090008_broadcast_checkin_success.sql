-- Notify kiosks immediately after a successful check-in. The payload contains
-- no member data; it is only an invalidation signal for the displayed codes.

create or replace function private.broadcast_kiosk_check_in_success()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.succeeded then
    perform realtime.send(
      jsonb_build_object('server_received_at', new.server_received_at),
      'check-in-success',
      'kiosk:' || new.organization_id::text,
      true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists broadcast_kiosk_check_in_success on public.check_in_attempts;

create trigger broadcast_kiosk_check_in_success
after insert on public.check_in_attempts
for each row
execute function private.broadcast_kiosk_check_in_success();

drop policy if exists "active members can receive kiosk broadcasts" on realtime.messages;

create policy "active members can receive kiosk broadcasts"
on realtime.messages for select
to authenticated
using (
  split_part(topic, ':', 1) = 'kiosk'
  and public.is_active_member(split_part(topic, ':', 2)::uuid)
);
