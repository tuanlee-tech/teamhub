-- ============================================================
-- Seed Data — PWA Check-in GPS (Phase 1-5)
-- Run after: 001_initial_schema.sql
-- ============================================================

-- Clear existing data (optional — use with caution in production)
-- Uncomment below if you want a clean slate
/*
TRUNCATE TABLE login_attempts, user_push_tokens, user_preferences, notifications,
  event_timelines, client_logs, system_logs, audit_logs, unmatched_transactions,
  sepay_webhook_logs, fund_transactions, withdraw_requests, leave_request_comments,
  leave_requests, leave_quotas, penalty_tickets, penalties, checkins, tablet_tokens,
  user_roles, users, office_locations, payment_settings, settings, titles,
  leave_types_config CASCADE;
*/

-- ============================================================
-- 1. TITLES (Danh hiệu hệ thống)
-- ============================================================
INSERT INTO titles (id, name, description) VALUES
  (gen_random_uuid(), 'Gà con chăm chỉ', 'Luôn đúng giờ, không bao giờ đi trễ'),
  (gen_random_uuid(), 'Vua đi trễ', 'Chuyên gia đi trễ — đóng góp quỹ nhiều nhất'),
  (gen_random_uuid(), 'Đại cổ đông quỹ tiền phạt', 'Nộp phạt nhiều nhất công ty'),
  (gen_random_uuid(), 'Thánh nghỉ phép', 'Nghỉ phép nhiều nhất năm'),
  (gen_random_uuid(), 'Cáo già công sở', 'Xin nghỉ khéo léo, lý do luôn thuyết phục'),
  (gen_random_uuid(), 'Ngước nhìn đồng hồ', 'Luôn check-in sát giờ deadline'),
  (gen_random_uuid(), 'Vua tablet', 'Thích check-in bằng QR/OTP hơn GPS')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. USERS (Nhân viên + Quản lý + Kế toán + HR + Admin)
-- ============================================================
-- Staff
INSERT INTO users (id, email, password_hash, full_name, nickname, title_id, role, grade, joined_date, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'nguyen.van.a@company.com', '$2a$10$hashed', 'Nguyễn Văn A', 'A Nguyễn', (SELECT id FROM titles WHERE name = 'Gà con chăm chỉ'), 'staff', 'JUNIOR', '2024-03-15', true),
  ('a0000000-0000-0000-0000-000000000002', 'tran.thi.b@company.com', '$2a$10$hashed', 'Trần Thị B', 'B Trần', (SELECT id FROM titles WHERE name = 'Vua đi trễ'), 'staff', 'SENIOR', '2023-01-10', true),
  ('a0000000-0000-0000-0000-000000000003', 'le.van.c@company.com', '$2a$10$hashed', 'Lê Văn C', 'C Lê', (SELECT id FROM titles WHERE name = 'Đại cổ đông quỹ tiền phạt'), 'staff', 'JUNIOR', '2024-06-01', true),
  ('a0000000-0000-0000-0000-000000000004', 'pham.thi.d@company.com', '$2a$10$hashed', 'Phạm Thị D', 'D Phạm', (SELECT id FROM titles WHERE name = 'Thánh nghỉ phép'), 'staff', 'SENIOR', '2022-08-20', true),
  ('a0000000-0000-0000-0000-000000000005', 'hoang.van.e@company.com', '$2a$10$hashed', 'Hoàng Văn E', 'E Hoàng', (SELECT id FROM titles WHERE name = 'Cáo già công sở'), 'staff', 'INTERN', '2026-01-05', true),
  ('a0000000-0000-0000-0000-000000000006', 'vu.thi.f@company.com', '$2a$10$hashed', 'Vũ Thị F', 'F Vũ', (SELECT id FROM titles WHERE name = 'Ngước nhìn đồng hồ'), 'staff', 'JUNIOR', '2024-09-12', true),
  ('a0000000-0000-0000-0000-000000000007', 'do.van.g@company.com', '$2a$10$hashed', 'Đỗ Văn G', 'G Đỗ', (SELECT id FROM titles WHERE name = 'Vua tablet'), 'staff', 'JUNIOR', '2025-02-28', true)
ON CONFLICT (id) DO NOTHING;

-- Managers
INSERT INTO users (id, email, password_hash, full_name, nickname, role, grade, joined_date, is_active) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'manager.hn@company.com', '$2a$10$hashed', 'Nguyễn Văn Hùng', 'Hùng Manager', 'manager', 'MANAGER', '2020-05-01', true),
  ('b0000000-0000-0000-0000-000000000002', 'manager.hcm@company.com', '$2a$10$hashed', 'Trần Thị Lan', 'Lan Manager', 'manager', 'MANAGER', '2021-03-15', true)
