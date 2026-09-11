create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create type public.app_role as enum ('manager', 'member');
create type public.membership_status as enum ('pending', 'active', 'rejected');
create type public.attendance_day_status as enum ('open', 'auto_late_processed', 'closed');
create type public.attendance_state as enum ('pending', 'on_time', 'late', 'excused');
create type public.check_in_method as enum ('gps', 'qr');
create type public.fine_status as enum ('unpaid', 'paid', 'waived');
create type public.fund_direction as enum ('incoming', 'outgoing');
create type public.fund_source as enum ('sepay', 'manual');
create type public.reconciliation_status as enum ('matched', 'unmatched', 'ignored');
create type public.message_pack_kind as enum ('system', 'trend', 'custom');
create type public.announcement_event_type as enum ('late', 'payment', 'on_time', 'achievement', 'fund_balance');
create type public.announcement_priority as enum ('high', 'normal', 'low');
create type public.announcement_status as enum ('pending', 'leased', 'spoken', 'suppressed', 'failed');
create type public.notification_status as enum ('pending', 'processing', 'sent', 'failed');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  slug extensions.citext not null unique,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index organizations_one_default_idx on public.organizations (is_default) where is_default;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username extensions.citext unique,
  display_name text not null check (char_length(display_name) between 1 and 100),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role public.app_role not null default 'member',
  status public.membership_status not null default 'pending',
  is_active boolean not null default true,
  approved_at timestamptz,
  approved_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  session_start time not null default '00:00',
  session_end time not null default '23:59',
  valid_check_in_time time not null default '09:35',
  work_days smallint[] not null default array[1, 2, 3, 4, 5]::smallint[],
  office_latitude double precision check (office_latitude between -90 and 90),
  office_longitude double precision check (office_longitude between -180 and 180),
  office_radius_m integer not null default 100 check (office_radius_m between 10 and 5000),
  max_gps_accuracy_m integer not null default 100 check (max_gps_accuracy_m between 10 and 1000),
  bank_code text check (bank_code in ('VCB', 'STB', 'TPB', 'VPB', 'ICB', 'ACB', 'BIDV', 'MB', 'OCB', 'KLB', 'MSB')),
  bank_short_name text check (char_length(bank_short_name) <= 40),
  bank_account_number text check (bank_account_number ~ '^[A-Za-z0-9]{1,19}$'),
  bank_account_holder text,
  transfer_description_rule text check (transfer_description_rule ~ '^[A-Za-z0-9 ]+$'),
  fund_display_name text,
  vietqr_template text not null default 'compact' check (vietqr_template in ('compact', 'qronly', 'standee')),
  vietqr_show_info boolean not null default true,
  vietqr_full_account boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(user_id) on delete set null,
  constraint work_days_are_valid check (
    cardinality(work_days) > 0
    and work_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  ),
  constraint office_coordinates_are_complete check (
    (office_latitude is null and office_longitude is null)
    or (office_latitude is not null and office_longitude is not null)
  ),
  constraint bank_configuration_is_complete check (
    (bank_code is null and bank_account_number is null and bank_account_holder is null and transfer_description_rule is null)
    or (bank_code is not null and bank_account_number is not null and bank_account_holder is not null and transfer_description_rule is not null)
  ),
  constraint vietinbank_rule_contains_sevqr check (
    bank_code is distinct from 'ICB' or upper(transfer_description_rule) like '%SEVQR%'
  )
);

create table public.penalty_tiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  threshold_minutes integer not null check (threshold_minutes >= 0),
  amount_vnd bigint not null check (amount_vnd > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, threshold_minutes)
);

create table public.attendance_days (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  work_date date not null,
  timezone text not null,
  session_start_at timestamptz not null,
  session_end_at timestamptz not null,
  valid_check_in_at timestamptz not null,
  auto_late_at timestamptz not null,
  tier_snapshot jsonb not null default '[]'::jsonb,
  status public.attendance_day_status not null default 'open',
  roster_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, work_date),
  check (session_end_at > session_start_at),
  check (valid_check_in_at between session_start_at and session_end_at),
  check (auto_late_at > valid_check_in_at)
);

