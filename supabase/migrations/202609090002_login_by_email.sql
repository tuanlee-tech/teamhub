-- Allow login with username OR email.
create or replace function public.resolve_login_email(lookup_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select identifier.email::text
  from private.login_identifiers identifier
  where identifier.username = lower(trim(lookup_username))::extensions.citext
     or identifier.email = lower(trim(lookup_username))::extensions.citext
  limit 1;
$$;

revoke all on function public.resolve_login_email(text) from public, anon, authenticated;
grant execute on function public.resolve_login_email(text) to service_role;