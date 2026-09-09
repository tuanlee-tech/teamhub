-- A successful QR/OTP check-in consumes the currently displayed challenge pair.
-- The trigger runs in the same transaction as the check-in attempt insert.
create or replace function private.revoke_kiosk_challenges_after_check_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.succeeded and new.method in ('qr'::public.check_in_method, 'otp'::public.check_in_method) then
    update public.kiosk_qr_challenges
    set revoked_at = now()
    where organization_id = new.organization_id
      and revoked_at is null;

    update public.kiosk_otp_challenges
    set revoked_at = now()
    where organization_id = new.organization_id
      and revoked_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists revoke_kiosk_challenges_after_check_in on public.check_in_attempts;
create trigger revoke_kiosk_challenges_after_check_in
after insert on public.check_in_attempts
for each row
execute function private.revoke_kiosk_challenges_after_check_in();
