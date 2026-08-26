# Phase 4: Accounting & Fund Management — Chi tiết

> **Techstack:** Supabase (PostgreSQL, Realtime, Edge Functions, Auth, RLS, Storage)  
> **Nguyên tắc:** Mọi thao tác ảnh hưởng đến quỹ (rút/nạp/hoàn/match) đều bắt buộc nhập lý do + ghi audit diff. Quỹ không tự do rút — cần threshold + multi-approval. Accountant là role mới, tách biệt Manager.

---

## 1. Data Model

### 1.1 `fund_transactions` (Mở rộng từ Phase 2)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | |
| `type` | VARCHAR(20) | NOT NULL | `INCOME` / `EXPENSE` |
| `source` | VARCHAR(50) | NOT NULL | `PENALTY` / `PENALTY_CASH` / `MANUAL_DEPOSIT` / `WITHDRAW` / `REFUND` / `MATCH_ADJUST` |
| `amount` | BIGINT | NOT NULL | Đơn vị VNĐ, luôn dương |
| `ticket_id` | UUID | FK → penalty_tickets, nullable | Link phiếu phạt |
| `unmatched_id` | UUID | FK → unmatched_transactions, nullable | Link giao dịch lạc |
| `branch` | VARCHAR(10) | nullable | `HN`, `HCM` |
| `description` | TEXT | NOT NULL | Mô tả giao dịch |
| `reference_code` | VARCHAR(100) | nullable | Mã tham chiếu Sepay hoặc số chứng từ |
| `collector_name` | VARCHAR(100) | nullable | Người thu tiền mặt |
| `withdraw_request_id` | UUID | FK → withdraw_requests, nullable | Link yêu cầu rút quỹ |
| `created_by` | UUID | FK → users, nullable | Người tạo transaction — NULL = system/webhook (vd `process_payment`) — khớp migration |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

**RLS:**
```sql
-- Accountant/Manager/Admin xem tất cả (JWT claim chuẩn: mảng roles[])
CREATE POLICY "Fund transactions accountant" ON fund_transactions FOR SELECT
USING (auth_has_role('accountant') OR auth_has_role('manager') OR auth_has_role('admin'));

-- KHÔNG có policy INSERT cho client: mọi ghi vào quỹ đi qua RPC
-- SECURITY DEFINER (manual_deposit, match_unmatched, refund_unmatched,
-- approve_withdraw) hoặc service_role — client write trực tiếp bị RLS deny.
```

> **Hint thay thế:** Nếu dùng Node.js/Express: `requireRole(['accountant', 'manager', 'admin'])` middleware trước mọi route quỹ. Nếu dùng Firebase: Firestore rules `allow read: if request.auth.token.role in ['accountant', 'manager', 'admin']`.

---

### 1.2 `unmatched_transactions` (Đã tạo ở Phase 2, mở rộng thêm cột)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | |
| `sepay_id` | VARCHAR(50) | NOT NULL | |
| `ticket_id` | UUID | FK → penalty_tickets, nullable | |
| `transaction_id` | VARCHAR(20) | nullable | |
| `content` | TEXT | | Nội dung CK |
| `amount` | BIGINT | | Số tiền nhận được |
| `expected_amount` | BIGINT | nullable | Số tiền mong đợi |
| `received_amount` | BIGINT | nullable | Số tiền thực nhận |
| `reason` | VARCHAR(50) | | `NO_TRANSACTION_ID` / `TICKET_NOT_FOUND` / `AMOUNT_MISMATCH` / `TICKET_ALREADY_PAID` |
| `received_at` | TIMESTAMPTZ | | |
| `resolved` | BOOLEAN | DEFAULT false | |
| `resolved_at` | TIMESTAMPTZ | nullable | |
| `resolved_by` | UUID | FK → users, nullable | Accountant/Manager xử lý |
| `resolution_action` | VARCHAR(30) | nullable | `MATCH_MANUAL` / `REFUND` / `IGNORE` |
| `resolution_note` | TEXT | nullable | Lý do xử lý |
| `refund_transaction_id` | UUID | FK → fund_transactions, nullable | Link transaction hoàn tiền |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