ON CONFLICT (id) DO NOTHING;

-- Accountant
INSERT INTO users (id, email, password_hash, full_name, nickname, role, grade, joined_date, is_active) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'accountant@company.com', '$2a$10$hashed', 'Lê Thị Mai', 'Mai Kế toán', 'accountant', 'SENIOR', '2019-11-20', true)
ON CONFLICT (id) DO NOTHING;

-- HR
INSERT INTO users (id, email, password_hash, full_name, nickname, role, grade, joined_date, is_active) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'hr@company.com', '$2a$10$hashed', 'Phạm Văn Nam', 'Nam HR', 'hr', 'SENIOR', '2020-01-10', true)
ON CONFLICT (id) DO NOTHING;

-- Admin
INSERT INTO users (id, email, password_hash, full_name, nickname, role, grade, joined_date, is_active) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'admin@company.com', '$2a$10$hashed', 'Hoàng Thị Oanh', 'Oanh Admin', 'admin', 'DIRECTOR', '2018-06-01', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. USER_ROLES (Multi-role mapping)
-- ============================================================
INSERT INTO user_roles (id, user_id, role, assigned_by) VALUES
  (gen_random_uuid(), 'b0000000-0000-0000-0000-000000000001', 'manager', 'e0000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'b0000000-0000-0000-0000-000000000002', 'manager', 'e0000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000001', 'accountant', 'e0000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000001', 'hr', 'e0000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'e0000000-0000-0000-0000-000000000001', 'admin', 'e0000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. OFFICE_LOCATIONS
-- ============================================================
INSERT INTO office_locations (id, name, latitude, longitude, radius_meters, is_active) VALUES
  (gen_random_uuid(), 'Văn phòng Hà Nội — Tòa nhà A', 21.028511, 105.854244, 100, true),
  (gen_random_uuid(), 'Văn phòng HCM — Quận 1', 10.772461, 106.698017, 100, true),
  (gen_random_uuid(), 'Văn phòng Đà Nẵng — Hải Châu', 16.047079, 108.206230, 80, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. SETTINGS (Hệ thống)
-- ============================================================
INSERT INTO settings (id, key, value, updated_by) VALUES
  (gen_random_uuid(), 'checkin_deadline', '09:35', 'e0000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'auto_absent_at', '10:05', 'e0000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'tablet_start', '09:00', 'e0000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'tablet_end', '09:45:59', 'e0000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'app_version', '1.0.0', 'e0000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'min_client_version', '1.0.0', 'e0000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'withdraw_threshold', '1000000', 'e0000000-0000-0000-0000-000000000001')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- ============================================================
-- 6. LATE_TIERS (Phạt đi trễ động)
-- ============================================================
INSERT INTO late_tiers (id, name, delay_minutes, fine_amount, is_active) VALUES
  (gen_random_uuid(), 'Muộn nhẹ', 10, 10000, true),
  (gen_random_uuid(), 'Muộn nặng', 30, 20000, true),
  (gen_random_uuid(), 'Siêu muộn', 60, 50000, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 7. FRAUD_RULES (Phạt gian lận)
-- ============================================================
INSERT INTO fraud_rules (id, target, fine_amount, is_active) VALUES
  (gen_random_uuid(), 'FRAUD_REQUESTER', 100000, true),
  (gen_random_uuid(), 'FRAUD_ASSISTANT', 50000, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 8. PAYMENT_SETTINGS (Cấu hình thanh toán)
-- ============================================================
INSERT INTO payment_settings (id, branch_code, account_number, bank_code, account_holder, company_name, sepay_prefix, va_code, qr_template, show_info, is_active) VALUES
  (gen_random_uuid(), 'HN', '101010101010', 'ICB', 'CONG TY TNHH ABC', 'ABC Corporation', 'SEVQR', 'HN', 'compact', true, true),
  (gen_random_uuid(), 'HCM', '202020202020', 'ICB', 'CONG TY TNHH ABC', 'ABC Corporation', 'SEVQR', 'HCM', 'compact', true, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 9. CHECKINS (Bản ghi check-in — đa dạng scenario)
-- ============================================================
INSERT INTO checkins (id, user_id, method, status, latitude, longitude, accuracy_meters, distance_meters, device_fingerprint, created_at) VALUES
  -- VALID GPS check-ins
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'GPS', 'VALID', 21.028511, 105.854244, 5.2, 12.5, 'fp_nguyenvana_iphone', '2026-08-25 09:15:00+07'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000002', 'GPS', 'VALID', 21.028600, 105.854300, 8.0, 45.0, 'fp_tranthib_samsung', '2026-08-25 09:32:00+07'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000003', 'GPS', 'VALID', 10.772461, 106.698017, 3.5, 8.0, 'fp_levanc_xiaomi', '2026-08-25 09:10:00+07'),

  -- LATE check-in → tạo penalty
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000004', 'GPS', 'VALID', 21.028511, 105.854244, 6.0, 15.0, 'fp_phamthid_iphone', '2026-08-25 09:42:00+07'),

  -- TABLET QR check-in
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000005', 'TABLET_QR', 'VALID', NULL, NULL, NULL, NULL, NULL, '2026-08-25 09:08:00+07'),

  -- TABLET OTP check-in
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000006', 'TABLET_OTP', 'VALID', NULL, NULL, NULL, NULL, NULL, '2026-08-25 09:20:00+07'),

  -- PENDING_REVIEW (anomaly detected)
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000007', 'GPS', 'PENDING_REVIEW', 21.028511, 105.854244, 0.0, 12.0, 'fp_dovang_iphone', '2026-08-25 09:05:00+07'),

  -- AUTO_ABSENT
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'GPS', 'AUTO_ABSENT', NULL, NULL, NULL, NULL, NULL, '2026-08-24 10:05:00+07'),

  -- MANUAL (manager nhập giờ có mặt)
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000002', 'MANUAL', 'VALID', NULL, NULL, NULL, NULL, NULL, '2026-08-23 09:40:00+07');

-- ============================================================
-- 10. TABLET_TOKENS
-- ============================================================
INSERT INTO tablet_tokens (id, tablet_id, qr_token, otp_code, used, expires_at, created_at) VALUES
  (gen_random_uuid(), 'TBL-HN-01', 'qr_token_hn_001', '123456', false, NOW() + INTERVAL '1 hour', NOW()),
  (gen_random_uuid(), 'TBL-HCM-01', 'qr_token_hcm_001', '654321', true, NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '30 minutes'),
  (gen_random_uuid(), 'TBL-HN-02', 'qr_token_hn_002', '789012', false, NOW() + INTERVAL '1 hour', NOW());

-- ============================================================
-- 11. PENALTY_TICKETS (Phiếu phạt — đủ trạng thái)
-- ============================================================
INSERT INTO penalty_tickets (id, user_id, transaction_id, amount, status, type, reason, sepay_content, paid_at, waived_at, waived_reason, branch_code, created_at) VALUES
  -- UNPAID
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000002', 'TX000001', 10000, 'UNPAID', 'LATE_CHECKIN', 'Đi trễ 15 phút', NULL, NULL, NULL, NULL, 'HN', '2026-08-25 09:35:00+07'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000004', 'TX000002', 20000, 'UNPAID', 'LATE_CHECKIN', 'Đi trễ 30 phút', NULL, NULL, NULL, NULL, 'HN', '2026-08-25 09:42:00+07'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000003', 'TX000003', 50000, 'UNPAID', 'FRAUD', 'Nghi ngờ điểm danh hộ', NULL, NULL, NULL, NULL, 'HCM', '2026-08-25 09:10:00+07'),

  -- PAID (qua Sepay)
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'TX000004', 10000, 'PAID', 'LATE_CHECKIN', 'Đi trễ 10 phút hôm qua', 'SEVQR TKPHN TX000004 NGUYEN VAN A', '2026-08-24 14:30:00+07', NULL, NULL, 'HN', '2026-08-24 09:40:00+07'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000006', 'TX000005', 20000, 'PAID', 'LATE_CHECKIN', 'Đi trễ buổi sáng', 'SEVQR TKPHN TX000005 VU THI F', '2026-08-24 10:15:00+07', NULL, NULL, 'HN', '2026-08-24 09:50:00+07'),

  -- WAIVED
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000005', 'TX000006', 10000, 'WAIVED', 'LATE_CHECKIN', 'Đi trễ do kẹt xe cầu vượt', NULL, NULL, '2026-08-24 16:00:00+07', 'Nhân viên đi công tác có giấy xác nhận từ đối tác', 'HN', '2026-08-24 09:38:00+07'),

  -- CASH_PAID
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000007', 'TX000007', 20000, 'CASH_PAID', 'LATE_CHECKIN', 'Đi trễ do mưa lớn', NULL, '2026-08-23 17:00:00+07', NULL, NULL, 'HN', '2026-08-23 09:45:00+07');

-- ============================================================
-- 12. FUND_TRANSACTIONS (Giao dịch quỹ)
-- ============================================================
INSERT INTO fund_transactions (id, type, source, amount, ticket_id, branch, description, reference_code, collector_name, created_by, created_at) VALUES
  -- INCOME from Sepay
  (gen_random_uuid(), 'INCOME', 'PENALTY', 10000, (SELECT id FROM penalty_tickets WHERE transaction_id = 'TX000004'), 'HN', 'SEVQR TKPHN TX000004 NGUYEN VAN A', 'SEPAY_REF_001', NULL, NULL, '2026-08-24 14:30:00+07'),
  (gen_random_uuid(), 'INCOME', 'PENALTY', 20000, (SELECT id FROM penalty_tickets WHERE transaction_id = 'TX000005'), 'HN', 'SEVQR TKPHN TX000005 VU THI F', 'SEPAY_REF_002', NULL, NULL, '2026-08-24 10:15:00+07'),

  -- INCOME from cash
  (gen_random_uuid(), 'INCOME', 'PENALTY_CASH', 20000, (SELECT id FROM penalty_tickets WHERE transaction_id = 'TX000007'), 'HN', 'Thu tiền mặt phiếu phạt TX000007', NULL, 'Nguyễn Văn Hùng', 'b0000000-0000-0000-0000-000000000001', '2026-08-23 17:00:00+07'),

  -- MANUAL_DEPOSIT
  (gen_random_uuid(), 'INCOME', 'MANUAL_DEPOSIT', 500000, NULL, 'HN', 'Nộp tiền mặt cuối tháng tháng 8', 'DEPOSIT_001', NULL, 'c0000000-0000-0000-0000-000000000001', '2026-08-20 09:00:00+07'),

  -- EXPENSE withdraw
  (gen_random_uuid(), 'EXPENSE', 'WITHDRAW', 200000, NULL, 'HN', 'Mua văn phòng phẩm tháng 8', 'WITHDRAW_001', NULL, 'b0000000-0000-0000-0000-000000000001', '2026-08-22 10:00:00+07'),

  -- REFUND
  (gen_random_uuid(), 'EXPENSE', 'REFUND', 15000, NULL, 'HN', 'Hoàn tiền chuyển thừa cho nhân viên', 'REFUND_001', NULL, 'c0000000-0000-0000-0000-000000000001', '2026-08-21 14:00:00+07');

-- ============================================================
-- 13. UNMATCHED_TRANSACTIONS (Giao dịch lạc)
-- ============================================================
INSERT INTO unmatched_transactions (id, sepay_id, content, amount, expected_amount, received_amount, reason, received_at, resolved, created_at) VALUES
  (gen_random_uuid(), 'SEPAY_999001', 'CHUYEN TIEN SEVQR', 20000, NULL, NULL, 'NO_TRANSACTION_ID', '2026-08-25 09:30:00+07', false, NOW()),
  (gen_random_uuid(), 'SEPAY_999002', 'SEVQR TKPHN ZZZZZZZZ NGUYEN VAN X', 20000, NULL, NULL, 'TICKET_NOT_FOUND', '2026-08-25 09:35:00+07', false, NOW()),
  (gen_random_uuid(), 'SEPAY_999003', 'SEVQR TKPHN TX000001 NGUYEN VAN A', 15000, 20000, 15000, 'AMOUNT_MISMATCH', '2026-08-25 09:40:00+07', false, NOW());

-- ============================================================
-- 14. AUDIT_LOGS
-- ============================================================
INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, old_value, new_value, reason, ip_address, created_at) VALUES
  (gen_random_uuid(), 'b0000000-0000-0000-0000-000000000001', 'WAIVE_PENALTY', 'PENALTY_TICKET', (SELECT id FROM penalty_tickets WHERE transaction_id = 'TX000006'), '{"status":"UNPAID"}'::jsonb, '{"status":"WAIVED"}'::jsonb, 'Nhân viên đi công tác có giấy xác nhận từ đối tác', '192.168.1.10'::inet, '2026-08-24 16:00:00+07'),
  (gen_random_uuid(), 'b0000000-0000-0000-0000-000000000001', 'CASH_PAYMENT', 'PENALTY_TICKET', (SELECT id FROM penalty_tickets WHERE transaction_id = 'TX000007'), '{"status":"UNPAID"}'::jsonb, '{"status":"CASH_PAID","collector":"Nguyễn Văn Hùng"}'::jsonb, 'Thu tiền mặt tại quỹ', '192.168.1.10'::inet, '2026-08-23 17:00:00+07'),
  (gen_random_uuid(), 'e0000000-0000-0000-0000-000000000001', 'UPDATE_CONFIG', 'CONFIG', (SELECT id FROM settings WHERE key = 'checkin_deadline'), '{"value":"09:30"}'::jsonb, '{"value":"09:35"}'::jsonb, 'Thay đổi giờ check-in theo yêu cầu ban lãnh đạo', '192.168.1.1'::inet, '2026-08-20 08:00:00+07');

-- ============================================================
-- 15. EVENT_TIMELINES
-- ============================================================
INSERT INTO event_timelines (id, entity_type, entity_id, event, actor_id, metadata, created_at) VALUES
  (gen_random_uuid(), 'CHECKIN', (SELECT id FROM checkins WHERE user_id = 'a0000000-0000-0000-0000-000000000001' LIMIT 1), 'GPS_ATTEMPT', 'a0000000-0000-0000-0000-000000000001', '{"lat":21.028511,"lng":105.854244,"accuracy":5.2}'::jsonb, '2026-08-25 09:14:55+07'),
  (gen_random_uuid(), 'CHECKIN', (SELECT id FROM checkins WHERE user_id = 'a0000000-0000-0000-0000-000000000001' LIMIT 1), 'VALIDATED', 'a0000000-0000-0000-0000-000000000001', '{"method":"GPS","distance":12.5}'::jsonb, '2026-08-25 09:15:00+07'),
  (gen_random_uuid(), 'PENALTY_TICKET', (SELECT id FROM penalty_tickets WHERE transaction_id = 'TX000004'), 'PENALTY_CREATED', NULL, '{"type":"LATE_CHECKIN","amount":10000}'::jsonb, '2026-08-24 09:40:00+07'),
  (gen_random_uuid(), 'PENALTY_TICKET', (SELECT id FROM penalty_tickets WHERE transaction_id = 'TX000004'), 'PAYMENT_QR_GENERATED', 'a0000000-0000-0000-0000-000000000001', '{"tx_id":"TX000004"}'::jsonb, '2026-08-24 12:00:00+07'),
  (gen_random_uuid(), 'PENALTY_TICKET', (SELECT id FROM penalty_tickets WHERE transaction_id = 'TX000004'), 'PENALTY_PAID', NULL, '{"method":"SEPAY","sepay_id":"SEPAY_REF_001"}'::jsonb, '2026-08-24 14:30:00+07');

-- ============================================================
-- 16. SYSTEM_LOGS
-- ============================================================
INSERT INTO system_logs (id, level, category, message, metadata, user_id, ip_address, created_at) VALUES
  (gen_random_uuid(), 'INFO', 'API', 'GET /api/checkin success', '{"path":"/api/checkin","status":200,"duration":120}'::jsonb, 'a0000000-0000-0000-0000-000000000001', '192.168.1.100'::inet, '2026-08-25 09:15:00+07'),
  (gen_random_uuid(), 'INFO', 'WEBHOOK', 'Sepay webhook received', '{"sepay_id":"SEPAY_REF_001","amount":10000}'::jsonb, NULL, '203.0.113.45'::inet, '2026-08-24 14:30:00+07'),
  (gen_random_uuid(), 'WARN', 'GPS', 'Accuracy > 100m detected', '{"accuracy":150,"user_id":"a0000000-0000-0000-0000-000000000002"}'::jsonb, 'a0000000-0000-0000-0000-000000000002', '192.168.1.101'::inet, '2026-08-25 09:32:00+07'),
  (gen_random_uuid(), 'ERROR', 'WEBHOOK', 'Sepay webhook HMAC verification failed', '{"signature":"invalid","timestamp":1724550000}'::jsonb, NULL, '198.51.100.22'::inet, '2026-08-25 08:00:00+07');

-- ============================================================
-- 17. CLIENT_LOGS
-- ============================================================
INSERT INTO client_logs (id, user_id, category, event, message, metadata, created_at) VALUES
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'GPS', 'timeout', 'GPS lấy vị trí quá 10 giây', '{"timeout":10000,"retry":2}'::jsonb, '2026-08-25 09:14:50+07'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000003', 'CAMERA', 'denied', 'User từ chối quyền camera khi chụp selfie', '{}'::jsonb, '2026-08-25 09:10:05+07'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000002', 'NETWORK', 'failed', 'Không thể đồng bộ check-in khi offline', '{"retry_count":3}'::jsonb, '2026-08-25 09:35:00+07');

-- ============================================================
-- 18. LEAVE_TYPES_CONFIG (đã có trong schema, đảm bảo đủ 6 loại)
-- ============================================================
-- Schema đã seed sẵn, nhưng đảm bảo đủ data:
INSERT INTO leave_types_config (type, name_vi, affects_checkin, requires_approval, max_days, color) VALUES
  ('FULL_DAY', 'Nghỉ cả ngày', true, true, 30, '#EF4444'),
  ('HALF_DAY_AM', 'Nghỉ buổi sáng', true, true, 1, '#F59E0B'),
  ('HALF_DAY_PM', 'Nghỉ buổi chiều', true, true, 1, '#F59E0B'),
  ('REMOTE', 'Làm việc từ xa', true, true, 5, '#10B981'),
  ('LATE_ARRIVAL', 'Xin đi trễ', true, true, 1, '#3B82F6'),
  ('EARLY_LEAVE', 'Xin về sớm', true, true, 1, '#8B5CF6')
ON CONFLICT (type) DO UPDATE SET name_vi = EXCLUDED.name_vi, color = EXCLUDED.color;

-- ============================================================
-- 19. LEAVE_QUOTAS
-- ============================================================
INSERT INTO leave_quotas (id, user_id, year, annual_quota, annual_used, remote_quota, remote_used, carry_over) VALUES
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 2026, 12, 2, 3, 1, 0),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000002', 2026, 15, 5, 5, 2, 3),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000003', 2026, 12, 0, 3, 0, 0),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000004', 2026, 15, 8, 5, 3, 2),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000005', 2026, 0, 0, 0, 0, 0),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000006', 2026, 12, 1, 3, 0, 0),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000007', 2026, 12, 0, 3, 0, 0)
ON CONFLICT (user_id, year) DO NOTHING;