create table public.daily_roster (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  attendance_day_id uuid not null references public.attendance_days(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  is_required boolean not null default true,
  exclusion_reason text,
  changed_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attendance_day_id, user_id),
  check (is_required or exclusion_reason is not null)
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  attendance_day_id uuid not null references public.attendance_days(id) on delete cascade,
  roster_id uuid not null references public.daily_roster(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  state public.attendance_state not null default 'pending',
  checked_in_at timestamptz,
  marked_late_at timestamptz,
  check_in_method public.check_in_method,
  late_minutes integer not null default 0 check (late_minutes >= 0),
  distance_m double precision check (distance_m >= 0),
  gps_accuracy_m double precision check (gps_accuracy_m >= 0),
  penalty_tier_id uuid references public.penalty_tiers(id) on delete set null,
  fine_amount_snapshot bigint not null default 0 check (fine_amount_snapshot >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (roster_id),
  unique (attendance_day_id, user_id)
);

create table public.check_in_attempts (
  id bigint generated by default as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  attendance_day_id uuid references public.attendance_days(id) on delete set null,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  method public.check_in_method not null,
  succeeded boolean not null,
  rejection_reason text,
  distance_m double precision check (distance_m >= 0),
  gps_accuracy_m double precision check (gps_accuracy_m >= 0),
  server_received_at timestamptz not null default now()
);

create table public.kiosk_qr_challenges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table public.fines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  attendance_record_id uuid not null unique references public.attendance_records(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{5,12}$'),
  amount_vnd bigint not null check (amount_vnd > 0),
  status public.fine_status not null default 'unpaid',
  paid_at timestamptz,
  waived_at timestamptz,
  waived_by uuid references public.profiles(user_id) on delete set null,
  waiver_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fine_paid_state_is_consistent check ((status = 'paid') = (paid_at is not null)),
  constraint fine_waived_state_is_consistent check (
    (status = 'waived') = (waived_at is not null and waiver_reason is not null)
  )
);

create table public.sepay_webhook_events (
  id bigint generated by default as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  sepay_transaction_id bigint not null unique,
  gateway text not null,
  account_number text,
  transfer_type text not null,
  transfer_amount numeric(20, 2) not null,
  transaction_at timestamptz,
  content text,
  reference_code text,
  raw_payload jsonb not null,
  reconciliation_status public.reconciliation_status not null default 'unmatched',
  processing_error text,
  received_at timestamptz not null default now()
);

create table public.fund_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  direction public.fund_direction not null,
  source public.fund_source not null,
  amount_vnd bigint not null check (amount_vnd > 0),
  occurred_at timestamptz not null,
  description text not null,
  reference_code text,
  reconciliation_status public.reconciliation_status not null,
  sepay_event_id bigint unique references public.sepay_webhook_events(id) on delete restrict,
  receipt_path text,
  created_by uuid references public.profiles(user_id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references public.profiles(user_id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fund_source_is_consistent check (
    (source = 'sepay' and sepay_event_id is not null)
    or (source = 'manual' and sepay_event_id is null and created_by is not null)
  ),
  constraint fund_void_state_is_consistent check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and void_reason is not null)
  )
);

create table public.fine_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fund_transaction_id uuid not null references public.fund_transactions(id) on delete restrict,
  fine_id uuid not null references public.fines(id) on delete restrict,
  amount_vnd bigint not null check (amount_vnd > 0),
  allocated_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  unique (fund_transaction_id, fine_id)
);

create table public.fund_entry_audits (
  id bigint generated by default as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fund_transaction_id uuid not null references public.fund_transactions(id) on delete cascade,
  actor_id uuid references public.profiles(user_id) on delete set null,
  action text not null,
  previous_values jsonb,
  next_values jsonb,
  created_at timestamptz not null default now()
);

create table public.tts_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  personality text not null default 'friendly' check (personality in ('friendly', 'teasing', 'spicy', 'extra_spicy', 'relentless')),
  enabled_events public.announcement_event_type[] not null default array['late', 'payment']::public.announcement_event_type[],
  cooldown_seconds integer not null default 10 check (cooldown_seconds between 0 and 300),
  quiet_start time not null default '07:00',
  quiet_end time not null default '10:00',
  locale text not null default 'vi-VN',
  preferred_voice text,
  speech_rate numeric(3, 2) not null default 1 check (speech_rate between 0.5 and 2),
  speech_pitch numeric(3, 2) not null default 1 check (speech_pitch between 0 and 2),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(user_id) on delete set null
);

create table public.message_packs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind public.message_pack_kind not null,
  name text not null,
  is_enabled boolean not null default true,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pack_id uuid not null references public.message_packs(id) on delete cascade,
  event_type public.announcement_event_type not null,
  personality text not null check (personality in ('friendly', 'teasing', 'spicy', 'extra_spicy', 'relentless')),
  template text not null check (char_length(template) between 1 and 300),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.announcement_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type public.announcement_event_type not null,
  priority public.announcement_priority not null default 'normal',
  payload jsonb not null default '{}'::jsonb,
  rendered_text text,
  template_id uuid references public.message_templates(id) on delete set null,
  status public.announcement_status not null default 'pending',
  leased_by text,
  leased_until timestamptz,
  spoken_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.tts_pool_states (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type public.announcement_event_type not null,
  remaining_template_ids uuid[] not null default '{}',
  last_template_id uuid references public.message_templates(id) on delete set null,
  pool_signature text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, event_type)
);

create table public.kiosk_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_id text not null,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  is_primary_speaker boolean not null default false,
  last_heartbeat_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, device_id)
);

