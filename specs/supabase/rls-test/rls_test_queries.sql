-- ============================================================
-- RLS TEST QUERIES — PWA Check-in GPS (Phase 1-5)
-- Chạy trong Supabase SQL Editor hoặc psql sau khi apply migration
-- Mục đích: Verify tất cả RLS policies hoạt động đúng với từng role
-- ============================================================

-- ============================================================
-- 0. SETUP: Tạo test users & seed data
-- ============================================================
DO $$
DECLARE
    v_staff_id UUID := '11111111-1111-1111-1111-111111111111';
    v_manager_id UUID := '22222222-2222-2222-2222-222222222222';
    v_accountant_id UUID := '33333333-3333-3333-3333-333333333333';
    v_hr_id UUID := '44444444-4444-4444-4444-444444444444';
    v_admin_id UUID := '55555555-5555-5555-5555-555555555555';
    v_office_id UUID;
    v_checkin_id UUID;
    v_ticket_id UUID;
    v_leave_id UUID;
    v_quota_id UUID;
    v_withdraw_id UUID;
    v_fund_id UUID;
    v_unmatched_id UUID;
    v_audit_id UUID;
    v_system_id UUID;
    v_client_id UUID;
    v_event_id UUID;
    v_noti_id UUID;
    v_pref_id UUID;
    v_push_id UUID;
    v_login_id UUID;
    v_role_id UUID;
    v_tablet_id UUID;
    v_setting_id UUID;
    v_payment_id UUID;
    v_penalty_legacy_id UUID;