-- ============================================================
-- 20. LEAVE_REQUESTS (Đa dạng trạng thái)
-- ============================================================
INSERT INTO leave_requests (id, user_id, type, status, start_date, end_date, reason, approver_id, approved_at, rejected_reason, created_at) VALUES
  -- APPROVED
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'FULL_DAY', 'APPROVED', '2026-08-28', '2026-08-28', 'Nghỉ phép gia đình có việc đột xuất', 'b0000000-0000-0000-0000-000000000001', '2026-08-25 10:00:00+07', NULL, '2026-08-24 09:00:00+07'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000002', 'REMOTE', 'APPROVED', '2026-08-26', '2026-08-26', 'Làm việc từ xa do sửa chữa nhà', 'b0000000-0000-0000-0000-000000000001', '2026-08-25 09:30:00+07', NULL, '2026-08-24 08:00:00+07'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000004', 'HALF_DAY_AM', 'APPROVED', '2026-08-27', '2026-08-27', 'Khám bệnh buổi sáng', 'b0000000-0000-0000-0000-000000000001', '2026-08-25 11:00:00+07', NULL, '2026-08-24 07:00:00+07'),

  -- PENDING
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000003', 'FULL_DAY', 'PENDING', '2026-08-29', '2026-08-29', 'Đám cưới người thân ở quê', NULL, NULL, NULL, '2026-08-25 08:30:00+07'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000006', 'LATE_ARRIVAL', 'PENDING', '2026-08-26', '2026-08-26', 'Xin đi trễ 30 phút do kẹt xe cầu vượt Thanh Trì', NULL, NULL, NULL, '2026-08-25 07:45:00+07'),

  -- REJECTED
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000005', 'FULL_DAY', 'REJECTED', '2026-08-26', '2026-08-26', 'Nghỉ đi du lịch', 'b0000000-0000-0000-0000-000000000001', NULL, 'Dự án đang gấp deadline, không cho phép nghỉ trong tuần này', '2026-08-24 16:00:00+07'),

  -- DRAFT
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000007', 'EARLY_LEAVE', 'DRAFT', '2026-08-26', '2026-08-26', 'Xin về sớm đón con', NULL, NULL, NULL, '2026-08-25 09:00:00+07'),

  -- CANCELLED
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'FULL_DAY', 'CANCELLED', '2026-09-01', '2026-09-01', 'Nghỉ đi chơi', NULL, NULL, NULL, '2026-08-20 10:00:00+07');

