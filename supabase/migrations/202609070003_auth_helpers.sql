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
  limit 1;
$$;

revoke all on function public.resolve_login_email(text) from public, anon, authenticated;
grant execute on function public.resolve_login_email(text) to service_role;

create or replace function private.sync_login_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update private.login_identifiers
    set email = lower(new.email)::extensions.citext, updated_at = now()
    where user_id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function private.sync_login_email();