BEGIN
    -- Cleanup old test data if exists
    DELETE FROM login_attempts WHERE id = v_login_id;
    DELETE FROM user_push_tokens WHERE id = v_push_id;
    DELETE FROM user_preferences WHERE id = v_pref_id;
    DELETE FROM notifications WHERE id = v_noti_id;
    DELETE FROM event_timelines WHERE id = v_event_id;
    DELETE FROM client_logs WHERE id = v_client_id;
    DELETE FROM system_logs WHERE id = v_system_id;
    DELETE FROM audit_logs WHERE id = v_audit_id;
    DELETE FROM unmatched_transactions WHERE id = v_unmatched_id;
    DELETE FROM fund_transactions WHERE id = v_fund_id;
    DELETE FROM withdraw_requests WHERE id = v_withdraw_id;
    DELETE FROM leave_request_comments WHERE leave_request_id IN (SELECT id FROM leave_requests WHERE user_id = v_staff_id);
    DELETE FROM leave_requests WHERE user_id = v_staff_id;
    DELETE FROM leave_quotas WHERE user_id = v_staff_id;
    DELETE FROM penalty_tickets WHERE user_id = v_staff_id;
    DELETE FROM payment_settings WHERE id = v_payment_id;
    DELETE FROM settings WHERE id = v_setting_id;
    DELETE FROM penalties WHERE user_id = v_staff_id;
    DELETE FROM tablet_tokens WHERE id = v_tablet_id;
    DELETE FROM checkins WHERE user_id = v_staff_id;
    DELETE FROM office_locations WHERE id = v_office_id;
    DELETE FROM user_roles WHERE user_id IN (v_staff_id, v_manager_id, v_accountant_id, v_hr_id, v_admin_id);
    DELETE FROM users WHERE id IN (v_staff_id, v_manager_id, v_accountant_id, v_hr_id, v_admin_id);

    -- Insert test users
    INSERT INTO users (id, email, full_name, role, is_active) VALUES
        (v_staff_id, 'staff@test.com', 'Nhan Vien A', 'staff', true),
        (v_manager_id, 'manager@test.com', 'Quan Ly B', 'manager', true),
        (v_accountant_id, 'accountant@test.com', 'Ke Toan C', 'accountant', true),
        (v_hr_id, 'hr@test.com', 'HR D', 'hr', true),
        (v_admin_id, 'admin@test.com', 'Admin E', 'admin', true);

    -- Insert user_roles for multi-role testing
    INSERT INTO user_roles (id, user_id, role, assigned_by) VALUES
        (gen_random_uuid(), v_manager_id, 'manager', v_admin_id),
        (gen_random_uuid(), v_accountant_id, 'accountant', v_admin_id),
        (gen_random_uuid(), v_hr_id, 'hr', v_admin_id),
        (gen_random_uuid(), v_admin_id, 'admin', v_admin_id);

    -- Insert office location
    INSERT INTO office_locations (id, name, latitude, longitude, radius_meters)
    VALUES (gen_random_uuid(), 'Test Office', 10.7725, 106.6980, 100)
    RETURNING id INTO v_office_id;

    -- Insert checkin
    INSERT INTO checkins (id, user_id, method, status, latitude, longitude, accuracy_meters, distance_meters)
    VALUES (gen_random_uuid(), v_staff_id, 'GPS', 'VALID', 10.7725, 106.6980, 5.0, 0.0)
    RETURNING id INTO v_checkin_id;

    -- Insert tablet token
    INSERT INTO tablet_tokens (id, tablet_id, qr_token, otp_code, used, expires_at)
    VALUES (gen_random_uuid(), 'TBL-01', 'abc123', '123456', false, NOW() + INTERVAL '1 hour')
    RETURNING id INTO v_tablet_id;

    -- Insert settings
    INSERT INTO settings (id, key, value, updated_by)
    VALUES (gen_random_uuid(), 'test_setting', 'test_value', v_admin_id)
    RETURNING id INTO v_setting_id;

    -- Insert payment settings
    INSERT INTO payment_settings (id, account_number, bank_code, account_holder, company_name, sepay_prefix)
    VALUES (gen_random_uuid(), '1010101010', 'ICB', 'CONG TY ABC', 'ABC Corp', 'SEVQR')
    RETURNING id INTO v_payment_id;

    -- Insert penalty ticket
    INSERT INTO penalty_tickets (id, user_id, transaction_id, amount, status, type, reason)
    VALUES (gen_random_uuid(), v_staff_id, 'A1B2C3D4', 20000, 'UNPAID', 'LATE_CHECKIN', 'Di tre')
    RETURNING id INTO v_ticket_id;

    -- Insert legacy penalty
    INSERT INTO penalties (id, user_id, checkin_id, type, amount, status)
    VALUES (gen_random_uuid(), v_staff_id, v_checkin_id, 'LATE', 20000, 'PENDING')
    RETURNING id INTO v_penalty_legacy_id;

    -- Insert fund transaction
    INSERT INTO fund_transactions (id, type, source, amount, description, created_by)
    VALUES (gen_random_uuid(), 'INCOME', 'PENALTY', 20000, 'Test fund', v_admin_id)
    RETURNING id INTO v_fund_id;

    -- Insert unmatched transaction
    INSERT INTO unmatched_transactions (id, sepay_id, content, amount, reason, received_at)
    VALUES (gen_random_uuid(), 'SEPAY001', 'SEVQR A1B2C3D4 NGUYEN VAN A', 20000, 'NO_TRANSACTION_ID', NOW())
    RETURNING id INTO v_unmatched_id;

    -- Insert audit log
    INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, old_value, new_value, reason)
    VALUES (gen_random_uuid(), v_admin_id, 'TEST_ACTION', 'PENALTY_TICKET', v_ticket_id, '{"status":"UNPAID"}'::jsonb, '{"status":"PAID"}'::jsonb, 'Test audit')
    RETURNING id INTO v_audit_id;

    -- Insert system log
    INSERT INTO system_logs (id, level, category, message, user_id)
    VALUES (gen_random_uuid(), 'INFO', 'API', 'Test system log', v_admin_id)
    RETURNING id INTO v_system_id;

    -- Insert client log
    INSERT INTO client_logs (id, user_id, category, event, message)
    VALUES (gen_random_uuid(), v_staff_id, 'GPS', 'timeout', 'Test client log')
    RETURNING id INTO v_client_id;

    -- Insert event timeline
    INSERT INTO event_timelines (id, entity_type, entity_id, event, actor_id)
    VALUES (gen_random_uuid(), 'CHECKIN', v_checkin_id, 'GPS_ATTEMPT', v_staff_id)
    RETURNING id INTO v_event_id;

    -- Insert leave quota
    INSERT INTO leave_quotas (id, user_id, year, annual_quota, annual_used, remote_quota, remote_used, carry_over)
    VALUES (gen_random_uuid(), v_staff_id, 2026, 12, 0, 3, 0, 0)
    RETURNING id INTO v_quota_id;

    -- Insert leave request
    INSERT INTO leave_requests (id, user_id, type, status, start_date, end_date, reason)
    VALUES (gen_random_uuid(), v_staff_id, 'FULL_DAY', 'PENDING', '2026-08-30', '2026-08-30', 'Test leave')
    RETURNING id INTO v_leave_id;

    -- Insert withdraw request
    INSERT INTO withdraw_requests (id, requester_id, amount, reason, status)
    VALUES (gen_random_uuid(), v_accountant_id, 500000, 'Test withdraw', 'PENDING')
    RETURNING id INTO v_withdraw_id;

    -- Insert notification
    INSERT INTO notifications (id, user_id, type, title, body, channel)
    VALUES (gen_random_uuid(), v_staff_id, 'TEST', 'Test Noti', 'Body', 'in_app')
    RETURNING id INTO v_noti_id;

    -- Insert user preference
    INSERT INTO user_preferences (id, user_id, theme)
    VALUES (gen_random_uuid(), v_staff_id, 'light')
    RETURNING id INTO v_pref_id;

    -- Insert push token
    INSERT INTO user_push_tokens (id, user_id, fcm_token, platform)
    VALUES (gen_random_uuid(), v_staff_id, 'token123', 'web')
    RETURNING id INTO v_push_id;

    -- Insert login attempt
    INSERT INTO login_attempts (id, email, ip_address, success)
    VALUES (gen_random_uuid(), 'staff@test.com', '127.0.0.1'::inet, true)
    RETURNING id INTO v_login_id;

    RAISE NOTICE 'Test data created successfully';