-- ============================================================
-- 21. LEAVE_REQUEST_COMMENTS
-- ============================================================
INSERT INTO leave_request_comments (id, leave_request_id, user_id, content, created_at)
SELECT 
  gen_random_uuid(),
  lr.id,
  CASE WHEN lr.status = 'APPROVED' THEN lr.approver_id ELSE lr.user_id END,
  CASE 
    WHEN lr.status = 'APPROVED' THEN 'Đã duyệt, nhớ bàn giao công việc trước khi nghỉ'
    WHEN lr.status = 'REJECTED' THEN 'Vui lòng xin nghỉ vào tuần sau khi dự án xong'
    ELSE 'Em đã bàn giao công việc cho chị B'
  END,
  NOW()
FROM leave_requests lr
WHERE lr.status IN ('APPROVED', 'REJECTED', 'PENDING')
LIMIT 3;

-- ============================================================
-- 22. WITHDRAW_REQUESTS
-- ============================================================
INSERT INTO withdraw_requests (id, requester_id, amount, reason, attachment_url, status, threshold_amount, approver_1_id, approver_1_at, approver_2_id, approver_2_at, completed_at, created_at) VALUES
  -- COMPLETED (under threshold)
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000001', 500000, 'Mua văn phòng phẩm tháng 8', 'https://storage.supabase.co/invoices/inv_001.jpg', 'COMPLETED', 1000000, 'b0000000-0000-0000-0000-000000000001', '2026-08-22 10:30:00+07', NULL, NULL, '2026-08-22 10:30:00+07', '2026-08-22 09:00:00+07'),

  -- COMPLETED (over threshold, 2 approvers)
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000001', 2000000, 'Mua thiết bị máy chiếu phòng họp', 'https://storage.supabase.co/invoices/inv_002.jpg', 'COMPLETED', 1000000, 'b0000000-0000-0000-0000-000000000001', '2026-08-20 09:00:00+07', 'b0000000-0000-0000-0000-000000000002', '2026-08-20 14:00:00+07', '2026-08-20 14:00:00+07', '2026-08-19 16:00:00+07'),

  -- PENDING
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000001', 1500000, 'Tổ chức tiệc sinh nhật công ty tháng 8', 'https://storage.supabase.co/invoices/inv_003.jpg', 'PENDING', 1000000, NULL, NULL, NULL, NULL, NULL, '2026-08-25 08:00:00+07'),

  -- REJECTED
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000001', 3000000, 'Mua xe đưa đón nhân viên', NULL, 'REJECTED', 1000000, NULL, NULL, NULL, NULL, NULL, '2026-08-10 09:00:00+07');