---

### 1.3 `withdraw_requests` (Yêu cầu rút quỹ mới)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | |
| `requester_id` | UUID | FK → users, NOT NULL | Accountant tạo yêu cầu |
| `amount` | BIGINT | NOT NULL | Số tiền yêu cầu |
| `reason` | TEXT | NOT NULL | Lý do rút (min 10 ký tự) |
| `attachment_url` | TEXT | nullable | Ảnh hóa đơn/chứng từ |
| `status` | VARCHAR(20) | DEFAULT 'PENDING' | `PENDING` / `APPROVED` / `REJECTED` / `COMPLETED` |
| `threshold_amount` | BIGINT | NOT NULL | Ngưỡng cần 2 người duyệt (config, mặc định 1,000,000) |
| `approver_1_id` | UUID | FK → users, nullable | Người duyệt 1 |
| `approver_1_at` | TIMESTAMPTZ | nullable | |
| `approver_2_id` | UUID | FK → users, nullable | Người duyệt 2 (nếu > threshold) |
| `approver_2_at` | TIMESTAMPTZ | nullable | |
| `rejected_by` | UUID | FK → users, nullable | |
| `rejected_reason` | TEXT | nullable | |
| `completed_at` | TIMESTAMPTZ | nullable | Khi transaction quỹ đã tạo |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

---

### 1.4 `user_roles` (Multi-role — 1 user nhiều vai)

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users, NOT NULL |
| `role` | VARCHAR(20) | NOT NULL | `staff` / `manager` / `accountant` / `hr` / `admin` |
| `assigned_at` | TIMESTAMPTZ | DEFAULT now() |
| `assigned_by` | UUID | FK → users | Admin phân quyền |

**JWT token chứa:** `roles: ["manager", "accountant"]` (mảng, không phải string đơn).

> **Hint thay thế:** Nếu dùng Node.js: bảng `user_roles` riêng, middleware `requireAnyRole(['manager', 'accountant'])`. Nếu dùng Firebase: custom claims `roles: ['manager', 'accountant']` trong JWT token.

---

## 2. Xử lý giao dịch thiếu/thừa (Unmatched)

### 2.1 Màn hình Unmatched (Accountant/Manager)

```
Tab "Đối soát" → "Giao dịch chưa khớp"
    ↓
Filter: reason (NO_TRANSACTION_ID / TICKET_NOT_FOUND / AMOUNT_MISMATCH), ngày, số tiền
    ↓
Table:
  | Ngày nhận | Sepay ID | Lý do | Số tiền | Nội dung CK | Action |
    ↓
Click row → Chi tiết:
  - Payload gốc từ Sepay (JSON viewer)
  - Nếu có transaction_id → tìm phiếu phạt liên quan
  - Nếu AMOUNT_MISMATCH → hiển thị: Expected: 20k | Received: 15k
    ↓
3 nút action (tất cả bắt buộc nhập lý do):
  [✅ Khớp thủ công]  [💰 Hoàn tiền]  [🗑️ Bỏ qua]
```

### 2.2 Action 1: MATCH_MANUAL

**Điều kiện:**
- `reason` = `TICKET_NOT_FOUND` hoặc `AMOUNT_MISMATCH` (nhưng received >= expected).
- Tìm được phiếu `UNPAID` phù hợp.

**Flow:**
```
Accountant chọn unmatched → Bấm "Khớp thủ công"
    ↓
Popup: Chọn phiếu UNPAID từ dropdown (search theo mã/tên)
    ↓
Nhập lý do khớp (min 10 ký tự)
    ↓
Bấm xác nhận
    ↓
Server:
  1. UPDATE unmatched_transactions → resolved = true, resolution_action = 'MATCH_MANUAL'
  2. UPDATE penalty_tickets → status = 'PAID', paid_at = NOW(), sepay_content = content
  3. INSERT fund_transactions (source = MATCH_ADJUST, type = INCOME)
  4. Ghi audit log: action = MATCH_UNMATCHED
  5. Ghi event timeline
    ↓
Supabase Realtime push về PWA user (phiếu PAID)
```

