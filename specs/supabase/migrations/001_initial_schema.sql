-- ============================================================
-- Migration: 001_initial_schema.sql
-- PWA Check-in GPS — Full Database Schema (Phase 1-5)
-- Techstack: Supabase PostgreSQL 15+
--
-- Conflict-resolution pass (2026-08-26, pre-application baseline):
--   * Removed legacy `penalties` table — canonical storage: `penalty_tickets`
--   * leave_quotas counters NUMERIC(5,1) for HALF_DAY (0.5 ngày) accuracy
--   * Business RPCs: SECURITY DEFINER + SET search_path + internal role guards
--   * Unique one-check-in-per-day index via vn_date() (Asia/Ho_Chi_Minh)
--
-- WRITE MODEL: sensitive writes go through guarded SECURITY DEFINER RPCs
--   or service_role (webhook/cron). Direct client INSERT/UPDATE on
--   money/audit tables is intentionally DENIED by RLS (no policy).
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- PHASE 1: Core Check-in
-- ============================================================

-- 1.1 Titles (Danh hiệu)
CREATE TABLE IF NOT EXISTS titles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.2 Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    google_id VARCHAR(255),
    full_name VARCHAR(100) NOT NULL,
    nickname VARCHAR(100) DEFAULT full_name,
    avatar_url TEXT,
    title_id UUID REFERENCES titles(id),
    role VARCHAR(20) DEFAULT 'staff' CHECK (role IN ('staff', 'manager', 'accountant', 'hr', 'admin')),
    grade VARCHAR(20) DEFAULT 'JUNIOR' CHECK (grade IN ('INTERN', 'JUNIOR', 'SENIOR', 'MANAGER', 'DIRECTOR')),
    joined_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.3 Office Locations
CREATE TABLE IF NOT EXISTS office_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    radius_meters INT NOT NULL DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.4 Checkins
CREATE TABLE IF NOT EXISTS checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    method VARCHAR(20) CHECK (method IN ('GPS', 'TABLET_QR', 'TABLET_OTP', 'MANUAL')),
    status VARCHAR(20) DEFAULT 'VALID' CHECK (status IN ('VALID', 'PENDING_REVIEW', 'REJECTED', 'AUTO_ABSENT')),
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    accuracy_meters DECIMAL(8,2),
    distance_meters DECIMAL(8,2),
    tablet_id VARCHAR(50),
    device_fingerprint VARCHAR(64),
    flag_reason TEXT,
    selfie_url TEXT,
    no_camera_reason TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    actual_arrival_time TIME,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.5 Tablet Tokens
CREATE TABLE IF NOT EXISTS tablet_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tablet_id VARCHAR(50) NOT NULL,
    qr_token VARCHAR(64) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    used BOOLEAN DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.6 Late Tiers (Phạt đi trễ)
CREATE TABLE IF NOT EXISTS late_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    delay_minutes INT NOT NULL,
    fine_amount INT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.7 Fraud Rules
CREATE TABLE IF NOT EXISTS fraud_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target VARCHAR(50) CHECK (target IN ('FRAUD_REQUESTER', 'FRAUD_ASSISTANT')),
    fine_amount INT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.8 [REMOVED 26/08/2026] Legacy `penalties` table đã xóa khỏi schema.
--     Mọi loại phạt (LATE / FRAUD / ABSENT / MANUAL) ghi vào `penalty_tickets`
--     (mục 2.2). Lý do & decision log: specs/docs/open-questions.md

-- 1.9 Settings
CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) NOT NULL UNIQUE,
    value VARCHAR(255) NOT NULL,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PHASE 2: Payment & Fund
-- ============================================================

-- 2.1 Payment Settings
CREATE TABLE IF NOT EXISTS payment_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_code VARCHAR(10) UNIQUE,
    account_number VARCHAR(50) NOT NULL,
    bank_code VARCHAR(20) NOT NULL,
    account_holder VARCHAR(100) NOT NULL,
    company_name VARCHAR(100) NOT NULL,
    sepay_prefix VARCHAR(20) NOT NULL DEFAULT 'SEVQR',
    va_code VARCHAR(10),
    qr_template VARCHAR(20) DEFAULT 'compact' CHECK (qr_template IN ('compact', 'qronly', 'standee')),
    show_info BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2 Penalty Tickets (mở rộng từ Phase 1)
CREATE TABLE IF NOT EXISTS penalty_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    transaction_id VARCHAR(20) UNIQUE NOT NULL,
    amount BIGINT NOT NULL,
    status VARCHAR(20) DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'PAID', 'WAIVED', 'CASH_PAID')),
    type VARCHAR(50) NOT NULL CHECK (type IN ('LATE_CHECKIN', 'EARLY_LEAVE', 'FRAUD', 'ABSENT', 'MANUAL')),
    reason TEXT,
    sepay_content TEXT,
    paid_at TIMESTAMPTZ,
    waived_at TIMESTAMPTZ,
    waived_reason TEXT,
    branch_code VARCHAR(10),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.3 Fund Transactions
CREATE TABLE IF NOT EXISTS fund_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
    source VARCHAR(50) NOT NULL CHECK (source IN ('PENALTY', 'PENALTY_CASH', 'MANUAL_DEPOSIT', 'WITHDRAW', 'REFUND', 'MATCH_ADJUST')),
    amount BIGINT NOT NULL,
    ticket_id UUID REFERENCES penalty_tickets(id),
    unmatched_id UUID,
    withdraw_request_id UUID,
    branch VARCHAR(10),
    description TEXT NOT NULL,
    reference_code VARCHAR(100),
    collector_name VARCHAR(100),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.4 Sepay Webhook Logs (Dedup)