-- Update rejected_by for rejected request
UPDATE withdraw_requests SET rejected_by = 'b0000000-0000-0000-0000-000000000001', rejected_reason = 'Ngân sách quý 3 đã hết, đề xuất sang quý 4'
WHERE status = 'REJECTED';

-- ============================================================
-- 23. NOTIFICATIONS
-- ============================================================
INSERT INTO notifications (id, user_id, type, title, body, data, channel, read, sent_at, created_at) VALUES
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'PENALTY_CREATED', 'Bạn bị phạt 10,000đ', 'Đi trễ 10 phút — Phiếu TX000004', '{"ticket_id":"' || (SELECT id::text FROM penalty_tickets WHERE transaction_id = 'TX000004') || '"}'::jsonb, 'in_app', true, '2026-08-24 09:40:00+07', '2026-08-24 09:40:00+07'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'PAYMENT_SUCCESS', 'Đã thanh toán TX000004', 'Phiếu phạt 10,000đ đã được thanh toán qua Sepay', '{"ticket_id":"' || (SELECT id::text FROM penalty_tickets WHERE transaction_id = 'TX000004') || '"}'::jsonb, 'in_app', true, '2026-08-24 14:30:00+07', '2026-08-24 14:30:00+07'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000005', 'LEAVE_APPROVED', 'Đơn nghỉ đã được duyệt', 'Đơn nghỉ ngày 28/08 đã được duyệt', '{}'::jsonb, 'in_app', false, '2026-08-25 10:00:00+07', '2026-08-25 10:00:00+07'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000005', 'LEAVE_REJECTED', 'Đơn nghỉ bị từ chối', 'Đơn nghỉ ngày 26/08 bị từ chối: Dự án đang gấp deadline', '{}'::jsonb, 'in_app', false, '2026-08-24 16:00:00+07', '2026-08-24 16:00:00+07'),
  (gen_random_uuid(), 'b0000000-0000-0000-0000-000000000001', 'FUND_INCOME', '+20,000đ vào quỹ', 'Vũ Thị F thanh toán phiếu TX000005', '{"amount":20000}'::jsonb, 'in_app', false, '2026-08-24 10:15:00+07', '2026-08-24 10:15:00+07'),
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000001', 'WITHDRAW_APPROVED', 'Yêu cầu rút 2 triệu đã được duyệt', 'Mua thiết bị máy chiếu phòng họp', '{}'::jsonb, 'in_app', true, '2026-08-20 14:00:00+07', '2026-08-20 14:00:00+07');