**RPC: `match_unmatched`**
```sql
CREATE OR REPLACE FUNCTION match_unmatched(
  p_unmatched_id UUID,
  p_ticket_id UUID,
  p_reason TEXT,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_unmatched RECORD;
  v_ticket RECORD;
BEGIN
  IF LENGTH(TRIM(p_reason)) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reason must be at least 10 characters');
  END IF;

  SELECT * INTO v_unmatched FROM unmatched_transactions 
  WHERE id = p_unmatched_id AND resolved = false FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unmatched not found or already resolved');
  END IF;

  SELECT * INTO v_ticket FROM penalty_tickets 
  WHERE id = p_ticket_id AND status = 'UNPAID' FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ticket not found or not UNPAID');
  END IF;

  -- Update unmatched
  UPDATE unmatched_transactions 
  SET resolved = true, resolved_at = NOW(), resolved_by = p_actor_id,
      resolution_action = 'MATCH_MANUAL', resolution_note = TRIM(p_reason),
      ticket_id = p_ticket_id
  WHERE id = p_unmatched_id;

  -- Update ticket
  UPDATE penalty_tickets 
  SET status = 'PAID', paid_at = NOW(), sepay_content = v_unmatched.content,
      updated_at = NOW()
  WHERE id = p_ticket_id;

  -- Create fund transaction
  INSERT INTO fund_transactions (type, source, amount, ticket_id, unmatched_id,
    description, reference_code, created_by, created_at)
  VALUES ('INCOME', 'MATCH_ADJUST', v_unmatched.amount, p_ticket_id, p_unmatched_id,
    'Manual match: ' || TRIM(p_reason), v_unmatched.sepay_id, p_actor_id, NOW());

  -- Audit
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, old_value, new_value, reason, created_at)
  VALUES (p_actor_id, 'MATCH_UNMATCHED', 'UNMATCHED_TRANSACTION', p_unmatched_id,
    jsonb_build_object('resolved', false, 'ticket_id', null),
    jsonb_build_object('resolved', true, 'ticket_id', p_ticket_id, 'action', 'MATCH_MANUAL'),
    TRIM(p_reason), NOW());

  RETURN jsonb_build_object('success', true);
END;
$$;
```

### 2.3 Action 2: REFUND

**Điều kiện:**
- User chuyển thừa / nhầm.
- Kế toán đã hoàn tiền trực tiếp (ngoài app).
- App chỉ **ghi nhận** hoàn tiền đã xảy ra.

**Flow:**
```
Accountant chọn unmatched → Bấm "Hoàn tiền"
    ↓
Popup:
  - Hiển thị số tiền nhận được
  - Input "Số tiền đã hoàn" (mặc định = amount, có thể sửa nếu hoàn một phần)
  - Input "Phương thức hoàn" (tiền mặt / chuyển khoản)
  - Input "Người nhận hoàn tiền"
  - Upload chứng từ hoàn tiền (tùy chọn)
  - Textarea lý do (bắt buộc, min 10 ký tự)
    ↓
Bấm xác nhận
    ↓
Server:
  1. UPDATE unmatched → resolved = true, resolution_action = 'REFUND'
  2. INSERT fund_transactions (source = REFUND, type = EXPENSE)
  3. Ghi audit log
```

