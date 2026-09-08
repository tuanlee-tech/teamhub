create or replace function public.is_active_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.is_active
  );
$$;

create or replace function public.is_manager(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and membership.role = 'manager'
      and membership.status = 'active'
      and membership.is_active
  );
$$;

create or replace function public.shares_active_organization(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and mine.is_active
      and theirs.user_id = target_user_id
      and theirs.status = 'active'
      and theirs.is_active
  );
$$;

revoke all on function public.is_active_member(uuid) from public;
revoke all on function public.is_manager(uuid) from public;
revoke all on function public.shares_active_organization(uuid) from public;
grant execute on function public.is_active_member(uuid) to authenticated;
grant execute on function public.is_manager(uuid) to authenticated;
grant execute on function public.shares_active_organization(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_settings enable row level security;
alter table public.penalty_tiers enable row level security;
alter table public.attendance_days enable row level security;
alter table public.daily_roster enable row level security;
alter table public.attendance_records enable row level security;
alter table public.check_in_attempts enable row level security;
alter table public.kiosk_qr_challenges enable row level security;
alter table public.fines enable row level security;
alter table public.sepay_webhook_events enable row level security;
alter table public.fund_transactions enable row level security;
alter table public.fine_allocations enable row level security;
alter table public.fund_entry_audits enable row level security;
alter table public.tts_settings enable row level security;
alter table public.message_packs enable row level security;
alter table public.message_templates enable row level security;
alter table public.announcement_events enable row level security;
alter table public.tts_pool_states enable row level security;
alter table public.kiosk_sessions enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.title_definitions enable row level security;
alter table public.member_stats enable row level security;
alter table public.member_title_history enable row level security;
alter table public.audit_logs enable row level security;

create policy "members can view their organizations"
on public.organizations for select to authenticated
using (public.is_active_member(id));

create policy "managers can update their organizations"
on public.organizations for update to authenticated
using (public.is_manager(id))
with check (public.is_manager(id));

create policy "users can view visible profiles"
on public.profiles for select to authenticated
using (user_id = auth.uid() or public.shares_active_organization(user_id));

create policy "users can update their profile"
on public.profiles for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "users can view their membership or active coworkers"
on public.organization_members for select to authenticated
using (user_id = auth.uid() or public.is_active_member(organization_id));

create policy "managers can update memberships"
on public.organization_members for update to authenticated
using (public.is_manager(organization_id))
with check (public.is_manager(organization_id));

create policy "active members can view organization settings"
on public.organization_settings for select to authenticated
using (public.is_active_member(organization_id));

create policy "managers can update organization settings"
on public.organization_settings for update to authenticated
using (public.is_manager(organization_id))
with check (public.is_manager(organization_id));

create policy "active members can view penalty tiers"
on public.penalty_tiers for select to authenticated
using (public.is_active_member(organization_id));

create policy "managers can manage penalty tiers"
on public.penalty_tiers for all to authenticated
using (public.is_manager(organization_id))
with check (public.is_manager(organization_id));

create policy "active members can view attendance days"
on public.attendance_days for select to authenticated
using (public.is_active_member(organization_id));

create policy "active members can view daily roster"
on public.daily_roster for select to authenticated
using (public.is_active_member(organization_id));

create policy "managers can manage daily roster"
on public.daily_roster for all to authenticated
using (public.is_manager(organization_id))
with check (public.is_manager(organization_id));

create policy "active members can view attendance records"
on public.attendance_records for select to authenticated
using (public.is_active_member(organization_id));

create policy "users can view their check in attempts"
on public.check_in_attempts for select to authenticated
using (user_id = auth.uid() or public.is_manager(organization_id));

create policy "managers can view kiosk challenges"
on public.kiosk_qr_challenges for select to authenticated
using (public.is_manager(organization_id));

create policy "users can view their fines"
on public.fines for select to authenticated
using (user_id = auth.uid() or public.is_manager(organization_id));

create policy "managers can view raw SePay events"
on public.sepay_webhook_events for select to authenticated
using (organization_id is not null and public.is_manager(organization_id));

create policy "active members can view fund transactions"
on public.fund_transactions for select to authenticated
using (public.is_active_member(organization_id));

create policy "active members can view fine allocations"
on public.fine_allocations for select to authenticated
using (public.is_active_member(organization_id));

create policy "managers can view fund audits"
on public.fund_entry_audits for select to authenticated
using (public.is_manager(organization_id));

create policy "active members can view TTS settings"
on public.tts_settings for select to authenticated
using (public.is_active_member(organization_id));

create policy "managers can update TTS settings"
on public.tts_settings for update to authenticated
using (public.is_manager(organization_id))
with check (public.is_manager(organization_id));

create policy "active members can view message packs"
on public.message_packs for select to authenticated
using (public.is_active_member(organization_id));

create policy "managers can manage message packs"
on public.message_packs for all to authenticated
using (public.is_manager(organization_id))
with check (public.is_manager(organization_id));

create policy "active members can view message templates"
on public.message_templates for select to authenticated
using (public.is_active_member(organization_id));

create policy "managers can manage message templates"
on public.message_templates for all to authenticated
using (public.is_manager(organization_id))
with check (public.is_manager(organization_id));

create policy "managers can view announcement events"
on public.announcement_events for select to authenticated
using (public.is_manager(organization_id));

create policy "managers can view TTS pool states"
on public.tts_pool_states for select to authenticated
using (public.is_manager(organization_id));

create policy "managers can manage kiosk sessions"
on public.kiosk_sessions for all to authenticated
using (public.is_manager(organization_id))
with check (public.is_manager(organization_id) and user_id = auth.uid());

create policy "users can manage their push subscriptions"
on public.push_subscriptions for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "users can view their notification outbox"
on public.notification_outbox for select to authenticated
using (target_user_id = auth.uid());

create policy "authenticated users can view title definitions"
on public.title_definitions for select to authenticated
using (true);

create policy "active members can view member stats"
on public.member_stats for select to authenticated
using (public.is_active_member(organization_id));

create policy "active members can view title history"
on public.member_title_history for select to authenticated
using (public.is_active_member(organization_id));

create policy "managers can view audit logs"
on public.audit_logs for select to authenticated
using (organization_id is not null and public.is_manager(organization_id));

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('fund-receipts', 'fund-receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "public can read avatars"
on storage.objects for select to public
using (bucket_id = 'avatars');

create policy "users can upload their avatar"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users can update their avatar"
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and owner_id = auth.uid()::text)
with check (
  bucket_id = 'avatars'
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users can delete their avatar"
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and owner_id = auth.uid()::text);

create policy "managers can read fund receipts"
on storage.objects for select to authenticated
using (
  bucket_id = 'fund-receipts'
  and exists (
    select 1
    from public.organization_members membership
    where membership.user_id = auth.uid()
      and membership.role = 'manager'
      and membership.status = 'active'
      and membership.is_active
      and (storage.foldername(name))[1] = membership.organization_id::text
  )
);

create policy "managers can upload fund receipts"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'fund-receipts'
  and exists (
    select 1
    from public.organization_members membership
    where membership.user_id = auth.uid()
      and membership.role = 'manager'
      and membership.status = 'active'
      and membership.is_active
      and (storage.foldername(name))[1] = membership.organization_id::text
  )
);

alter table public.organization_members replica identity full;
alter table public.attendance_records replica identity full;
alter table public.fines replica identity full;
alter table public.fund_transactions replica identity full;
alter table public.fine_allocations replica identity full;
alter table public.announcement_events replica identity full;
alter table public.member_stats replica identity full;

do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array[
    'organization_members',
    'attendance_records',
    'fines',
    'fund_transactions',
    'fine_allocations',
    'announcement_events',
    'member_stats'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = realtime_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', realtime_table);
    end if;
  end loop;
end;
$$;