END $$;

-- ============================================================
-- 1. HELPER: Function để set JWT context cho test
-- ============================================================
CREATE OR REPLACE FUNCTION set_auth_context(p_user_id UUID, p_roles TEXT[])
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', p_user_id,
        'role', 'authenticated',
        'roles', p_roles,
        'email', p_user_id::text || '@test.com'
    )::text, true);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. TEST: users table
-- ============================================================
\echo '=== TEST: users ==='

-- STAFF: should see only self
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT users' as test, COUNT(*) as row_count FROM users;
-- Expected: 1 (self)

-- STAFF: should NOT see others
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT others' as test, COUNT(*) as row_count FROM users WHERE email = 'manager@test.com';
-- Expected: 0

-- STAFF: can update self
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
UPDATE users SET nickname = 'Updated Staff' WHERE id = '11111111-1111-1111-1111-111111111111';
SELECT 'STAFF UPDATE self' as test, nickname FROM users WHERE id = '11111111-1111-1111-1111-111111111111';
-- Expected: nickname = 'Updated Staff'

-- STAFF: cannot update others
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
UPDATE users SET nickname = 'Hacked' WHERE id = '22222222-2222-2222-2222-222222222222';
SELECT 'STAFF UPDATE others' as test, COUNT(*) as affected FROM users WHERE nickname = 'Hacked';
-- Expected: 0

-- MANAGER: can see all
SELECT set_auth_context('22222222-2222-2222-2222-222222222222', ARRAY['manager']);
SELECT 'MANAGER SELECT users' as test, COUNT(*) as row_count FROM users;
-- Expected: 5

-- ADMIN: can see all
SELECT set_auth_context('55555555-5555-5555-5555-555555555555', ARRAY['admin']);
SELECT 'ADMIN SELECT users' as test, COUNT(*) as row_count FROM users;
-- Expected: 5

-- HR: can see all
SELECT set_auth_context('44444444-4444-4444-4444-444444444444', ARRAY['hr']);
SELECT 'HR SELECT users' as test, COUNT(*) as row_count FROM users;
-- Expected: 5

-- ============================================================
-- 3. TEST: titles table
-- ============================================================
\echo '=== TEST: titles ==='

-- Any authenticated can read
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT titles' as test, COUNT(*) as row_count FROM titles;
-- Expected: 5 (seeded)

-- ============================================================
-- 4. TEST: office_locations
-- ============================================================
\echo '=== TEST: office_locations ==='

SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT office_locations' as test, COUNT(*) as row_count FROM office_locations;
-- Expected: >= 1

-- ============================================================
-- 5. TEST: checkins
-- ============================================================
\echo '=== TEST: checkins ==='

-- STAFF: see own
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT checkins' as test, COUNT(*) as row_count FROM checkins;
-- Expected: 1

-- STAFF: insert own
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
INSERT INTO checkins (id, user_id, method, status)
VALUES (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'GPS', 'VALID');
SELECT 'STAFF INSERT checkins' as test, COUNT(*) as row_count FROM checkins WHERE user_id = '11111111-1111-1111-1111-111111111111';
-- Expected: 2