**RPC: `refund_unmatched`**
```sql
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
AS $$
DECLARE
  v_unmatched RECORD;
  v_fund_id UUID;
BEGIN
  IF LENGTH(TRIM(p_reason)) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reason must be at least 10 characters');
  END IF;

  SELECT * INTO v_unmatched FROM unmatched_transactions 
  WHERE id = p_unmatched_id AND resolved = false FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unmatched not found or already resolved');
  END IF;

  -- Create EXPENSE transaction
  INSERT INTO fund_transactions (type, source, amount, unmatched_id, description,
    reference_code, created_by, created_at)
  VALUES ('EXPENSE', 'REFUND', p_refund_amount, p_unmatched_id,
    'Refund ' || p_method || ' to ' || p_recipient || ': ' || TRIM(p_reason),
    v_unmatched.sepay_id, p_actor_id, NOW())
  RETURNING id INTO v_fund_id;

  -- Update unmatched
  UPDATE unmatched_transactions 
  SET resolved = true, resolved_at = NOW(), resolved_by = p_actor_id,
      resolution_action = 'REFUND', resolution_note = TRIM(p_reason),
      refund_transaction_id = v_fund_id
  WHERE id = p_unmatched_id;

  -- Audit
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, old_value, new_value, reason, created_at)
  VALUES (p_actor_id, 'REFUND_UNMATCHED', 'UNMATCHED_TRANSACTION', p_unmatched_id,
    jsonb_build_object('resolved', false),
    jsonb_build_object('resolved', true, 'refund_amount', p_refund_amount, 'method', p_method),
    TRIM(p_reason), NOW());

  RETURN jsonb_build_object('success', true, 'fund_transaction_id', v_fund_id);
END;
$$;
```

### 2.4 Action 3: IGNORE

**Điều kiện:** Giao dịch lạc, không liên quan đến công ty (ví dụ: khách hàng chuyển nhầm).

**Flow:** Tương tự, chỉ cập nhật `resolved = true`, `resolution_action = 'IGNORE'`, không tạo fund transaction.

---

## 3. Rút tiền từ quỹ (Fund Withdraw)

### 3.1 Quy tắc

| Điều kiện | Quy định |
|-----------|----------|
| Ai tạo | Accountant hoặc Manager |
| Ai duyệt | Manager (hoặc Admin) |
| Threshold | Mặc định 1,000,000đ. Có thể config trong `system_configs` |
| < threshold | 1 người duyệt (approver_1) → tự động tạo transaction |
| > threshold | Cần 2 người duyệt (approver_1 + approver_2) |
| Lý do | Bắt buộc, min 10 ký tự |
| Chứng từ | Upload ảnh hóa đơn (tùy chọn nhưng khuyến khích) |
| Số tiền | ≤ balance hiện tại |

### 3.2 Flow

```
Accountant mở "Quỹ công ty" → Bấm "Rút quỹ"
    ↓
Form:
  - Số tiền (input VNĐ, validate ≤ balance)
  - Lý do (textarea, min 10 ký tự)
  - Upload hóa đơn/chứng từ (tối đa 3 ảnh → Supabase Storage)
    ↓
Bấm "Gửi yêu cầu"
    ↓
Server: Tạo withdraw_requests, status = PENDING
    ↓
Manager nhận thông báo (push + in-app + Realtime)
    ↓
Manager mở "Duyệt rút quỹ"
    ├── Nếu amount < threshold:
    │   Bấm "Duyệt" (approver_1) → status = COMPLETED
    │   → Tự động tạo fund_transactions (EXPENSE, source = WITHDRAW)
    │   → Ghi audit log
    │   → Balance giảm
    ├── Nếu amount > threshold:
    │   Manager 1 bấm "Duyệt" (approver_1) → status = APPROVED (chờ duyệt 2)
    │   → Thông báo Manager 2
    │   Manager 2 bấm "Duyệt" (approver_2) → status = COMPLETED
    │   → Tạo fund transaction
    └── Hoặc bấm "Từ chối" → bắt buộc lý do → status = REJECTED
```

### 3.3 RPC: Tạo yêu cầu rút

