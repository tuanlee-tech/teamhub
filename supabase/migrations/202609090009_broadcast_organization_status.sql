-- Broadcast safe, organization-scoped status events to active members.
-- Payloads contain only data needed to update visible realtime UI.

create or replace function private.broadcast_check_in_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'attempt_id', new.id,
      'user_id', new.user_id,
      'display_name', (select display_name from public.profiles where user_id = new.user_id),
      'method', new.method,
      'succeeded', new.succeeded,
      'rejection_reason', new.rejection_reason,
      'server_received_at', new.server_received_at
    ),
    'check-in-status',
    'organization:' || new.organization_id::text,
    true
  );
  return new;
end;
$$;

drop trigger if exists broadcast_kiosk_check_in_success on public.check_in_attempts;
drop trigger if exists broadcast_check_in_status on public.check_in_attempts;
create trigger broadcast_check_in_status
after insert on public.check_in_attempts
for each row execute function private.broadcast_check_in_status();

create or replace function private.broadcast_fine_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'fine_id', new.id,
      'user_id', new.user_id,
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
after insert or update of status, paid_at, waived_at on public.fines
for each row execute function private.broadcast_fine_status();

create or replace function private.broadcast_fund_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'transaction_id', new.id,
      'direction', new.direction,
      'amount_vnd', new.amount_vnd,
      'reconciliation_status', new.reconciliation_status,
      'updated_at', new.updated_at
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
after insert or update of reconciliation_status, voided_at on public.fund_transactions
for each row execute function private.broadcast_fund_status();

drop policy if exists "active members can receive organization broadcasts" on realtime.messages;
create policy "active members can receive organization broadcasts"
on realtime.messages for select
to authenticated
using (
  split_part(topic, ':', 1) = 'organization'
  and public.is_active_member(split_part(topic, ':', 2)::uuid)
);
