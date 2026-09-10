-- Queue a push notification when a fine is issued.
-- The sender (/api/push/dispatch) drains notification_outbox.

create or replace function private.enqueue_fine_issued_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_outbox (organization_id, target_user_id, event_type, payload)
  values (
    new.organization_id,
    new.user_id,
    'fine_issued',
    jsonb_build_object(
      'title', 'Phiếu phạt mới',
      'body', 'Bạn có phiếu phạt ' || new.code || '. Mở để xem QR thanh toán.',
      'url', '/fines/' || new.code,
      'tag', 'fine-issued-' || new.code
    )
  );
  return new;
end;
$$;

drop trigger if exists enqueue_fine_issued_push on public.fines;
create trigger enqueue_fine_issued_push
after insert on public.fines
for each row execute function private.enqueue_fine_issued_push();