```sql
CREATE OR REPLACE FUNCTION create_withdraw_request(
  p_requester_id UUID,
  p_amount BIGINT,
  p_reason TEXT,
  p_attachment_url TEXT,
  p_threshold BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  IF LENGTH(TRIM(p_reason)) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reason must be at least 10 characters');
  END IF;

  -- Kiểm tra balance
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
```

### 3.4 RPC: Duyệt rút quỹ

```sql
CREATE OR REPLACE FUNCTION approve_withdraw(
  p_withdraw_id UUID,
  p_approver_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_req RECORD;
  v_balance BIGINT;
BEGIN
  SELECT * INTO v_req FROM withdraw_requests 
  WHERE id = p_withdraw_id AND status IN ('PENDING', 'APPROVED') 
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found or not pending');
  END IF;

  -- Kiểm tra balance lại (phòng trường hợp đã rút mất)
  SELECT COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE -amount END), 0)
  INTO v_balance FROM fund_transactions;

  IF v_req.amount > v_balance THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- Nếu chưa có approver_1
  IF v_req.approver_1_id IS NULL THEN
    UPDATE withdraw_requests 
    SET approver_1_id = p_approver_id, approver_1_at = NOW(), updated_at = NOW()
    WHERE id = p_withdraw_id;

    -- Nếu < threshold → hoàn thành luôn
    IF v_req.amount < v_req.threshold_amount THEN
      UPDATE withdraw_requests 
      SET status = 'COMPLETED', completed_at = NOW() 
      WHERE id = p_withdraw_id;

      -- Tạo transaction
      PERFORM create_withdraw_transaction(p_withdraw_id);
    ELSE
      -- > threshold → chờ approver 2
      UPDATE withdraw_requests SET status = 'APPROVED' WHERE id = p_withdraw_id;
    END IF;

  -- Nếu đã có approver_1, đây là approver_2
  ELSIF v_req.approver_1_id IS NOT NULL AND v_req.approver_1_id != p_approver_id THEN
    UPDATE withdraw_requests 
    SET approver_2_id = p_approver_id, approver_2_at = NOW(), 
        status = 'COMPLETED', completed_at = NOW(), updated_at = NOW()
    WHERE id = p_withdraw_id;

    PERFORM create_withdraw_transaction(p_withdraw_id);
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Already approved by you');
  END IF;

  -- Audit
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, old_value, new_value, reason, created_at)
  VALUES (p_approver_id, 'APPROVE_WITHDRAW', 'WITHDRAW_REQUEST', p_withdraw_id,
    jsonb_build_object('status', v_req.status),
    jsonb_build_object('status', 'COMPLETED', 'approver', p_approver_id),
    'Approved withdraw request', NOW());

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Helper: tạo transaction khi withdraw completed
CREATE OR REPLACE FUNCTION create_withdraw_transaction(p_withdraw_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_req RECORD;
BEGIN
  SELECT * INTO v_req FROM withdraw_requests WHERE id = p_withdraw_id;

  INSERT INTO fund_transactions (type, source, amount, withdraw_request_id,
    description, created_by, created_at)
  VALUES ('EXPENSE', 'WITHDRAW', v_req.amount, p_withdraw_id,
    'Withdraw: ' || v_req.reason, v_req.requester_id, NOW());
END;
$$;
```

---

## 4. Nạp tiền vào quỹ (Manual Deposit)

### 4.1 Flow

```
Accountant mở "Quỹ công ty" → Bấm "Nạp tiền"
    ↓
Form:
  - Số tiền (input VNĐ)
  - Lý do (textarea, min 10 ký tự)
  - Phương thức: Tiền mặt / Chuyển khoản / Khác
  - Upload chứng từ (bắt buộc)
    ↓
Bấm "Xác nhận nạp"
    ↓
Server:
  1. INSERT fund_transactions (source = MANUAL_DEPOSIT, type = INCOME)
  2. Ghi audit log
  3. Realtime push: Manager nhận toast "+Xđ vào quỹ — Nạp thủ công"
```

