-- Reset全部 dữ liệu (giữ nguyên organizations, organization_settings, tts_settings)
-- Chạy trên Supabase SQL Editor với service_role key

-- Xóa dữ liệu theo thứ tự foreign key
DELETE FROM public.audit_logs;
DELETE FROM public.notification_outbox;
DELETE FROM public.push_subscriptions;
DELETE FROM public.kiosk_sessions;
DELETE FROM public.kiosk_qr_challenges;
DELETE FROM public.check_in_attempts;
DELETE FROM public.fine_allocations;
DELETE FROM public.fund_entry_audits;
DELETE FROM public.fund_transactions;
DELETE FROM public.fines;
DELETE FROM public.attendance_records;
DELETE FROM public.daily_roster;
DELETE FROM public.attendance_days;
DELETE FROM public.message_templates;
DELETE FROM public.message_packs;
DELETE FROM public.tts_pool_states;
DELETE FROM public.announcement_events;
DELETE FROM public.penalty_tiers;
DELETE FROM public.member_title_history;
DELETE FROM public.member_stats;
DELETE FROM public.sepay_webhook_events;

-- Chỉ xóa tài khoản test. Không xóa profile/membership của người dùng thật.
-- Cascade từ auth.users sẽ dọn profile, membership và login identifier tương ứng.
DELETE FROM auth.users WHERE email LIKE '%@test.com';

-- Reset organization_settings về mặc định
UPDATE public.organization_settings SET
  valid_check_in_time = '09:35',
  session_start = '00:00',
  session_end = '23:59',
  work_days = array[1,2,3,4,5]::smallint[],
  office_latitude = NULL,
  office_longitude = NULL;
