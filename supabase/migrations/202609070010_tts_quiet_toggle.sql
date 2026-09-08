alter table public.tts_settings
  add column if not exists quiet_enabled boolean not null default true;