**RPC: `manual_deposit`**
```sql
CREATE OR REPLACE FUNCTION manual_deposit(
  p_amount BIGINT,
  p_reason TEXT,
  p_method VARCHAR(30),
  p_attachment_url TEXT,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  IF LENGTH(TRIM(p_reason)) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reason must be at least 10 characters');
  END IF;

  INSERT INTO fund_transactions (type, source, amount, description,
    reference_code, created_by, created_at)
  VALUES ('INCOME', 'MANUAL_DEPOSIT', p_amount,
    'Manual deposit via ' || p_method || ': ' || TRIM(p_reason),
    p_attachment_url, p_actor_id, NOW());

  INSERT INTO audit_logs (actor_id, action, target_type, target_id, old_value, new_value, reason, created_at)
  VALUES (p_actor_id, 'MANUAL_DEPOSIT', 'FUND', null,
    jsonb_build_object('balance_before', (SELECT COALESCE(SUM(CASE WHEN type='INCOME' THEN amount ELSE -amount END),0) FROM fund_transactions) - p_amount),
    jsonb_build_object('balance_after', (SELECT COALESCE(SUM(CASE WHEN type='INCOME' THEN amount ELSE -amount END),0) FROM fund_transactions)),
    TRIM(p_reason), NOW());

  RETURN jsonb_build_object('success', true);
END;
$$;
```

---

## 5. Báo cáo tài chính

### 5.1 Báo cáo có sẵn

| Báo cáo | Endpoint | Nội dung | Export |
|---------|----------|----------|--------|
| Báo cáo tháng | RPC `report_monthly` | Tổng thu, tổng chi, số dư đầu/cuối, số lượng giao dịch | Excel |
| Báo cáo theo nhân viên | RPC `report_by_employee` | Tổng phạt của từng nhân viên theo tháng/quý | Excel |
| Báo cáo theo chi nhánh | RPC `report_by_branch` | So sánh thu chi HN vs HCM | Excel |
| Báo cáo unmatched | RPC `report_unmatched` | Danh sách chưa khớp theo tháng | Excel |
| Báo cáo audit | RPC `report_audit` | Tổng hợp thao tác quan trọng | Excel / PDF |

### 5.2 RPC: Báo cáo tháng

```sql
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
    COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) as total_income,
    COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) as total_expense,
    COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE -amount END), 0) as net_balance,
    COUNT(*) as transaction_count,
    COUNT(*) FILTER (WHERE source = 'PENALTY') as penalty_count,
    COUNT(*) FILTER (WHERE source = 'WITHDRAW') as withdraw_count,
    (SELECT COUNT(*) FROM unmatched_transactions 
     WHERE EXTRACT(YEAR FROM received_at) = p_year 
       AND EXTRACT(MONTH FROM received_at) = p_month) as unmatched_count
  FROM fund_transactions
  WHERE EXTRACT(YEAR FROM created_at) = p_year 
    AND EXTRACT(MONTH FROM created_at) = p_month;
END;
$$;
```

### 5.3 Export

```javascript
// Client-side: fetch data từ RPC rồi generate Excel bằng sheetjs
// Hoặc Edge Function generate file rồi upload lên Supabase Storage, trả về signed URL
```

> **Hint thay thế:** Nếu dùng Node.js: `exceljs` hoặc `xlsx` library để generate file server-side. Nếu dùng Firebase: Cloud Function generate PDF bằng `puppeteer` hoặc `pdfkit`.

---

## 6. Multi-role: Accountant

### 6.1 Bảng quyền chi tiết