-- ============================================================
-- 24. USER_PREFERENCES
-- ============================================================
INSERT INTO user_preferences (id, user_id, theme, language, sound_enabled, push_enabled, email_enabled) VALUES
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'dark', 'vi', true, true, true),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000002', 'light', 'vi', true, true, false),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000003', 'system', 'vi', false, true, true),
  (gen_random_uuid(), 'b0000000-0000-0000-0000-000000000001', 'dark', 'vi', true, true, true),
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000001', 'light', 'vi', true, true, true)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- 25. USER_PUSH_TOKENS
-- ============================================================
INSERT INTO user_push_tokens (id, user_id, fcm_token, platform) VALUES
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'fcm_token_nguyenvana_web', 'web'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'fcm_token_nguyenvana_ios', 'ios'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000002', 'fcm_token_tranthib_android', 'android'),
  (gen_random_uuid(), 'b0000000-0000-0000-0000-000000000001', 'fcm_token_hungmanager_web', 'web')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 26. LOGIN_ATTEMPTS
-- ============================================================
INSERT INTO login_attempts (id, email, ip_address, success, created_at) VALUES
  (gen_random_uuid(), 'nguyen.van.a@company.com', '192.168.1.100'::inet, true, '2026-08-25 09:00:00+07'),
  (gen_random_uuid(), 'nguyen.van.a@company.com', '192.168.1.100'::inet, true, '2026-08-25 09:15:00+07'),
  (gen_random_uuid(), 'tran.thi.b@company.com', '192.168.1.101'::inet, false, '2026-08-25 08:55:00+07'),
  (gen_random_uuid(), 'tran.thi.b@company.com', '192.168.1.101'::inet, false, '2026-08-25 08:56:00+07'),
  (gen_random_uuid(), 'tran.thi.b@company.com', '192.168.1.101'::inet, true, '2026-08-25 08:57:00+07'),
  (gen_random_uuid(), 'hacker@evil.com', '203.0.113.99'::inet, false, '2026-08-25 03:00:00+07'),
  (gen_random_uuid(), 'hacker@evil.com', '203.0.113.99'::inet, false, '2026-08-25 03:01:00+07'),
  (gen_random_uuid(), 'hacker@evil.com', '203.0.113.99'::inet, false, '2026-08-25 03:02:00+07');