-- STAFF: cannot insert for others
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
INSERT INTO checkins (id, user_id, method, status)
VALUES (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'GPS', 'VALID');
SELECT 'STAFF INSERT others checkin' as test, COUNT(*) as row_count FROM checkins WHERE user_id = '22222222-2222-2222-2222-222222222222';
-- Expected: 0

-- MANAGER: see all checkins
SELECT set_auth_context('22222222-2222-2222-2222-222222222222', ARRAY['manager']);
SELECT 'MANAGER SELECT checkins' as test, COUNT(*) as row_count FROM checkins;
-- Expected: 2

-- ============================================================
-- 6. TEST: tablet_tokens
-- ============================================================
\echo '=== TEST: tablet_tokens ==='

-- STAFF: cannot access
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT tablet_tokens' as test, COUNT(*) as row_count FROM tablet_tokens;
-- Expected: 0

-- MANAGER: can access
SELECT set_auth_context('22222222-2222-2222-2222-222222222222', ARRAY['manager']);
SELECT 'MANAGER SELECT tablet_tokens' as test, COUNT(*) as row_count FROM tablet_tokens;
-- Expected: 1

-- ADMIN: can access
SELECT set_auth_context('55555555-5555-5555-5555-555555555555', ARRAY['admin']);
SELECT 'ADMIN SELECT tablet_tokens' as test, COUNT(*) as row_count FROM tablet_tokens;
-- Expected: 1

-- ============================================================
-- 7. TEST: late_tiers & fraud_rules
-- ============================================================
\echo '=== TEST: late_tiers & fraud_rules ==='

SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT late_tiers' as test, COUNT(*) as row_count FROM late_tiers;
SELECT 'STAFF SELECT fraud_rules' as test, COUNT(*) as row_count FROM fraud_rules;
-- Expected: 0 (no seed, but policy allows) — if empty that's fine

-- ============================================================
-- 8. TEST: penalties (legacy)
-- ============================================================
\echo '=== TEST: penalties ==='

-- STAFF: see own
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT penalties' as test, COUNT(*) as row_count FROM penalties;
-- Expected: 1

-- MANAGER: see all
SELECT set_auth_context('22222222-2222-2222-2222-222222222222', ARRAY['manager']);
SELECT 'MANAGER SELECT penalties' as test, COUNT(*) as row_count FROM penalties;
-- Expected: 1

-- ============================================================
-- 9. TEST: settings
-- ============================================================
\echo '=== TEST: settings ==='

-- STAFF: cannot access
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT settings' as test, COUNT(*) as row_count FROM settings;
-- Expected: 0

-- MANAGER: can access
SELECT set_auth_context('22222222-2222-2222-2222-222222222222', ARRAY['manager']);
SELECT 'MANAGER SELECT settings' as test, COUNT(*) as row_count FROM settings;
-- Expected: >= 1

-- ============================================================
-- 10. TEST: payment_settings
-- ============================================================
\echo '=== TEST: payment_settings ==='

-- STAFF: cannot access
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT payment_settings' as test, COUNT(*) as row_count FROM payment_settings;
-- Expected: 0

-- MANAGER: can access
SELECT set_auth_context('22222222-2222-2222-2222-222222222222', ARRAY['manager']);
SELECT 'MANAGER SELECT payment_settings' as test, COUNT(*) as row_count FROM payment_settings;
-- Expected: >= 1

-- ACCOUNTANT: cannot access (policy only manager/admin)
SELECT set_auth_context('33333333-3333-3333-3333-333333333333', ARRAY['accountant']);
SELECT 'ACCOUNTANT SELECT payment_settings' as test, COUNT(*) as row_count FROM payment_settings;
-- Expected: 0

-- ============================================================
-- 11. TEST: penalty_tickets
-- ============================================================
\echo '=== TEST: penalty_tickets ==='

-- STAFF: see own
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT penalty_tickets' as test, COUNT(*) as row_count FROM penalty_tickets;
-- Expected: 1

-- STAFF: cannot see others
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT others penalty_tickets' as test, COUNT(*) as row_count FROM penalty_tickets WHERE user_id != '11111111-1111-1111-1111-111111111111';
-- Expected: 0

-- MANAGER: see all
SELECT set_auth_context('22222222-2222-2222-2222-222222222222', ARRAY['manager']);
SELECT 'MANAGER SELECT penalty_tickets' as test, COUNT(*) as row_count FROM penalty_tickets;
-- Expected: 1

