-- QR and OTP are one check-in pair. Keep both challenges valid for the same
-- 30-minute lifetime; a successful check-in still revokes the pair immediately.

create or replace function public.create_kiosk_qr_challenge(
  organization_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  raw_token text;
  v_token_hash bytea;
  expires timestamptz;
begin
  if not (public.is_manager($1) or public.is_kiosk($1)) then
    raise exception 'not allowed';
  end if;

  if public.is_kiosk($1) and not private.kiosk_session_active($1) then
    raise exception 'kiosk session is not active';
  end if;

  raw_token := extensions.gen_random_uuid()::text || extensions.gen_random_uuid()::text;
  v_token_hash := extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256');
  expires := now() + interval '30 minutes';

  insert into public.kiosk_qr_challenges (
    organization_id, token_hash, expires_at, created_by
  )
  values ($1, v_token_hash, expires, actor);

  update public.kiosk_qr_challenges challenge
  set revoked_at = now()
  where challenge.organization_id = $1
    and challenge.created_by = actor
    and challenge.revoked_at is null
    and challenge.id <> (
      select current_challenge.id
      from public.kiosk_qr_challenges current_challenge
      where current_challenge.token_hash = v_token_hash
      limit 1
    );

  return raw_token;
end;
$$;

create or replace function public.create_kiosk_otp(
  organization_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  code text;
  v_code_hash bytea;
  expires timestamptz;
begin
  if not (public.is_manager($1) or public.is_kiosk($1)) then
    raise exception 'not allowed';
  end if;

  if public.is_kiosk($1) and not private.kiosk_session_active($1) then
    raise exception 'kiosk session is not active';
  end if;

  code := lpad(((floor(random() * 1000000))::integer % 1000000)::text, 6, '0');
  v_code_hash := extensions.digest(convert_to(code, 'UTF8'), 'sha256');
  expires := now() + interval '30 minutes';

  insert into public.kiosk_otp_challenges (organization_id, user_id, otp_hash, expires_at)
  values ($1, actor, v_code_hash, expires);

  update public.kiosk_otp_challenges challenge
  set revoked_at = now()
  where challenge.organization_id = $1
    and challenge.user_id = actor
    and challenge.revoked_at is null
    and challenge.id <> (
      select current_challenge.id
      from public.kiosk_otp_challenges current_challenge
      where current_challenge.otp_hash = v_code_hash
      limit 1
    );

  return code;
end;
$$;