CREATE TABLE IF NOT EXISTS sepay_webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sepay_id VARCHAR(50) UNIQUE NOT NULL,
    ticket_id UUID REFERENCES penalty_tickets(id),
    payload JSONB NOT NULL DEFAULT '{}',
    processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.5 Unmatched Transactions
CREATE TABLE IF NOT EXISTS unmatched_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sepay_id VARCHAR(50) NOT NULL,
    ticket_id UUID REFERENCES penalty_tickets(id),
    transaction_id VARCHAR(20),
    content TEXT,
    amount BIGINT,
    expected_amount BIGINT,
    received_amount BIGINT,
    reason VARCHAR(50) CHECK (reason IN ('NO_TRANSACTION_ID', 'TICKET_NOT_FOUND', 'AMOUNT_MISMATCH', 'TICKET_ALREADY_PAID')),
    received_at TIMESTAMPTZ,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id),
    resolution_action VARCHAR(30) CHECK (resolution_action IN ('MATCH_MANUAL', 'REFUND', 'IGNORE')),
    resolution_note TEXT,
    refund_transaction_id UUID REFERENCES fund_transactions(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.6 Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id UUID NOT NULL,
    old_value JSONB,
    new_value JSONB,
    reason TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.7 Event Timelines (Business Travel Time)
CREATE TABLE IF NOT EXISTS event_timelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('CHECKIN', 'PENALTY_TICKET', 'LEAVE_REQUEST', 'WITHDRAW_REQUEST')),
    entity_id UUID NOT NULL,
    event VARCHAR(50) NOT NULL,
    actor_id UUID REFERENCES users(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.8 System Logs
CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level VARCHAR(10) CHECK (level IN ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL')),
    category VARCHAR(50) CHECK (category IN ('API', 'WEBHOOK', 'GPS', 'SYNC', 'DB', 'AUTH')),
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    user_id UUID REFERENCES users(id),
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.9 Client Logs
CREATE TABLE IF NOT EXISTS client_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    category VARCHAR(50) CHECK (category IN ('GPS', 'CAMERA', 'NETWORK', 'SYNC', 'UI', 'CRASH')),
    event VARCHAR(50) NOT NULL,
    message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PHASE 3: Leave Management
-- ============================================================

-- 3.1 Leave Types Config
CREATE TABLE IF NOT EXISTS leave_types_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(30) UNIQUE NOT NULL CHECK (type IN ('FULL_DAY', 'HALF_DAY_AM', 'HALF_DAY_PM', 'REMOTE', 'LATE_ARRIVAL', 'EARLY_LEAVE')),
    name_vi VARCHAR(100) NOT NULL,
    affects_checkin BOOLEAN DEFAULT true,
    requires_approval BOOLEAN DEFAULT true,
    max_days INT,
    color VARCHAR(7) DEFAULT '#4F46E5',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.2 Leave Quotas
CREATE TABLE IF NOT EXISTS leave_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    year INT NOT NULL,
    annual_quota INT DEFAULT 12,
    annual_used NUMERIC(5,1) DEFAULT 0,
    annual_remaining NUMERIC(5,1) GENERATED ALWAYS AS (annual_quota + carry_over - annual_used) STORED,
    remote_quota INT DEFAULT 3,
    remote_used NUMERIC(5,1) DEFAULT 0,
    carry_over INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, year)
);

-- 3.3 Leave Requests
CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    type VARCHAR(30) NOT NULL REFERENCES leave_types_config(type),
    status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REQUEST_INFO')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL,
    attachment_url TEXT,
    approver_id UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    rejected_reason TEXT,
    requested_info TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.4 Leave Request Comments
CREATE TABLE IF NOT EXISTS leave_request_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leave_request_id UUID NOT NULL REFERENCES leave_requests(id),
    user_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PHASE 4: Accounting & Fund Management
-- ============================================================

-- 4.1 Withdraw Requests
CREATE TABLE IF NOT EXISTS withdraw_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES users(id),
    amount BIGINT NOT NULL,
    reason TEXT NOT NULL,
    attachment_url TEXT,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED')),
    threshold_amount BIGINT NOT NULL DEFAULT 1000000,
    approver_1_id UUID REFERENCES users(id),
    approver_1_at TIMESTAMPTZ,
    approver_2_id UUID REFERENCES users(id),
    approver_2_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES users(id),
    rejected_reason TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.2 User Roles (Multi-role)
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    role VARCHAR(20) NOT NULL CHECK (role IN ('staff', 'manager', 'accountant', 'hr', 'admin')),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),
    UNIQUE(user_id, role)
);

-- ============================================================
-- PHASE 5: Advanced & Polish
-- ============================================================

-- 5.1 Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    channel VARCHAR(20) CHECK (channel IN ('push', 'in_app', 'email', 'all')),
    read BOOLEAN DEFAULT false,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5.2 User Preferences
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id),
    theme VARCHAR(10) DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
    language VARCHAR(10) DEFAULT 'vi',
    sound_enabled BOOLEAN DEFAULT true,
    push_enabled BOOLEAN DEFAULT true,
    email_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5.3 User Push Tokens
CREATE TABLE IF NOT EXISTS user_push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    fcm_token VARCHAR(255) NOT NULL,
    platform VARCHAR(20) CHECK (platform IN ('web', 'ios', 'android')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, fcm_token)
);

-- 5.4 Login Attempts
CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(100),
    ip_address INET,
    success BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VIEWS
-- ============================================================

-- Fund Balance Total
CREATE OR REPLACE VIEW fund_balance_total AS
SELECT 
    COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE -amount END), 0) AS total_balance,
    COUNT(*) AS total_transactions,
    COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) AS total_income,
    COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS total_expense
FROM fund_transactions;