create unique index kiosk_one_primary_speaker_idx
  on public.kiosk_sessions (organization_id)
  where is_primary_speaker;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  user_agent text,
  is_active boolean not null default true,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_user_id uuid not null references public.profiles(user_id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  status public.notification_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table public.title_definitions (
  rank smallint primary key,
  key text not null unique,
  title text not null,
  min_rate numeric(5, 2) not null,
  max_rate numeric(5, 2),
  include_min boolean not null default false,
  check (min_rate between 0 and 100),
  check (max_rate is null or max_rate between min_rate and 100)
);

create table public.member_stats (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  required_days integer not null default 0 check (required_days >= 0),
  late_days integer not null default 0 check (late_days >= 0 and late_days <= required_days),
  late_rate numeric(5, 2) not null default 0 check (late_rate between 0 and 100),
  current_title_key text references public.title_definitions(key),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.member_title_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  previous_title_key text references public.title_definitions(key),
  next_title_key text not null references public.title_definitions(key),
  late_rate numeric(5, 2) not null check (late_rate between 0 and 100),
  achieved_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated by default as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(user_id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index organization_members_user_idx on public.organization_members (user_id, status);
create index penalty_tiers_active_idx on public.penalty_tiers (organization_id, threshold_minutes desc) where is_active;
create index attendance_days_date_idx on public.attendance_days (organization_id, work_date desc);
create index daily_roster_user_idx on public.daily_roster (organization_id, user_id, attendance_day_id);
create index attendance_records_today_idx on public.attendance_records (organization_id, attendance_day_id, state);
create index check_in_attempts_user_idx on public.check_in_attempts (user_id, server_received_at desc);
create index kiosk_qr_active_idx on public.kiosk_qr_challenges (organization_id, expires_at) where revoked_at is null;
create index fines_user_status_idx on public.fines (organization_id, user_id, status);
create index fund_transactions_history_idx on public.fund_transactions (organization_id, occurred_at desc) where voided_at is null;
create index announcement_queue_idx on public.announcement_events (organization_id, status, priority, created_at);
create index notification_outbox_pending_idx on public.notification_outbox (status, next_attempt_at) where status in ('pending', 'failed');

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.login_identifiers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username extensions.citext unique,
  email extensions.citext not null unique,
  updated_at timestamptz not null default now()
);

revoke all on table private.login_identifiers from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at before update on public.organizations for each row execute function private.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger organization_members_set_updated_at before update on public.organization_members for each row execute function private.set_updated_at();
create trigger organization_settings_set_updated_at before update on public.organization_settings for each row execute function private.set_updated_at();
create trigger penalty_tiers_set_updated_at before update on public.penalty_tiers for each row execute function private.set_updated_at();
create trigger attendance_days_set_updated_at before update on public.attendance_days for each row execute function private.set_updated_at();
create trigger daily_roster_set_updated_at before update on public.daily_roster for each row execute function private.set_updated_at();
create trigger attendance_records_set_updated_at before update on public.attendance_records for each row execute function private.set_updated_at();
create trigger fines_set_updated_at before update on public.fines for each row execute function private.set_updated_at();
create trigger fund_transactions_set_updated_at before update on public.fund_transactions for each row execute function private.set_updated_at();
create trigger tts_settings_set_updated_at before update on public.tts_settings for each row execute function private.set_updated_at();
create trigger message_packs_set_updated_at before update on public.message_packs for each row execute function private.set_updated_at();
create trigger message_templates_set_updated_at before update on public.message_templates for each row execute function private.set_updated_at();
create trigger tts_pool_states_set_updated_at before update on public.tts_pool_states for each row execute function private.set_updated_at();
create trigger push_subscriptions_set_updated_at before update on public.push_subscriptions for each row execute function private.set_updated_at();

insert into public.organizations (id, name, slug, is_default)
values ('00000000-0000-4000-8000-000000000001', 'TeamHub', 'team-hub', true);

insert into public.organization_settings (organization_id)
values ('00000000-0000-4000-8000-000000000001');

insert into public.tts_settings (organization_id)
values ('00000000-0000-4000-8000-000000000001');

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_organization_id uuid;
  proposed_username extensions.citext;
  proposed_display_name text;
begin
  proposed_username := nullif(lower(trim(new.raw_user_meta_data ->> 'username')), '')::extensions.citext;
  proposed_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    proposed_username::text,
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (user_id, username, display_name)
  values (new.id, proposed_username, proposed_display_name);

  insert into private.login_identifiers (user_id, username, email)
  values (new.id, proposed_username, lower(new.email)::extensions.citext);

  select id into default_organization_id from public.organizations where is_default limit 1;

  if default_organization_id is not null then
    insert into public.organization_members (organization_id, user_id)
    values (default_organization_id, new.id);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.sync_login_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.login_identifiers set username = new.username, updated_at = now() where user_id = new.user_id;
  return new;
end;
$$;

create trigger on_profile_username_changed
after update of username on public.profiles
for each row
when (old.username is distinct from new.username)
execute function private.sync_login_username();