-- ============================================================
-- 12. TEST: fund_transactions
-- ============================================================
\echo '=== TEST: fund_transactions ==='

-- STAFF: cannot access
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT fund_transactions' as test, COUNT(*) as row_count FROM fund_transactions;
-- Expected: 0

-- MANAGER: can access
SELECT set_auth_context('22222222-2222-2222-2222-222222222222', ARRAY['manager']);
SELECT 'MANAGER SELECT fund_transactions' as test, COUNT(*) as row_count FROM fund_transactions;
-- Expected: >= 1

-- ACCOUNTANT: can access
SELECT set_auth_context('33333333-3333-3333-3333-333333333333', ARRAY['accountant']);
SELECT 'ACCOUNTANT SELECT fund_transactions' as test, COUNT(*) as row_count FROM fund_transactions;
-- Expected: >= 1

-- HR: cannot access
SELECT set_auth_context('44444444-4444-4444-4444-444444444444', ARRAY['hr']);
SELECT 'HR SELECT fund_transactions' as test, COUNT(*) as row_count FROM fund_transactions;
-- Expected: 0

-- ============================================================
-- 13. TEST: sepay_webhook_logs
-- ============================================================
\echo '=== TEST: sepay_webhook_logs ==='

-- STAFF: cannot access
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT sepay_webhook_logs' as test, COUNT(*) as row_count FROM sepay_webhook_logs;
-- Expected: 0

-- ADMIN: can access
SELECT set_auth_context('55555555-5555-5555-5555-555555555555', ARRAY['admin']);
SELECT 'ADMIN SELECT sepay_webhook_logs' as test, COUNT(*) as row_count FROM sepay_webhook_logs;
-- Expected: 0 (no seed data, but policy allows)

-- MANAGER: cannot access
SELECT set_auth_context('22222222-2222-2222-2222-222222222222', ARRAY['manager']);
SELECT 'MANAGER SELECT sepay_webhook_logs' as test, COUNT(*) as row_count FROM sepay_webhook_logs;
-- Expected: 0

-- ============================================================
-- 14. TEST: unmatched_transactions
-- ============================================================
\echo '=== TEST: unmatched_transactions ==='

-- STAFF: cannot access
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT unmatched' as test, COUNT(*) as row_count FROM unmatched_transactions;
-- Expected: 0

-- ACCOUNTANT: can access
SELECT set_auth_context('33333333-3333-3333-3333-333333333333', ARRAY['accountant']);
SELECT 'ACCOUNTANT SELECT unmatched' as test, COUNT(*) as row_count FROM unmatched_transactions;
-- Expected: 1

-- MANAGER: can access
SELECT set_auth_context('22222222-2222-2222-2222-222222222222', ARRAY['manager']);
SELECT 'MANAGER SELECT unmatched' as test, COUNT(*) as row_count FROM unmatched_transactions;
-- Expected: 1

-- ============================================================
-- 15. TEST: audit_logs
-- ============================================================
\echo '=== TEST: audit_logs ==='

-- STAFF: cannot access
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT audit_logs' as test, COUNT(*) as row_count FROM audit_logs;
-- Expected: 0

-- MANAGER: can access
SELECT set_auth_context('22222222-2222-2222-2222-222222222222', ARRAY['manager']);
SELECT 'MANAGER SELECT audit_logs' as test, COUNT(*) as row_count FROM audit_logs;
-- Expected: 1

-- ACCOUNTANT: can access
SELECT set_auth_context('33333333-3333-3333-3333-333333333333', ARRAY['accountant']);
SELECT 'ACCOUNTANT SELECT audit_logs' as test, COUNT(*) as row_count FROM audit_logs;
-- Expected: 1

-- HR: can access
SELECT set_auth_context('44444444-4444-4444-4444-444444444444', ARRAY['hr']);
SELECT 'HR SELECT audit_logs' as test, COUNT(*) as row_count FROM audit_logs;
-- Expected: 1

-- ============================================================
-- 16. TEST: event_timelines
-- ============================================================
\echo '=== TEST: event_timelines ==='

-- STAFF: cannot access
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT event_timelines' as test, COUNT(*) as row_count FROM event_timelines;
-- Expected: 0

-- MANAGER: can access
SELECT set_auth_context('22222222-2222-2222-2222-222222222222', ARRAY['manager']);
SELECT 'MANAGER SELECT event_timelines' as test, COUNT(*) as row_count FROM event_timelines;
-- Expected: 1