| Tính năng | Staff | Manager | Accountant | HR | Admin |
|-----------|-------|---------|------------|-----|-------|
| Xem quỹ công ty | ❌ | ✅ | ✅ | ❌ | ✅ |
| Export transaction | ❌ | ✅ | ✅ | ❌ | ✅ |
| Xử lý unmatched | ❌ | ✅ | ✅ | ❌ | ✅ |
| Rút quỹ (tạo yêu cầu) | ❌ | ✅ | ✅ | ❌ | ✅ |
| Duyệt rút quỹ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Nạp quỹ | ❌ | ✅ | ✅ | ❌ | ✅ |
| Xem audit log | ❌ | ✅ | ✅ | ✅ | ✅ |
| Tạo phiếu phạt thủ công | ❌ | ✅ | ❌ | ❌ | ✅ |
| Miễn phạt | ❌ | ✅ | ❌ | ❌ | ✅ |
| Duyệt đơn nghỉ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Cấu hình quota | ❌ | ❌ | ❌ | ✅ | ✅ |
| Phân quyền user | ❌ | ❌ | ❌ | ❌ | ✅ |

### 6.2 1 user nhiều vai trò

**JWT claims:**
```json
{
  "sub": "user-uuid",
  "roles": ["manager", "accountant"],
  "email": "a@company.com"
}
```

**UI render menu:** Union tất cả permissions của các roles.

**API check:**
```sql
-- Kiểm tra user có role accountant không
auth.jwt() -> 'roles' ? 'accountant'

-- Kiểm tra có bất kỳ role nào trong danh sách
auth.jwt() -> 'roles' ?| array['manager', 'admin']
```

> **Hint thay thế:** Nếu dùng Node.js: `req.user.roles.includes('accountant')`. Nếu dùng Firebase: `request.auth.token.roles.includes('accountant')`.

---

## 7. API Endpoints

| Method | Path | Mô tả | Auth |
|--------|------|-------|------|
| `GET` | `/rest/v1/unmatched_transactions` | Danh sách chưa khớp | Accountant/Manager |
| `POST` | `/rest/v1/rpc/match_unmatched` | Khớp thủ công | Accountant/Manager |
| `POST` | `/rest/v1/rpc/refund_unmatched` | Hoàn tiền | Accountant/Manager |
| `POST` | `/rest/v1/rpc/ignore_unmatched` | Bỏ qua | Accountant/Manager |
| `POST` | `/rest/v1/rpc/create_withdraw_request` | Tạo yêu cầu rút | Accountant/Manager |
| `POST` | `/rest/v1/rpc/approve_withdraw` | Duyệt rút | Manager/Admin |
| `POST` | `/rest/v1/rpc/reject_withdraw` | Từ chối rút | Manager/Admin |
| `POST` | `/rest/v1/rpc/manual_deposit` | Nạp quỹ | Accountant/Manager |
| `POST` | `/rest/v1/rpc/report_monthly` | Báo cáo tháng | Accountant/Manager |
| `POST` | `/rest/v1/rpc/report_by_employee` | Báo cáo theo NV | Accountant/Manager |
| `GET` | `/rest/v1/withdraw_requests` | Danh sách yêu cầu rút | Accountant/Manager |
| `GET` | `/rest/v1/fund_transactions` | Danh sách giao dịch (đã có Phase 2) | Accountant/Manager |

---

## 8. Test Case

