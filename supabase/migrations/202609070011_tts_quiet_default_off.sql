alter table public.tts_settings alter column quiet_enabled set default false;
update public.tts_settings set quiet_enabled = false where quiet_enabled = true;