-- ============================================================
-- 17. TEST: system_logs & client_logs
-- ============================================================
\echo '=== TEST: system_logs & client_logs ==='

-- STAFF: cannot access system_logs
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT system_logs' as test, COUNT(*) as row_count FROM system_logs;
-- Expected: 0

-- ADMIN: can access system_logs
SELECT set_auth_context('55555555-5555-5555-5555-555555555555', ARRAY['admin']);
SELECT 'ADMIN SELECT system_logs' as test, COUNT(*) as row_count FROM system_logs;
-- Expected: 1

-- STAFF: cannot access client_logs
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT client_logs' as test, COUNT(*) as row_count FROM client_logs;
-- Expected: 0

-- ADMIN: can access client_logs
SELECT set_auth_context('55555555-5555-5555-5555-555555555555', ARRAY['admin']);
SELECT 'ADMIN SELECT client_logs' as test, COUNT(*) as row_count FROM client_logs;
-- Expected: 1

-- ============================================================
-- 18. TEST: leave_requests
-- ============================================================
\echo '=== TEST: leave_requests ==='

-- STAFF: see own
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT leave_requests' as test, COUNT(*) as row_count FROM leave_requests;
-- Expected: 1

-- STAFF: insert own
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
INSERT INTO leave_requests (id, user_id, type, status, start_date, end_date, reason)
VALUES (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'REMOTE', 'DRAFT', '2026-09-01', '2026-09-01', 'Test insert');
SELECT 'STAFF INSERT leave_requests' as test, COUNT(*) as row_count FROM leave_requests WHERE user_id = '11111111-1111-1111-1111-111111111111';
-- Expected: 2

-- STAFF: cannot insert for others
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
INSERT INTO leave_requests (id, user_id, type, status, start_date, end_date, reason)
VALUES (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'REMOTE', 'DRAFT', '2026-09-01', '2026-09-01', 'Hack');
SELECT 'STAFF INSERT others leave' as test, COUNT(*) as row_count FROM leave_requests WHERE user_id = '22222222-2222-2222-2222-222222222222';
-- Expected: 0

-- STAFF: can update own DRAFT
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
UPDATE leave_requests SET reason = 'Updated reason' WHERE user_id = '11111111-1111-1111-1111-111111111111' AND status = 'DRAFT';
SELECT 'STAFF UPDATE own DRAFT' as test, COUNT(*) as row_count FROM leave_requests WHERE reason = 'Updated reason';
-- Expected: 1

-- STAFF: cannot update own PENDING (policy only allows DRAFT/PENDING in USING, but SET might still work depending on WITH CHECK)
-- Actually policy: USING (auth.uid() = user_id AND status IN ('DRAFT', 'PENDING'))
-- So PENDING row should be updatable
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
UPDATE leave_requests SET reason = 'Updated pending' WHERE user_id = '11111111-1111-1111-1111-111111111111' AND status = 'PENDING';
SELECT 'STAFF UPDATE own PENDING' as test, COUNT(*) as row_count FROM leave_requests WHERE reason = 'Updated pending';
-- Expected: 1

-- STAFF: cannot update others
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
UPDATE leave_requests SET reason = 'Hacked' WHERE user_id = '22222222-2222-2222-2222-222222222222';
SELECT 'STAFF UPDATE others leave' as test, COUNT(*) as row_count FROM leave_requests WHERE reason = 'Hacked';
-- Expected: 0

-- MANAGER: see all leave_requests
SELECT set_auth_context('22222222-2222-2222-2222-222222222222', ARRAY['manager']);
SELECT 'MANAGER SELECT leave_requests' as test, COUNT(*) as row_count FROM leave_requests;
-- Expected: 2

-- HR: see all leave_requests
SELECT set_auth_context('44444444-4444-4444-4444-444444444444', ARRAY['hr']);
SELECT 'HR SELECT leave_requests' as test, COUNT(*) as row_count FROM leave_requests;
-- Expected: 2

-- ============================================================
-- 19. TEST: leave_quotas
-- ============================================================
\echo '=== TEST: leave_quotas ==='

-- STAFF: see own
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT leave_quotas' as test, COUNT(*) as row_count FROM leave_quotas;
-- Expected: 1

-- MANAGER: see all
SELECT set_auth_context('22222222-2222-2222-2222-222222222222', ARRAY['manager']);
SELECT 'MANAGER SELECT leave_quotas' as test, COUNT(*) as row_count FROM leave_quotas;
-- Expected: 1

