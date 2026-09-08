-- Milestone 5: SePay payment processing RPC
-- Atomically mark fine as paid, create fund_transaction (incoming), and fine_allocation

create or replace function public.process_fine_payment(
  p_fine_id uuid,
  p_sepay_transaction_id bigint,
  p_paid_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fine_row public.fines;
  org_id uuid;
  user_id uuid;
  amount bigint;
  fund_tx_id uuid;
begin
  -- Lock the fine row
  select * into fine_row
  from public.fines
  where fines.id = $1
    and fines.status = 'unpaid'
  for update;

  if fine_row.id is null then
    raise exception 'Fine not found or already paid';
  end if;

  org_id := fine_row.organization_id;
  user_id := fine_row.user_id;
  amount := fine_row.amount_vnd;

  -- Update fine status
  update public.fines
  set status = 'paid',
      paid_at = $3,
      updated_at = now()
  where fines.id = $1;

  -- Create incoming fund transaction
  insert into public.fund_transactions (
    organization_id,
    direction,
    source,
    amount_vnd,
    occurred_at,
    description,
    reference_code,
    reconciliation_status,
    sepay_event_id
  )
  select
    org_id,
    'incoming'::public.fund_direction,
    'sepay'::public.fund_source,
    amount,
    $3,
    'Thanh toán phạt ' || fine_row.code,
    fine_row.code,
    'matched'::public.reconciliation_status,
    (select id from public.sepay_webhook_events where sepay_transaction_id = $2)
  returning id into fund_tx_id;

  -- Create fine allocation
  insert into public.fine_allocations (
    organization_id,
    fund_transaction_id,
    fine_id,
    amount_vnd
  )
  values (
    org_id,
    fund_tx_id,
    $1,
    amount
  );

  -- Audit log
  insert into public.fund_entry_audits (
    organization_id,
    fund_transaction_id,
    action,
    previous_values,
    next_values
  )
  values (
    org_id,
    fund_tx_id,
    'sepay_auto_payment',
    jsonb_build_object('fine_id', $1, 'status', 'unpaid'),
    jsonb_build_object('fine_id', $1, 'status', 'paid', 'sepay_transaction_id', $2)
  );
end;
$$;

revoke all on function public.process_fine_payment(uuid, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.process_fine_payment(uuid, bigint, timestamptz) to service_role;