-- Fund Balance by Branch
CREATE OR REPLACE VIEW fund_balance_by_branch AS
SELECT 
    COALESCE(branch, 'ALL') AS branch,
    COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE -amount END), 0) AS balance,
    COUNT(*) AS total_transactions,
    COALESCE(SUM(CASE WHEN type = 'INCOME' THEN 1 ELSE 0 END), 0) AS income_count,
    COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN 1 ELSE 0 END), 0) AS expense_count
FROM fund_transactions
GROUP BY branch;

-- ============================================================
-- FUNCTIONS (RPC)
-- ============================================================

-- Immutable helper: calendar date theo múi giờ công ty (Vietnam +07).
-- Dùng cho unique index "1 check-in / user / ngày" — IMMUTABLE để hợp lệ trong index.
CREATE OR REPLACE FUNCTION vn_date(ts TIMESTAMPTZ)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT (ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE;
$$;

-- Auto-update updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Process Payment (Webhook → update ticket + fund + audit)
-- KHÔNG thêm role-guard: chỉ gọi bằng service_role từ Edge Function (Sepay webhook).
CREATE OR REPLACE FUNCTION process_payment(
    p_ticket_id UUID,
    p_sepay_id VARCHAR(50),
    p_sepay_content TEXT,
    p_amount BIGINT,
    p_branch TEXT DEFAULT NULL,
    p_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE penalty_tickets
    SET status = 'PAID', paid_at = NOW(), sepay_content = p_sepay_content, updated_at = NOW()
    WHERE id = p_ticket_id AND status = 'UNPAID';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ticket not found or already paid');
    END IF;

    INSERT INTO fund_transactions (type, source, amount, ticket_id, branch, description, reference_code, created_by, created_at)
    VALUES ('INCOME', 'PENALTY', p_amount, p_ticket_id, p_branch, p_sepay_content, p_reference, NULL, NOW());

    INSERT INTO audit_logs (actor_id, action, target_type, target_id, old_value, new_value, reason, created_at)
    VALUES (NULL, 'PENALTY_PAID', 'PENALTY_TICKET', p_ticket_id,
        jsonb_build_object('status', 'UNPAID'),
        jsonb_build_object('status', 'PAID', 'sepay_id', p_sepay_id, 'amount', p_amount),
        'Auto-paid via Sepay webhook', NOW());

    INSERT INTO event_timelines (entity_type, entity_id, event, actor_id, metadata, created_at)
    VALUES ('PENALTY_TICKET', p_ticket_id, 'PENALTY_PAID', NULL, jsonb_build_object('sepay_id', p_sepay_id), NOW());

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Waive Penalty
CREATE OR REPLACE FUNCTION waive_penalty(
    p_ticket_id UUID,
    p_reason TEXT,
    p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ticket RECORD;
BEGIN
    -- Authorization: manager/admin only
    IF NOT (auth_has_role('manager') OR auth_has_role('admin')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
    END IF;

    IF LENGTH(TRIM(p_reason)) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reason must be at least 10 characters');
    END IF;

    SELECT * INTO v_ticket FROM penalty_tickets WHERE id = p_ticket_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ticket not found');
    END IF;

    IF v_ticket.status != 'UNPAID' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ticket is not UNPAID');
    END IF;

    UPDATE penalty_tickets
    SET status = 'WAIVED', waived_at = NOW(), waived_reason = TRIM(p_reason), updated_at = NOW()
    WHERE id = p_ticket_id;

    INSERT INTO audit_logs (actor_id, action, target_type, target_id, old_value, new_value, reason, created_at)
    VALUES (p_actor_id, 'WAIVE_PENALTY', 'PENALTY_TICKET', p_ticket_id,
        jsonb_build_object('status', v_ticket.status),
        jsonb_build_object('status', 'WAIVED'),
        TRIM(p_reason), NOW());

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Cash Payment
CREATE OR REPLACE FUNCTION cash_payment(
    p_ticket_id UUID,
    p_collector VARCHAR(100),
    p_note TEXT,
    p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ticket RECORD;
BEGIN
    -- Authorization: manager/admin only
    IF NOT (auth_has_role('manager') OR auth_has_role('admin')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
    END IF;

    SELECT * INTO v_ticket FROM penalty_tickets WHERE id = p_ticket_id FOR UPDATE;
    IF NOT FOUND OR v_ticket.status != 'UNPAID' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ticket not found or not UNPAID');
    END IF;

    UPDATE penalty_tickets
    SET status = 'CASH_PAID', paid_at = NOW(), updated_at = NOW()
    WHERE id = p_ticket_id;

    INSERT INTO fund_transactions (type, source, amount, ticket_id, branch, description, collector_name, created_by, created_at)
    VALUES ('INCOME', 'PENALTY_CASH', v_ticket.amount, p_ticket_id, v_ticket.branch_code,
        COALESCE(p_note, 'Thu tiền mặt phiếu phạt'), p_collector, p_actor_id, NOW());

    INSERT INTO audit_logs (actor_id, action, target_type, target_id, old_value, new_value, reason, created_at)
    VALUES (p_actor_id, 'CASH_PAYMENT', 'PENALTY_TICKET', p_ticket_id,
        jsonb_build_object('status', 'UNPAID'),
        jsonb_build_object('status', 'CASH_PAID', 'collector', p_collector),
        'Cash payment by ' || p_collector, NOW());

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Check Leave Quota
CREATE OR REPLACE FUNCTION check_leave_quota(
    p_user_id UUID,
    p_type VARCHAR(30),
    p_start_date DATE,
    p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_quota RECORD;
    v_requested_days NUMERIC;
    v_year INT;
BEGIN
    v_year := EXTRACT(YEAR FROM p_start_date);
    v_requested_days := p_end_date - p_start_date + 1;

    SELECT * INTO v_quota FROM leave_quotas WHERE user_id = p_user_id AND year = v_year;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Quota not found');
    END IF;

    IF p_type IN ('FULL_DAY', 'HALF_DAY_AM', 'HALF_DAY_PM') THEN
        IF p_type LIKE 'HALF_DAY%' THEN
            v_requested_days := 0.5;
        END IF;
        IF v_quota.annual_remaining < v_requested_days THEN
            RETURN jsonb_build_object('valid', false, 'error', 'Insufficient annual quota',
                'remaining', v_quota.annual_remaining, 'requested', v_requested_days);
        END IF;
    END IF;

    IF p_type = 'REMOTE' THEN
        IF v_quota.remote_used >= v_quota.remote_quota THEN
            RETURN jsonb_build_object('valid', false, 'error', 'Insufficient remote quota',
                'remaining', v_quota.remote_quota - v_quota.remote_used);
        END IF;
    END IF;

    RETURN jsonb_build_object('valid', true, 'remaining', v_quota.annual_remaining);
END;
$$;

-- Approve Leave
CREATE OR REPLACE FUNCTION approve_leave(
    p_request_id UUID,
    p_approver_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req RECORD;
    v_days NUMERIC;
BEGIN
    -- Authorization: manager/hr/admin
    IF NOT (auth_has_role('manager') OR auth_has_role('hr') OR auth_has_role('admin')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
    END IF;

    SELECT * INTO v_req FROM leave_requests WHERE id = p_request_id AND status = 'PENDING' FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or not pending');
    END IF;

    v_days := v_req.end_date - v_req.start_date + 1;
    IF v_req.type LIKE 'HALF_DAY%' THEN
        v_days := 0.5;
    END IF;

    UPDATE leave_requests
    SET status = 'APPROVED', approver_id = p_approver_id, approved_at = NOW(), updated_at = NOW()
    WHERE id = p_request_id;

    IF v_req.type IN ('FULL_DAY', 'HALF_DAY_AM', 'HALF_DAY_PM') THEN
        UPDATE leave_quotas SET annual_used = annual_used + v_days, updated_at = NOW()
        WHERE user_id = v_req.user_id AND year = EXTRACT(YEAR FROM v_req.start_date);
    ELSIF v_req.type = 'REMOTE' THEN
        UPDATE leave_quotas SET remote_used = remote_used + v_days, updated_at = NOW()
        WHERE user_id = v_req.user_id AND year = EXTRACT(YEAR FROM v_req.start_date);
    END IF;

    INSERT INTO audit_logs (actor_id, action, target_type, target_id, old_value, new_value, reason, created_at)
    VALUES (p_approver_id, 'APPROVE_LEAVE', 'LEAVE_REQUEST', p_request_id,
        jsonb_build_object('status', 'PENDING'),
        jsonb_build_object('status', 'APPROVED', 'approver_id', p_approver_id),
        'Approved leave request', NOW());

    INSERT INTO event_timelines (entity_type, entity_id, event, actor_id, metadata, created_at)
    VALUES ('LEAVE_REQUEST', p_request_id, 'APPROVED', p_approver_id, '{}', NOW());

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Reject Leave
CREATE OR REPLACE FUNCTION reject_leave(
    p_request_id UUID,
    p_approver_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req RECORD;
BEGIN
    -- Authorization: manager/hr/admin
    IF NOT (auth_has_role('manager') OR auth_has_role('hr') OR auth_has_role('admin')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
    END IF;

    IF LENGTH(TRIM(p_reason)) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reason must be at least 10 characters');
    END IF;

    SELECT * INTO v_req FROM leave_requests WHERE id = p_request_id AND status = 'PENDING' FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or not pending');
    END IF;

    UPDATE leave_requests
    SET status = 'REJECTED', approver_id = p_approver_id, rejected_reason = TRIM(p_reason), updated_at = NOW()
    WHERE id = p_request_id;

    INSERT INTO audit_logs (actor_id, action, target_type, target_id, old_value, new_value, reason, created_at)
    VALUES (p_approver_id, 'REJECT_LEAVE', 'LEAVE_REQUEST', p_request_id,
        jsonb_build_object('status', 'PENDING'),
        jsonb_build_object('status', 'REJECTED'),
        TRIM(p_reason), NOW());

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Should Skip Penalty (tích hợp leave + checkin)
CREATE OR REPLACE FUNCTION should_skip_penalty(
    p_user_id UUID,
    p_date DATE,
    p_time TIME
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM leave_requests WHERE user_id = p_user_id AND status = 'APPROVED'
        AND type = 'FULL_DAY' AND p_date BETWEEN start_date AND end_date) THEN
        RETURN true;
    END IF;

    IF p_time < '12:00:00' AND EXISTS (SELECT 1 FROM leave_requests WHERE user_id = p_user_id AND status = 'APPROVED'
        AND type = 'HALF_DAY_AM' AND p_date BETWEEN start_date AND end_date) THEN
        RETURN true;
    END IF;

    IF p_time >= '12:00:00' AND EXISTS (SELECT 1 FROM leave_requests WHERE user_id = p_user_id AND status = 'APPROVED'
        AND type = 'HALF_DAY_PM' AND p_date BETWEEN start_date AND end_date) THEN
        RETURN true;
    END IF;

    IF EXISTS (SELECT 1 FROM leave_requests WHERE user_id = p_user_id AND status = 'APPROVED'
        AND type = 'REMOTE' AND p_date BETWEEN start_date AND end_date) THEN
        RETURN true;
    END IF;

    IF EXISTS (SELECT 1 FROM leave_requests WHERE user_id = p_user_id AND status = 'APPROVED'
        AND type = 'LATE_ARRIVAL' AND p_date BETWEEN start_date AND end_date) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$;

-- Match Unmatched Transaction
CREATE OR REPLACE FUNCTION match_unmatched(
    p_unmatched_id UUID,
    p_ticket_id UUID,
    p_reason TEXT,
    p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_unmatched RECORD;
    v_ticket RECORD;
BEGIN
    -- Authorization: accountant/manager/admin
    IF NOT (auth_has_role('accountant') OR auth_has_role('manager') OR auth_has_role('admin')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
    END IF;

    IF LENGTH(TRIM(p_reason)) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reason must be at least 10 characters');
    END IF;

    SELECT * INTO v_unmatched FROM unmatched_transactions WHERE id = p_unmatched_id AND resolved = false FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unmatched not found or already resolved');
    END IF;

    SELECT * INTO v_ticket FROM penalty_tickets WHERE id = p_ticket_id AND status = 'UNPAID' FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ticket not found or not UNPAID');
    END IF;

    UPDATE unmatched_transactions
    SET resolved = true, resolved_at = NOW(), resolved_by = p_actor_id,
        resolution_action = 'MATCH_MANUAL', resolution_note = TRIM(p_reason), ticket_id = p_ticket_id
    WHERE id = p_unmatched_id;

    UPDATE penalty_tickets
    SET status = 'PAID', paid_at = NOW(), sepay_content = v_unmatched.content, updated_at = NOW()
    WHERE id = p_ticket_id;

    INSERT INTO fund_transactions (type, source, amount, ticket_id, unmatched_id, description, reference_code, created_by, created_at)
    VALUES ('INCOME', 'MATCH_ADJUST', v_unmatched.amount, p_ticket_id, p_unmatched_id,
        'Manual match: ' || TRIM(p_reason), v_unmatched.sepay_id, p_actor_id, NOW());

    INSERT INTO audit_logs (actor_id, action, target_type, target_id, old_value, new_value, reason, created_at)
    VALUES (p_actor_id, 'MATCH_UNMATCHED', 'UNMATCHED_TRANSACTION', p_unmatched_id,
        jsonb_build_object('resolved', false, 'ticket_id', null),
        jsonb_build_object('resolved', true, 'ticket_id', p_ticket_id),
        TRIM(p_reason), NOW());

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Refund Unmatched
CREATE OR REPLACE FUNCTION refund_unmatched(
    p_unmatched_id UUID,
    p_refund_amount BIGINT,
    p_method VARCHAR(30),
    p_recipient VARCHAR(100),
    p_reason TEXT,
    p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_unmatched RECORD;
    v_fund_id UUID;
BEGIN
    -- Authorization: accountant/manager/admin
    IF NOT (auth_has_role('accountant') OR auth_has_role('manager') OR auth_has_role('admin')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
    END IF;

    IF LENGTH(TRIM(p_reason)) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reason must be at least 10 characters');
    END IF;

    SELECT * INTO v_unmatched FROM unmatched_transactions WHERE id = p_unmatched_id AND resolved = false FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unmatched not found or already resolved');
    END IF;

    INSERT INTO fund_transactions (type, source, amount, unmatched_id, description, reference_code, created_by, created_at)
    VALUES ('EXPENSE', 'REFUND', p_refund_amount, p_unmatched_id,
        'Refund ' || p_method || ' to ' || p_recipient || ': ' || TRIM(p_reason),
        v_unmatched.sepay_id, p_actor_id, NOW())
    RETURNING id INTO v_fund_id;

    UPDATE unmatched_transactions
    SET resolved = true, resolved_at = NOW(), resolved_by = p_actor_id,
        resolution_action = 'REFUND', resolution_note = TRIM(p_reason), refund_transaction_id = v_fund_id
    WHERE id = p_unmatched_id;

    INSERT INTO audit_logs (actor_id, action, target_type, target_id, old_value, new_value, reason, created_at)
    VALUES (p_actor_id, 'REFUND_UNMATCHED', 'UNMATCHED_TRANSACTION', p_unmatched_id,
        jsonb_build_object('resolved', false),
        jsonb_build_object('resolved', true, 'refund_amount', p_refund_amount),
        TRIM(p_reason), NOW());

    RETURN jsonb_build_object('success', true, 'fund_transaction_id', v_fund_id);
END;
$$;

-- Create Withdraw Request
CREATE OR REPLACE FUNCTION create_withdraw_request(
    p_requester_id UUID,
    p_amount BIGINT,
    p_reason TEXT,
    p_attachment_url TEXT,
    p_threshold BIGINT DEFAULT 1000000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance BIGINT;
BEGIN
    -- Authorization: accountant/manager/admin
    IF NOT (auth_has_role('accountant') OR auth_has_role('manager') OR auth_has_role('admin')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
    END IF;

    IF LENGTH(TRIM(p_reason)) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reason must be at least 10 characters');
    END IF;

    SELECT COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE -amount END), 0)
    INTO v_balance FROM fund_transactions;

    IF p_amount > v_balance THEN
        RETURN jsonb_build_object('success', false, 'error', 'Amount exceeds current balance');
    END IF;

    INSERT INTO withdraw_requests (requester_id, amount, reason, attachment_url, threshold_amount, status, created_at)
    VALUES (p_requester_id, p_amount, TRIM(p_reason), p_attachment_url, p_threshold, 'PENDING', NOW());

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Approve Withdraw
CREATE OR REPLACE FUNCTION approve_withdraw(
    p_withdraw_id UUID,
    p_approver_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req RECORD;
    v_balance BIGINT;
BEGIN
    -- Authorization: manager/admin duyệt (accountant KHÔNG tự duyệt — phase4 §6.1)
    IF NOT (auth_has_role('manager') OR auth_has_role('admin')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
    END IF;

    SELECT * INTO v_req FROM withdraw_requests
    WHERE id = p_withdraw_id AND status IN ('PENDING', 'APPROVED') FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or not pending');
    END IF;

    SELECT COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE -amount END), 0)
    INTO v_balance FROM fund_transactions;
    IF v_req.amount > v_balance THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
    END IF;

    IF v_req.approver_1_id IS NULL THEN
        UPDATE withdraw_requests
        SET approver_1_id = p_approver_id, approver_1_at = NOW(), updated_at = NOW()
        WHERE id = p_withdraw_id;

        IF v_req.amount < v_req.threshold_amount THEN
            UPDATE withdraw_requests
            SET status = 'COMPLETED', completed_at = NOW()
            WHERE id = p_withdraw_id;

            INSERT INTO fund_transactions (type, source, amount, withdraw_request_id, description, created_by, created_at)
            VALUES ('EXPENSE', 'WITHDRAW', v_req.amount, p_withdraw_id, 'Withdraw: ' || v_req.reason, v_req.requester_id, NOW());
        ELSE
            UPDATE withdraw_requests SET status = 'APPROVED' WHERE id = p_withdraw_id;
        END IF;
    ELSIF v_req.approver_1_id IS NOT NULL AND v_req.approver_1_id != p_approver_id THEN
        UPDATE withdraw_requests
        SET approver_2_id = p_approver_id, approver_2_at = NOW(),
            status = 'COMPLETED', completed_at = NOW(), updated_at = NOW()
        WHERE id = p_withdraw_id;

        INSERT INTO fund_transactions (type, source, amount, withdraw_request_id, description, created_by, created_at)
        VALUES ('EXPENSE', 'WITHDRAW', v_req.amount, p_withdraw_id, 'Withdraw: ' || v_req.reason, v_req.requester_id, NOW());
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Already approved by you');
    END IF;

    INSERT INTO audit_logs (actor_id, action, target_type, target_id, old_value, new_value, reason, created_at)
    VALUES (p_approver_id, 'APPROVE_WITHDRAW', 'WITHDRAW_REQUEST', p_withdraw_id,
        jsonb_build_object('status', v_req.status),
        jsonb_build_object('status', 'COMPLETED', 'approver', p_approver_id),
        'Approved withdraw request', NOW());

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Manual Deposit
CREATE OR REPLACE FUNCTION manual_deposit(
    p_amount BIGINT,
    p_reason TEXT,
    p_method VARCHAR(30),
    p_attachment_url TEXT,
    p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Authorization: accountant/manager/admin
    IF NOT (auth_has_role('accountant') OR auth_has_role('manager') OR auth_has_role('admin')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
    END IF;

    IF LENGTH(TRIM(p_reason)) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reason must be at least 10 characters');
    END IF;

    INSERT INTO fund_transactions (type, source, amount, description, reference_code, created_by, created_at)
    VALUES ('INCOME', 'MANUAL_DEPOSIT', p_amount,
        'Manual deposit via ' || p_method || ': ' || TRIM(p_reason),
        p_attachment_url, p_actor_id, NOW());

    INSERT INTO audit_logs (actor_id, action, target_type, target_id, old_value, new_value, reason, created_at)
    VALUES (p_actor_id, 'MANUAL_DEPOSIT', 'FUND', NULL,
        jsonb_build_object('action', 'deposit', 'amount', p_amount),
        jsonb_build_object('action', 'deposit', 'amount', p_amount, 'status', 'completed'),
        TRIM(p_reason), NOW());

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Report Monthly
CREATE OR REPLACE FUNCTION report_monthly(
    p_year INT,
    p_month INT
)
RETURNS TABLE (
    total_income BIGINT,
    total_expense BIGINT,
    net_balance BIGINT,
    transaction_count BIGINT,
    penalty_count BIGINT,
    withdraw_count BIGINT,
    unmatched_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE -amount END), 0),
        COUNT(*),
        COUNT(*) FILTER (WHERE source = 'PENALTY'),
        COUNT(*) FILTER (WHERE source = 'WITHDRAW'),
        (SELECT COUNT(*) FROM unmatched_transactions
         WHERE EXTRACT(YEAR FROM received_at) = p_year AND EXTRACT(MONTH FROM received_at) = p_month)
    FROM fund_transactions
    WHERE EXTRACT(YEAR FROM created_at) = p_year AND EXTRACT(MONTH FROM created_at) = p_month;
END;
$$;

-- ============================================================
-- TRIGGERS (Auto updated_at)
-- ============================================================

DO $$
BEGIN
    -- users
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at') THEN
        CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- payment_settings
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payment_settings_updated_at') THEN
        CREATE TRIGGER trg_payment_settings_updated_at BEFORE UPDATE ON payment_settings
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- penalty_tickets
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_penalty_tickets_updated_at') THEN
        CREATE TRIGGER trg_penalty_tickets_updated_at BEFORE UPDATE ON penalty_tickets
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- leave_quotas
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leave_quotas_updated_at') THEN
        CREATE TRIGGER trg_leave_quotas_updated_at BEFORE UPDATE ON leave_quotas
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- leave_requests
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leave_requests_updated_at') THEN
        CREATE TRIGGER trg_leave_requests_updated_at BEFORE UPDATE ON leave_requests
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- withdraw_requests
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_withdraw_requests_updated_at') THEN
        CREATE TRIGGER trg_withdraw_requests_updated_at BEFORE UPDATE ON withdraw_requests
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- user_preferences
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_preferences_updated_at') THEN
        CREATE TRIGGER trg_user_preferences_updated_at BEFORE UPDATE ON user_preferences
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END;
$$;

-- ============================================================
-- INDEXES
-- ============================================================

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_checkins_user_id ON checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_checkins_created_at ON checkins(created_at);
CREATE INDEX IF NOT EXISTS idx_checkins_status ON checkins(status);

-- Anti race-condition: 1 bản ghi check-in / user / ngày (mọi status).
-- Luồng REJECT xóa PENDING_REVIEW nên slot tự giải phóng — khớp phase1 §4.6.
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkins_user_day
    ON checkins (user_id, vn_date(created_at));

CREATE INDEX IF NOT EXISTS idx_penalty_tickets_user_id ON penalty_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_penalty_tickets_status ON penalty_tickets(status);
CREATE INDEX IF NOT EXISTS idx_penalty_tickets_created_at ON penalty_tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_penalty_tickets_branch ON penalty_tickets(branch_code);
CREATE INDEX IF NOT EXISTS idx_penalty_tickets_tx_id ON penalty_tickets(transaction_id);

CREATE INDEX IF NOT EXISTS idx_fund_transactions_created_at ON fund_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_fund_transactions_source ON fund_transactions(source);
CREATE INDEX IF NOT EXISTS idx_fund_transactions_type ON fund_transactions(type);
CREATE INDEX IF NOT EXISTS idx_fund_transactions_ticket ON fund_transactions(ticket_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_event_timelines_entity ON event_timelines(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_event_timelines_created_at ON event_timelines(created_at);

CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_category ON system_logs(category);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_sepay_webhook_logs_sepay_id ON sepay_webhook_logs(sepay_id);

CREATE INDEX IF NOT EXISTS idx_unmatched_resolved ON unmatched_transactions(resolved);
CREATE INDEX IF NOT EXISTS idx_unmatched_received_at ON unmatched_transactions(received_at);

CREATE INDEX IF NOT EXISTS idx_leave_requests_user_id ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_leave_quotas_user_year ON leave_quotas(user_id, year);

CREATE INDEX IF NOT EXISTS idx_withdraw_requests_status ON withdraw_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdraw_requests_requester ON withdraw_requests(requester_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON login_attempts(email, created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address, created_at);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

-- ============================================================
-- RLS POLICIES
-- ============================================================
-- WRITE MODEL (quan trọng):
--   * Bảng tiền/audit/lịch sử (penalty_tickets, fund_transactions,
--     unmatched_transactions, withdraw_requests, audit_logs, event_timelines,
--     system_logs, client_logs) CỐ Ý không có policy INSERT/UPDATE/DELETE
--     cho client.
--   * Mọi business write diễn ra bên trong các RPC SECURITY DEFINER ở trên
--     (đã tự kiểm tra role), hoặc qua service_role (webhook/cron).
--   * Client ghi trực tiếp vào các bảng đó → bị RLS từ chối mặc định.
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE tablet_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE late_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE penalty_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sepay_webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE unmatched_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_timelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_request_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdraw_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Helper: check if user has role
CREATE OR REPLACE FUNCTION auth_has_role(role_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (auth.jwt() -> 'roles') ? role_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Users
DROP POLICY IF EXISTS "Users view own" ON users;
CREATE POLICY "Users view own" ON users FOR SELECT
USING (auth.uid() = id OR auth_has_role('manager') OR auth_has_role('admin') OR auth_has_role('hr'));

DROP POLICY IF EXISTS "Users update own" ON users;
CREATE POLICY "Users update own" ON users FOR UPDATE
USING (auth.uid() = id);

-- Titles (read-only for all authenticated)
DROP POLICY IF EXISTS "Titles read all" ON titles;
CREATE POLICY "Titles read all" ON titles FOR SELECT TO authenticated USING (true);

-- Office Locations
DROP POLICY IF EXISTS "Office locations read all" ON office_locations;
CREATE POLICY "Office locations read all" ON office_locations FOR SELECT TO authenticated USING (true);

-- Checkins
DROP POLICY IF EXISTS "Checkins user own" ON checkins;
CREATE POLICY "Checkins user own" ON checkins FOR SELECT
USING (user_id = auth.uid() OR auth_has_role('manager') OR auth_has_role('admin'));

DROP POLICY IF EXISTS "Checkins user insert" ON checkins;
CREATE POLICY "Checkins user insert" ON checkins FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Tablet Tokens (manager/admin only)
DROP POLICY IF EXISTS "Tablet tokens manager" ON tablet_tokens;
CREATE POLICY "Tablet tokens manager" ON tablet_tokens FOR ALL
USING (auth_has_role('manager') OR auth_has_role('admin'));

-- Late Tiers
DROP POLICY IF EXISTS "Late tiers read all" ON late_tiers;
CREATE POLICY "Late tiers read all" ON late_tiers FOR SELECT TO authenticated USING (true);

-- Fraud Rules
DROP POLICY IF EXISTS "Fraud rules read all" ON fraud_rules;
CREATE POLICY "Fraud rules read all" ON fraud_rules FOR SELECT TO authenticated USING (true);

-- Settings
DROP POLICY IF EXISTS "Settings manager" ON settings;
CREATE POLICY "Settings manager" ON settings FOR ALL
USING (auth_has_role('manager') OR auth_has_role('admin'));

-- Payment Settings
DROP POLICY IF EXISTS "Payment settings manager" ON payment_settings;
CREATE POLICY "Payment settings manager" ON payment_settings FOR ALL
USING (auth_has_role('manager') OR auth_has_role('admin'));

-- Penalty Tickets
DROP POLICY IF EXISTS "Penalty tickets user own" ON penalty_tickets;
CREATE POLICY "Penalty tickets user own" ON penalty_tickets FOR SELECT
USING (user_id = auth.uid() OR auth_has_role('manager') OR auth_has_role('admin'));

-- Fund Transactions (accountant/manager/admin)
DROP POLICY IF EXISTS "Fund transactions accountant" ON fund_transactions;
CREATE POLICY "Fund transactions accountant" ON fund_transactions FOR SELECT
USING (auth_has_role('accountant') OR auth_has_role('manager') OR auth_has_role('admin'));

-- Sepay Webhook Logs (admin only)
DROP POLICY IF EXISTS "Sepay logs admin" ON sepay_webhook_logs;
CREATE POLICY "Sepay logs admin" ON sepay_webhook_logs FOR SELECT
USING (auth_has_role('admin'));

-- Unmatched Transactions (accountant/manager)
DROP POLICY IF EXISTS "Unmatched accountant" ON unmatched_transactions;
CREATE POLICY "Unmatched accountant" ON unmatched_transactions FOR SELECT
USING (auth_has_role('accountant') OR auth_has_role('manager') OR auth_has_role('admin'));

-- Audit Logs (manager/accountant/hr/admin)
DROP POLICY IF EXISTS "Audit logs manager" ON audit_logs;
CREATE POLICY "Audit logs manager" ON audit_logs FOR SELECT
USING (auth_has_role('manager') OR auth_has_role('accountant') OR auth_has_role('hr') OR auth_has_role('admin'));

-- Event Timelines
DROP POLICY IF EXISTS "Timeline read manager" ON event_timelines;
CREATE POLICY "Timeline read manager" ON event_timelines FOR SELECT
USING (auth_has_role('manager') OR auth_has_role('admin'));

-- System Logs (admin only)
DROP POLICY IF EXISTS "System logs admin" ON system_logs;
CREATE POLICY "System logs admin" ON system_logs FOR ALL
USING (auth_has_role('admin'));

-- Client Logs (admin only)
DROP POLICY IF EXISTS "Client logs admin" ON client_logs;
CREATE POLICY "Client logs admin" ON client_logs FOR ALL
USING (auth_has_role('admin'));

-- Leave Requests
DROP POLICY IF EXISTS "Leave user own" ON leave_requests;
CREATE POLICY "Leave user own" ON leave_requests FOR SELECT
USING (user_id = auth.uid() OR auth_has_role('manager') OR auth_has_role('hr') OR auth_has_role('admin'));

DROP POLICY IF EXISTS "Leave user insert" ON leave_requests;
CREATE POLICY "Leave user insert" ON leave_requests FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Leave user update" ON leave_requests;
CREATE POLICY "Leave user update" ON leave_requests FOR UPDATE
USING (user_id = auth.uid() AND status IN ('DRAFT', 'PENDING'));

-- Leave Quotas
DROP POLICY IF EXISTS "Quota user own" ON leave_quotas;
CREATE POLICY "Quota user own" ON leave_quotas FOR SELECT
USING (user_id = auth.uid() OR auth_has_role('manager') OR auth_has_role('hr') OR auth_has_role('admin'));

-- Leave Types Config
DROP POLICY IF EXISTS "Leave types read" ON leave_types_config;
CREATE POLICY "Leave types read" ON leave_types_config FOR SELECT TO authenticated USING (true);

-- Leave Request Comments
DROP POLICY IF EXISTS "Leave comments related" ON leave_request_comments;
CREATE POLICY "Leave comments related" ON leave_request_comments FOR SELECT
USING (auth_has_role('manager') OR auth_has_role('hr') OR user_id = auth.uid());

-- Withdraw Requests
DROP POLICY IF EXISTS "Withdraw accountant" ON withdraw_requests;
CREATE POLICY "Withdraw accountant" ON withdraw_requests FOR SELECT
USING (auth_has_role('accountant') OR auth_has_role('manager') OR auth_has_role('admin'));

-- User Roles (admin only for CRUD, user can read own)
DROP POLICY IF EXISTS "User roles admin" ON user_roles;
CREATE POLICY "User roles admin" ON user_roles FOR ALL
USING (auth_has_role('admin'));

-- Notifications
DROP POLICY IF EXISTS "Notifications user own" ON notifications;
CREATE POLICY "Notifications user own" ON notifications FOR ALL
USING (user_id = auth.uid());

-- User Preferences
DROP POLICY IF EXISTS "Preferences user own" ON user_preferences;
CREATE POLICY "Preferences user own" ON user_preferences FOR ALL
USING (user_id = auth.uid());

-- User Push Tokens
DROP POLICY IF EXISTS "Push tokens user own" ON user_push_tokens;
CREATE POLICY "Push tokens user own" ON user_push_tokens FOR ALL
USING (user_id = auth.uid());

-- Login Attempts (admin only)
DROP POLICY IF EXISTS "Login attempts admin" ON login_attempts;
CREATE POLICY "Login attempts admin" ON login_attempts FOR ALL
USING (auth_has_role('admin'));

-- ============================================================
-- SEED DATA
-- ============================================================

-- Seed titles
INSERT INTO titles (name, description) VALUES
('Gà con chăm chỉ', 'Luôn đúng giờ'),
('Vua đi trễ', 'Chuyên gia đi trễ'),
('Đại cổ đông quỹ tiền phạt', 'Đóng góp nhiều nhất'),
('Thánh nghỉ phép', 'Nghỉ phép nhiều nhất'),
('Cáo già công sở', 'Xin nghỉ khéo léo')
ON CONFLICT DO NOTHING;

-- Seed leave types
INSERT INTO leave_types_config (type, name_vi, affects_checkin, requires_approval, max_days, color) VALUES
('FULL_DAY', 'Nghỉ cả ngày', true, true, 30, '#EF4444'),
('HALF_DAY_AM', 'Nghỉ buổi sáng', true, true, 1, '#F59E0B'),
('HALF_DAY_PM', 'Nghỉ buổi chiều', true, true, 1, '#F59E0B'),
('REMOTE', 'Làm việc từ xa', true, true, 5, '#10B981'),
('LATE_ARRIVAL', 'Xin đi trễ', true, true, 1, '#3B82F6'),
('EARLY_LEAVE', 'Xin về sớm', true, true, 1, '#8B5CF6')
ON CONFLICT (type) DO NOTHING;

-- Seed settings
INSERT INTO settings (key, value) VALUES
('checkin_deadline', '09:35'),
('auto_absent_at', '10:05'),
('tablet_start', '09:00'),
('tablet_end', '09:45:59')
ON CONFLICT (key) DO NOTHING;