-- ============================================================
-- 20. TEST: leave_types_config
-- ============================================================
\echo '=== TEST: leave_types_config ==='

SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT leave_types_config' as test, COUNT(*) as row_count FROM leave_types_config;
-- Expected: 6

-- ============================================================
-- 21. TEST: leave_request_comments
-- ============================================================
\echo '=== TEST: leave_request_comments ==='

-- Note: Only SELECT policy defined in schema. Insert may be blocked by default.
-- STAFF: can see own comments (or manager/hr)
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT leave_comments' as test, COUNT(*) as row_count FROM leave_request_comments;
-- Expected: 0 (no data)

-- ============================================================
-- 22. TEST: withdraw_requests
-- ============================================================
\echo '=== TEST: withdraw_requests ==='

-- STAFF: cannot access
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT withdraw_requests' as test, COUNT(*) as row_count FROM withdraw_requests;
-- Expected: 0

-- ACCOUNTANT: can access
SELECT set_auth_context('33333333-3333-3333-3333-333333333333', ARRAY['accountant']);
SELECT 'ACCOUNTANT SELECT withdraw_requests' as test, COUNT(*) as row_count FROM withdraw_requests;
-- Expected: 1

-- MANAGER: can access
SELECT set_auth_context('22222222-2222-2222-2222-222222222222', ARRAY['manager']);
SELECT 'MANAGER SELECT withdraw_requests' as test, COUNT(*) as row_count FROM withdraw_requests;
-- Expected: 1

-- ============================================================
-- 23. TEST: user_roles
-- ============================================================
\echo '=== TEST: user_roles ==='

-- STAFF: cannot access
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT user_roles' as test, COUNT(*) as row_count FROM user_roles;
-- Expected: 0

-- ADMIN: can access
SELECT set_auth_context('55555555-5555-5555-5555-555555555555', ARRAY['admin']);
SELECT 'ADMIN SELECT user_roles' as test, COUNT(*) as row_count FROM user_roles;
-- Expected: 4

-- ============================================================
-- 24. TEST: notifications
-- ============================================================
\echo '=== TEST: notifications ==='

-- STAFF: see own
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT notifications' as test, COUNT(*) as row_count FROM notifications;
-- Expected: 1

-- STAFF: cannot see others
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT others noti' as test, COUNT(*) as row_count FROM notifications WHERE user_id = '22222222-2222-2222-2222-222222222222';
-- Expected: 0

-- ============================================================
-- 25. TEST: user_preferences
-- ============================================================
\echo '=== TEST: user_preferences ==='

-- STAFF: see own
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT preferences' as test, COUNT(*) as row_count FROM user_preferences;
-- Expected: 1

-- STAFF: update own
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
UPDATE user_preferences SET theme = 'dark' WHERE user_id = '11111111-1111-1111-1111-111111111111';
SELECT 'STAFF UPDATE preferences' as test, theme FROM user_preferences WHERE user_id = '11111111-1111-1111-1111-111111111111';
-- Expected: dark

-- STAFF: cannot update others
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
UPDATE user_preferences SET theme = 'dark' WHERE user_id = '22222222-2222-2222-2222-222222222222';
SELECT 'STAFF UPDATE others pref' as test, COUNT(*) as row_count FROM user_preferences WHERE user_id = '22222222-2222-2222-2222-222222222222' AND theme = 'dark';
-- Expected: 0

-- ============================================================
-- 26. TEST: user_push_tokens
-- ============================================================
\echo '=== TEST: user_push_tokens ==='

-- STAFF: see own
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT push_tokens' as test, COUNT(*) as row_count FROM user_push_tokens;
-- Expected: 1

-- ============================================================
-- 27. TEST: login_attempts
-- ============================================================
\echo '=== TEST: login_attempts ==='

-- STAFF: cannot access
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT login_attempts' as test, COUNT(*) as row_count FROM login_attempts;
-- Expected: 0

-- ADMIN: can access
SELECT set_auth_context('55555555-5555-5555-5555-555555555555', ARRAY['admin']);
SELECT 'ADMIN SELECT login_attempts' as test, COUNT(*) as row_count FROM login_attempts;
-- Expected: 1

-- ============================================================
-- 28. TEST: VIEWS (fund_balance_total, fund_balance_by_branch)
-- ============================================================
\echo '=== TEST: fund views ==='