| ID | Mô tả | Input | Expected |
|----|-------|-------|----------|
| **P4-01** | MATCH_MANUAL thành công | Unmatched TICKET_NOT_FOUND, chọn phiếu UNPAID, lý do đủ | Phiếu PAID, quỹ +amount, unmatched resolved, audit log ghi |
| **P4-02** | MATCH_MANUAL thiếu lý do | Lý do "Khớp" (4 ký tự) | UI block, API 400 |
| **P4-03** | MATCH_MANUAL phiếu đã PAID | Chọn phiếu status = PAID | API lỗi "Ticket not UNPAID" |
| **P4-04** | REFUND unmatched | Unmatched AMOUNT_MISMATCH, hoàn 20k, lý do đủ | Tạo EXPENSE transaction, unmatched resolved, balance giảm |
| **P4-05** | IGNORE unmatched | Lý do "Giao dịch lạc" | Unmatched resolved = true, không tạo fund transaction |
| **P4-06** | Tạo yêu cầu rút < threshold | 500k, lý do đủ | Status = PENDING, 1 manager duyệt → COMPLETED + transaction |
| **P4-07** | Tạo yêu cầu rút > threshold | 2 triệu, lý do đủ | Status = PENDING, manager 1 duyệt → APPROVED, chờ manager 2 |
| **P4-08** | Rút quỹ vượt balance | Balance 500k, yêu cầu 600k | API lỗi "Amount exceeds current balance" |
| **P4-09** | Manager 2 duyệt yêu cầu > threshold | Yêu cầu 2 triệu đã có approver_1 | Status = COMPLETED, transaction tạo, balance giảm |
| **P4-10** | Cùng 1 manager duyệt 2 lần | Manager A đã là approver_1, lại bấm duyệt | API lỗi "Already approved by you" |
| **P4-11** | Từ chối yêu cầu rút | Manager bấm từ chối, nhập lý do | Status = REJECTED, không tạo transaction |
| **P4-12** | Nạp quỹ thủ công | 1 triệu, lý do "Nộp tiền mặt cuối tháng" | Tạo INCOME transaction, balance tăng, audit log ghi |
| **P4-13** | Báo cáo tháng 8/2026 | Query report_monthly(2026, 8) | Trả về đúng tổng thu/chi/số dư/giao dịch |
| **P4-14** | Export báo cáo tháng | Client generate Excel | File tải về đúng format, đủ cột |
| **P4-15** | User role = ACCOUNTANT thử miễn phạt | Gọi API waive | 403 Forbidden (không có quyền) |
| **P4-16** | User có 2 roles [MANAGER, ACCOUNTANT] | Login | JWT chứa `roles: ["manager", "accountant"]`, UI hiện cả 2 menu |
| **P4-17** | Hoàn tiền tracking | Refund 20k cho unmatched | `refund_transaction_id` link đúng, có thể trace từ unmatched → fund → audit |
| **P4-18** | Realtime: manager nhận yêu cầu rút mới | Accountant tạo yêu cầu 2 triệu | Manager PWA hiện toast + badge số yêu cầu pending +1 |
| **P4-19** | Realtime: accountant nhận kết quả duyệt | Manager duyệt yêu cầu | Accountant PWA hiện toast "Yêu cầu rút 2 triệu đã được duyệt" |
| **P4-20** | Audit log cho withdraw | Manager duyệt rút 500k | `action = APPROVE_WITHDRAW`, old_value = PENDING, new_value = COMPLETED |

---

## 9. Tóm tắt kiến trúc Phase 4

```
Accountant (PWA)
    ├── Xử lý unmatched: MATCH / REFUND / IGNORE
    ├── Tạo yêu cầu rút quỹ
    ├── Nạp tiền vào quỹ
    ├── Xem báo cáo tài chính
    └── Export Excel

Manager (PWA Admin)
    ├── Duyệt / Từ chối yêu cầu rút quỹ
    ├── Duyệt 2 lần nếu > threshold
    └── Xem tất cả báo cáo

Supabase
    ├── PostgreSQL: fund_transactions (mở rộng), unmatched_transactions (mở rộng),
    │               withdraw_requests (mới), user_roles (mới)
    ├── Realtime: push withdraw request mới → Manager
    │             push withdraw approved → Accountant
    ├── RPC: match_unmatched, refund_unmatched, ignore_unmatched,
    │        create_withdraw_request, approve_withdraw, reject_withdraw,
    │        manual_deposit, report_monthly, report_by_employee, report_by_branch
    ├── RLS: Accountant/Manager/Admin xem quỹ, Staff không xem
    └── Storage: Ảnh hóa đơn rút/nạp quỹ
```

---

> **Phase 4 HOÀN THÀNH.**  
> **Sẵn sàng cho Phase 5: Advanced & Polish** khi bạn yêu cầu.