-- ============================================================
-- 27. SEPAY_WEBHOOK_LOGS
-- ============================================================
INSERT INTO sepay_webhook_logs (id, sepay_id, ticket_id, payload, processed_at) VALUES
  (gen_random_uuid(), 'SEPAY_REF_001', (SELECT id FROM penalty_tickets WHERE transaction_id = 'TX000004'), '{"id":12345,"gateway":"VietinBank","transferAmount":10000,"content":"SEVQR TKPHN TX000004 NGUYEN VAN A"}'::jsonb, '2026-08-24 14:30:00+07'),
  (gen_random_uuid(), 'SEPAY_REF_002', (SELECT id FROM penalty_tickets WHERE transaction_id = 'TX000005'), '{"id":12346,"gateway":"VietinBank","transferAmount":20000,"content":"SEVQR TKPHN TX000005 VU THI F"}'::jsonb, '2026-08-24 10:15:00+07');

-- ============================================================
-- 28. PENALTIES (Legacy Phase 1 — giữ để test backward compat)
-- ============================================================
INSERT INTO penalties (id, user_id, checkin_id, type, amount, status, created_at)
SELECT 
  gen_random_uuid(),
  c.user_id,
  c.id,
  'LATE',
  10000,
  'PAID',
  c.created_at
FROM checkins c
WHERE c.status = 'VALID' AND c.created_at < '2026-08-25'
LIMIT 2;

\echo '✅ Seed data inserted successfully!'
\echo 'Summary:'
\echo '  • 12 users (7 staff + 2 manager + 1 accountant + 1 hr + 1 admin)'
\echo '  • 3 office locations (HN / HCM / DN)'
\echo '  • 9 checkins (VALID / PENDING_REVIEW / AUTO_ABSENT / MANUAL)'
\echo '  • 7 penalty tickets (UNPAID / PAID / WAIVED / CASH_PAID)'
\echo '  • 6 fund transactions (INCOME / EXPENSE)'
\echo '  • 3 unmatched transactions'
\echo '  • 8 leave requests (APPROVED / PENDING / REJECTED / DRAFT / CANCELLED)'
\echo '  • 4 withdraw requests (COMPLETED / PENDING / REJECTED)'
\echo '  • 6 notifications'
\echo '  • 8 login attempts (cả brute force)'
\echo '  • Full audit logs, event timelines, system/client logs'