-- STAFF: cannot access view (backed by fund_transactions RLS)
SELECT set_auth_context('11111111-1111-1111-1111-111111111111', ARRAY['staff']);
SELECT 'STAFF SELECT fund_balance_total' as test, COUNT(*) as row_count FROM fund_balance_total;
-- Expected: 0

-- MANAGER: can access
SELECT set_auth_context('22222222-2222-2222-2222-222222222222', ARRAY['manager']);
SELECT 'MANAGER SELECT fund_balance_total' as test, total_balance FROM fund_balance_total;
-- Expected: 1 row with balance >= 0

-- ============================================================
-- 29. TEST: Multi-role user (Manager + Accountant)
-- ============================================================
\echo '=== TEST: multi-role ==='

-- User with both manager and accountant roles
SELECT set_auth_context('22222222-2222-2222-2222-222222222222', ARRAY['manager', 'accountant']);
SELECT 'MULTI-ROLE SELECT fund' as test, COUNT(*) as row_count FROM fund_transactions;
-- Expected: >= 1 (accountant role grants access)

SELECT set_auth_context('22222222-2222-2222-2222-222222222222', ARRAY['manager', 'accountant']);
SELECT 'MULTI-ROLE SELECT withdraw' as test, COUNT(*) as row_count FROM withdraw_requests;
-- Expected: >= 1 (manager role grants access)

-- ============================================================
-- 30. TEST: Edge cases & Negative tests
-- ============================================================
\echo '=== TEST: edge cases ==='

-- Anonymous (no auth) should see nothing on authenticated tables
SELECT set_config('request.jwt.claims', '', true);
SELECT 'ANON SELECT users' as test, COUNT(*) as row_count FROM users;
-- Expected: 0 (RLS enabled, no policy for anon)

-- Reset context
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- CLEANUP: Remove test data
-- ============================================================
\echo '=== CLEANUP ==='
DO $$
DECLARE
    v_staff_id UUID := '11111111-1111-1111-1111-111111111111';
    v_manager_id UUID := '22222222-2222-2222-2222-222222222222';
BEGIN
    DELETE FROM login_attempts WHERE email LIKE '%@test.com';
    DELETE FROM user_push_tokens WHERE user_id IN (v_staff_id, v_manager_id);
    DELETE FROM user_preferences WHERE user_id IN (v_staff_id, v_manager_id);
    DELETE FROM notifications WHERE user_id IN (v_staff_id, v_manager_id);
    DELETE FROM event_timelines WHERE actor_id IN (v_staff_id, v_manager_id);
    DELETE FROM client_logs WHERE user_id IN (v_staff_id, v_manager_id);
    DELETE FROM system_logs WHERE user_id IN (v_staff_id, v_manager_id);
    DELETE FROM audit_logs WHERE actor_id IN (v_staff_id, v_manager_id);
    DELETE FROM unmatched_transactions WHERE sepay_id = 'SEPAY001';
    DELETE FROM fund_transactions WHERE description = 'Test fund' OR description LIKE 'Test%' OR source = 'MATCH_ADJUST' OR source = 'REFUND';
    DELETE FROM withdraw_requests WHERE reason = 'Test withdraw';
    DELETE FROM leave_request_comments WHERE user_id IN (v_staff_id, v_manager_id);
    DELETE FROM leave_requests WHERE user_id IN (v_staff_id, v_manager_id) OR reason IN ('Test insert', 'Updated reason', 'Updated pending');
    DELETE FROM leave_quotas WHERE user_id = v_staff_id;
    DELETE FROM penalty_tickets WHERE transaction_id = 'A1B2C3D4';
    DELETE FROM payment_settings WHERE account_number = '1010101010';
    DELETE FROM settings WHERE key = 'test_setting';
    DELETE FROM penalties WHERE user_id = v_staff_id;
    DELETE FROM tablet_tokens WHERE tablet_id = 'TBL-01';
    DELETE FROM checkins WHERE user_id IN (v_staff_id, v_manager_id);
    DELETE FROM office_locations WHERE name = 'Test Office';
    DELETE FROM user_roles WHERE user_id IN (v_staff_id, v_manager_id, '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555');
    DELETE FROM users WHERE id IN (v_staff_id, v_manager_id, '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555');
END $$;

DROP FUNCTION IF EXISTS set_auth_context(UUID, TEXT[]);

\echo 'RLS TEST COMPLETE — Review output above for any unexpected row counts.'
