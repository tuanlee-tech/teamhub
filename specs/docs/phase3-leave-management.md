# Phase 3: Leave Management — Chi tiết

> **Techstack:** Supabase (PostgreSQL, Realtime, Edge Functions, Auth, RLS, Storage)  
> **Nguyên tắc:** Mọi action duyệt/từ chối đều bắt buộc audit trail. Realtime push kết quả về user. Quota tự động kiểm tra trước khi submit.

---

## 1. Data Model

### 1.1 `leave_requests` (Bảng chính)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | |
| `user_id` | UUID | FK → users, NOT NULL | Người tạo đơn |
| `type` | VARCHAR(30) | NOT NULL | `FULL_DAY`, `HALF_DAY_AM`, `HALF_DAY_PM`, `REMOTE`, `LATE_ARRIVAL`, `EARLY_LEAVE` |
| `status` | VARCHAR(20) | DEFAULT 'DRAFT' | `DRAFT` / `PENDING` / `APPROVED` / `REJECTED` / `CANCELLED` / `REQUEST_INFO` |
| `start_date` | DATE | NOT NULL | Ngày bắt đầu |
| `end_date` | DATE | NOT NULL | Ngày kết thúc (có thể = start_date) |
| `reason` | TEXT | NOT NULL | Lý do xin nghỉ |
| `attachment_url` | TEXT | nullable | Link ảnh minh chứng (Storage) |
| `approver_id` | UUID | FK → users, nullable | Người duyệt cuối |
| `approved_at` | TIMESTAMPTZ | nullable | |
| `rejected_reason` | TEXT | nullable | Lý do từ chối (bắt buộc khi REJECTED) |
| `requested_info` | TEXT | nullable | Yêu cầu bổ sung từ approver |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |

**RLS:**
```sql
-- User xem đơn của mình
CREATE POLICY "User view own leave" ON leave_requests FOR SELECT
USING (auth.uid() = user_id);

-- Manager xem đơn của team (giả sử có cột manager_id trong users hoặc dùng department)
CREATE POLICY "Manager view team leave" ON leave_requests FOR SELECT
USING (auth.jwt() ->> 'role' = 'manager');

-- HR xem tất cả
CREATE POLICY "HR view all leave" ON leave_requests FOR SELECT
USING (auth.jwt() ->> 'role' = 'hr');

-- User chỉ được INSERT/PATCH đơn của mình (DRAFT/PENDING/CANCELLED)
CREATE POLICY "User manage own leave" ON leave_requests FOR ALL
USING (auth.uid() = user_id AND status IN ('DRAFT', 'PENDING'));
```

> **Hint thay thế:** Nếu dùng Node.js/Express: middleware `requireOwnershipOrRole('leave_requests', 'user_id', ['manager', 'hr'])`. Nếu dùng Firebase: Firestore rules `allow read: if request.auth.uid == resource.data.user_id || request.auth.token.role in ['manager', 'hr']`.

---

### 1.2 `leave_quotas` (Quota theo năm)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | |
| `user_id` | UUID | FK → users, NOT NULL | |
| `year` | INT | NOT NULL | Ví dụ: 2026 |
| `annual_quota` | INT | DEFAULT 12 | Tổng ngày nghỉ năm |
| `annual_used` | INT | DEFAULT 0 | Đã dùng |
| `annual_remaining` | INT | GENERATED | `annual_quota + carry_over - annual_used` |
| `remote_quota` | INT | DEFAULT 3 | Tổng remote tháng (hoặc tách bảng riêng) |
| `remote_used` | INT | DEFAULT 0 | |
| `carry_over` | INT | DEFAULT 0 | Ngày tích lũy từ năm trước (max 5) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |

**Generated column:**
```sql
annual_remaining INT GENERATED ALWAYS AS (annual_quota + carry_over - annual_used) STORED;
```

**RLS:** User chỉ xem quota của mình. Manager/HR xem tất cả.

---

### 1.3 `leave_types_config` (Cấu hình loại nghỉ)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `type` | VARCHAR(30) | `FULL_DAY`, `HALF_DAY_AM`, ... |
| `name_vi` | VARCHAR(100) | "Nghỉ cả ngày" |
| `affects_checkin` | BOOLEAN | Có ảnh hưởng check-in không |
| `requires_approval` | BOOLEAN | Có cần duyệt không |
| `max_days` | INT | Tối đa mỗi lần xin |
| `color` | VARCHAR(7) | Mã màu calendar `#FF6B6B` |

> **Hint thay thế:** Nếu dùng MongoDB: 1 document `leaveTypeConfig`. Nếu dùng Firebase: 1 document trong `configs/leaveTypes`.

---

### 1.4 `leave_request_comments` (Trao đổi trên đơn)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `leave_request_id` | UUID | FK |
| `user_id` | UUID | FK → users (người comment) |
| `content` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

---

## 2. Loại đơn xin nghỉ

### 2.1 Bảng loại nghỉ & ảnh hưởng

| Loại | Tên | Ảnh hưởng check-in | Cần duyệt | Quota |
|------|-----|---------------------|-----------|-------|
| `FULL_DAY` | Nghỉ cả ngày | Không hiện nút check-in, không penalty | ✅ | annual_quota |
| `HALF_DAY_AM` | Nghỉ buổi sáng | Sáng: không check-in. Chiều: check-in bình thường | ✅ | 0.5 ngày annual |
| `HALF_DAY_PM` | Nghỉ buổi chiều | Sáng: check-in bình thường. Chiều: không check-out penalty | ✅ | 0.5 ngày annual |
| `REMOTE` | Làm việc từ xa | Check-in GPS (radius lỏng hoặc bỏ qua radius), không penalty nếu trong giờ | ✅ | remote_quota |
| `LATE_ARRIVAL` | Xin đi trễ | Check-in sau deadline không tạo penalty nếu duyệt | ✅ | Không tính quota |
| `EARLY_LEAVE` | Xin về sớm | Rời trước giờ không tạo penalty nếu duyệt | ✅ | Không tính quota |

### 2.2 UI tạo đơn (User)

```
PWA → Tab "Nghỉ phép" → Bấm "Tạo đơn mới"
    ↓
Form:
  - Loại nghỉ: Dropdown (6 option, có mô tả)
  - Từ ngày: Date picker
  - Đến ngày: Date picker (mặc định = từ ngày, disabled nếu HALF_DAY)
  - Lý do: Textarea (bắt buộc, min 10 ký tự)
  - Minh chứng: Upload ảnh (tùy chọn, tối đa 3 ảnh)
    ↓
Bấm "Kiểm tra quota" → Hiển thị:
  - "Bạn còn 8/12 ngày nghỉ năm"
  - "Bạn còn 2/3 ngày remote tháng này"
    ↓
Nếu đủ quota → Bấm "Gửi đơn" → status = PENDING
Nếu không đủ → Báo lỗi, không cho submit
```

**Validation client:**
- `end_date` >= `start_date`
- `HALF_DAY_AM/PM` → `end_date` phải = `start_date`
- `reason` >= 10 ký tự
- `start_date` >= hôm nay (không xin nghỉ quá khứ, trừ LATE_ARRIVAL có thể xin trong ngày)

---

## 3. Quota nghỉ phép

### 3.1 Cấp bậc & Quota mặc định

| Cấp bậc | `annual_quota` | `remote_quota/tháng` | `carry_over_max` |
|---------|---------------|---------------------|------------------|
| `INTERN` | 0 | 0 | 0 |
| `JUNIOR` | 12 | 3 | 3 |
| `SENIOR` | 15 | 5 | 5 |
| `MANAGER` | 18 | 5 | 5 |
| `DIRECTOR` | 20 | Không giới hạn | 5 |

**Cấu hình trong `user_profiles`:**
```sql
ALTER TABLE users ADD COLUMN grade VARCHAR(20) DEFAULT 'JUNIOR';
ALTER TABLE users ADD COLUMN joined_date DATE;
```

### 3.2 Tự động tạo quota đầu năm

**Edge Function cron (chạy 1/1 hàng năm):**
```sql
-- Tạo quota mới cho tất cả user active
INSERT INTO leave_quotas (user_id, year, annual_quota, carry_over, remote_quota)
SELECT 
  id,
  EXTRACT(YEAR FROM CURRENT_DATE),
  CASE grade 
    WHEN 'INTERN' THEN 0
    WHEN 'JUNIOR' THEN 12
    WHEN 'SENIOR' THEN 15
    WHEN 'MANAGER' THEN 18
    WHEN 'DIRECTOR' THEN 20
  END,
  LEAST(
    (SELECT annual_remaining FROM leave_quotas lq 
     WHERE lq.user_id = users.id AND lq.year = EXTRACT(YEAR FROM CURRENT_DATE) - 1),
    5
  ),
  CASE grade
    WHEN 'INTERN' THEN 0
    WHEN 'JUNIOR' THEN 3
    ELSE 5
  END
FROM users
WHERE is_active = true
ON CONFLICT (user_id, year) DO NOTHING;
```

> **Hint thay thế:** Nếu dùng Node.js: cron job `node-cron` chạy 1/1. Nếu dùng Firebase: Cloud Scheduler trigger Cloud Function. Nếu dùng AWS: EventBridge + Lambda.

### 3.3 Kiểm tra quota trước khi submit

**RPC: `check_leave_quota`**
```sql
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
  v_requested_days INT;
  v_year INT;
BEGIN
  v_year := EXTRACT(YEAR FROM p_start_date);
  v_requested_days := p_end_date - p_start_date + 1;

  SELECT * INTO v_quota FROM leave_quotas 
  WHERE user_id = p_user_id AND year = v_year;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Quota not found');
  END IF;

  -- FULL_DAY / HALF_DAY check annual quota
  IF p_type IN ('FULL_DAY', 'HALF_DAY_AM', 'HALF_DAY_PM') THEN
    IF p_type LIKE 'HALF_DAY%' THEN
      v_requested_days := 0.5;
    END IF;

    IF v_quota.annual_remaining < v_requested_days THEN
      RETURN jsonb_build_object(
        'valid', false, 
        'error', 'Insufficient annual quota',
        'remaining', v_quota.annual_remaining,
        'requested', v_requested_days
      );
    END IF;
  END IF;

  -- REMOTE check monthly remote quota
  IF p_type = 'REMOTE' THEN
    -- Đếm số ngày remote đã dùng trong tháng
    IF v_quota.remote_used >= v_quota.remote_quota THEN
      RETURN jsonb_build_object(
        'valid', false,
        'error', 'Insufficient remote quota for this month',
        'remaining', v_quota.remote_quota - v_quota.remote_used
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('valid', true, 'remaining', v_quota.annual_remaining);
END;
$$;
```

---

## 4. Workflow duyệt đơn

### 4.1 State machine

```
                    ┌─────────────┐
                    │   DRAFT     │
                    │  (User tạo) │
                    └──────┬──────┘
                           │ submit
                           ▼
                    ┌─────────────┐     ┌─────────────┐
         ┌─────────│   PENDING   │◄────│  CANCELLED  │
         │         │ (Chờ duyệt) │     │ (User hủy)  │
         │         └──────┬──────┘     └─────────────┘
         │                │
    reject + lý do   approve
         │                │
         ▼                ▼
┌─────────────┐    ┌─────────────┐
│  REJECTED   │    │  APPROVED   │
│ (Kèm lý do) │    │ (Quota -1)  │
└─────────────┘    └─────────────┘
         ▲
         │ request_info
         │
    ┌─────────────┐
    │ REQUEST_INFO│
    │(Cần bổ sung)│
    └──────┬──────┘
           │ user cập nhật
           └────────────────┘
```

### 4.2 Manager duyệt / từ chối

**Màn hình Manager:**
```
Tab "Duyệt nghỉ phép"
    ↓
Danh sách đơn PENDING (theo thời gian, mới nhất lên đầu)
    ↓
Click đơn → Chi tiết:
  - Thông tin nhân viên (avatar, tên, grade, số ngày còn lại)
  - Loại nghỉ, ngày, lý do
  - Ảnh minh chứng (nếu có)
  - Lịch team trong khoảng thời gian đó (để xem có ai nghỉ trùng không)
    ↓
3 nút action:
  [✅ Duyệt]  [❌ Từ chối]  [💬 Yêu cầu bổ sung]
    ↓
Nếu Từ chối → Popup bắt buộc nhập lý do (min 10 ký tự)
Nếu Yêu cầu bổ sung → Popup nhập yêu cầu
```

### 4.3 RPC: approve_leave

```sql
CREATE OR REPLACE FUNCTION approve_leave(
  p_request_id UUID,
  p_approver_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_req RECORD;
  v_quota RECORD;
  v_days NUMERIC;
BEGIN
  SELECT * INTO v_req FROM leave_requests 
  WHERE id = p_request_id AND status = 'PENDING' 
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found or not pending');
  END IF;

  -- Tính số ngày
  v_days := v_req.end_date - v_req.start_date + 1;
  IF v_req.type LIKE 'HALF_DAY%' THEN
    v_days := 0.5;
  END IF;

  -- Update request
  UPDATE leave_requests 
  SET status = 'APPROVED', approver_id = p_approver_id, approved_at = NOW(), updated_at = NOW()
  WHERE id = p_request_id;

  -- Trừ quota (nếu cần)
  IF v_req.type IN ('FULL_DAY', 'HALF_DAY_AM', 'HALF_DAY_PM') THEN
    UPDATE leave_quotas 
    SET annual_used = annual_used + v_days, updated_at = NOW()
    WHERE user_id = v_req.user_id AND year = EXTRACT(YEAR FROM v_req.start_date);
  ELSIF v_req.type = 'REMOTE' THEN
    UPDATE leave_quotas
    SET remote_used = remote_used + v_days, updated_at = NOW()
    WHERE user_id = v_req.user_id AND year = EXTRACT(YEAR FROM v_req.start_date);
  END IF;

  -- Audit log
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, old_value, new_value, reason, created_at)
  VALUES (p_approver_id, 'APPROVE_LEAVE', 'LEAVE_REQUEST', p_request_id,
    jsonb_build_object('status', 'PENDING'),
    jsonb_build_object('status', 'APPROVED', 'approver_id', p_approver_id),
    'Approved leave request', NOW());

  -- Timeline
  INSERT INTO event_timelines (entity_type, entity_id, event, actor_id, source, created_at)
  VALUES ('LEAVE_REQUEST', p_request_id, 'APPROVED', p_approver_id, 'MANAGER', NOW());

  RETURN jsonb_build_object('success', true);
END;
$$;
```

### 4.4 RPC: reject_leave

```sql
CREATE OR REPLACE FUNCTION reject_leave(
  p_request_id UUID,
  p_approver_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_req RECORD;
BEGIN
  IF LENGTH(TRIM(p_reason)) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reason must be at least 10 characters');
  END IF;

  SELECT * INTO v_req FROM leave_requests 
  WHERE id = p_request_id AND status = 'PENDING' 
  FOR UPDATE;

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

  INSERT INTO event_timelines (entity_type, entity_id, event, actor_id, source, created_at)
  VALUES ('LEAVE_REQUEST', p_request_id, 'REJECTED', p_approver_id, 'MANAGER', NOW());

  RETURN jsonb_build_object('success', true);
END;
$$;
```

> **Hint thay thế:** Nếu dùng Node.js: dùng `BEGIN ... COMMIT` transaction, `SELECT FOR UPDATE` để lock row. Nếu dùng Firebase: `runTransaction` để update `leaveRequest` + `leaveQuota` + tạo `auditLog` document cùng lúc.

---

## 5. Tích hợp check-in — Tránh penalty oan

### 5.1 Logic trong cron tạo penalty (mở rộng Phase 1)

```sql
-- Trước khi tạo penalty cho user X vào ngày Y, kiểm tra:
CREATE OR REPLACE FUNCTION should_skip_penalty(
  p_user_id UUID,
  p_date DATE,
  p_time TIME
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1. Nghỉ cả ngày
  IF EXISTS (
    SELECT 1 FROM leave_requests
    WHERE user_id = p_user_id AND status = 'APPROVED'
      AND type = 'FULL_DAY'
      AND p_date BETWEEN start_date AND end_date
  ) THEN
    RETURN true;
  END IF;

  -- 2. Nghỉ buổi sáng, đang check-in buổi sáng
  IF p_time < '12:00:00' AND EXISTS (
    SELECT 1 FROM leave_requests
    WHERE user_id = p_user_id AND status = 'APPROVED'
      AND type = 'HALF_DAY_AM' AND p_date BETWEEN start_date AND end_date
  ) THEN
    RETURN true;
  END IF;

  -- 3. Nghỉ buổi chiều, đang check-out buổi chiều
  IF p_time >= '12:00:00' AND EXISTS (
    SELECT 1 FROM leave_requests
    WHERE user_id = p_user_id AND status = 'APPROVED'
      AND type = 'HALF_DAY_PM' AND p_date BETWEEN start_date AND end_date
  ) THEN
    RETURN true;
  END IF;

  -- 4. Remote (vẫn cho check-in nhưng không penalty về location)
  IF EXISTS (
    SELECT 1 FROM leave_requests
    WHERE user_id = p_user_id AND status = 'APPROVED'
      AND type = 'REMOTE' AND p_date BETWEEN start_date AND end_date
  ) THEN
    RETURN true; -- Hoặc return false nhưng bỏ qua GPS radius check
  END IF;

  -- 5. Xin đi trễ đã duyệt
  IF EXISTS (
    SELECT 1 FROM leave_requests
    WHERE user_id = p_user_id AND status = 'APPROVED'
      AND type = 'LATE_ARRIVAL' AND p_date BETWEEN start_date AND end_date
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
```

### 5.2 UI check-in khi có đơn APPROVED

- Nếu `FULL_DAY` → Ẩn hoàn toàn nút "Check-in", hiện badge "Bạn đang nghỉ phép".
- Nếu `HALF_DAY_AM` → Buổi sáng ẩn nút, buổi chiều hiện bình thường.
- Nếu `REMOTE` → Hiện nút "Check-in từ xa", GPS radius lỏng hơn (hoặc không check radius).
- Nếu `LATE_ARRIVAL` → Hiện nút bình thường, nhưng cron không tạo penalty dù sau deadline.

---

## 6. Calendar view & Export

### 6.1 Calendar API

```sql
-- Lấy tất cả đơn nghỉ trong tháng (cho manager xem team)
SELECT 
  lr.*,
  u.full_name,
  u.avatar_url,
  ltc.color
FROM leave_requests lr
JOIN users u ON lr.user_id = u.id
JOIN leave_types_config ltc ON lr.type = ltc.type
WHERE lr.status = 'APPROVED'
  AND lr.start_date <= '2026-08-31' AND lr.end_date >= '2026-08-01'
  AND u.department_id = 'dept-hn-dev'; -- filter theo team
```

### 6.2 UI Calendar

```
Tháng 8/2026
┌────┬────┬────┬────┬────┬────┬────┐
│ T2 │ T3 │ T4 │ T5 │ T6 │ T7 │ CN │
├────┼────┼────┼────┼────┼────┼────┤
│    │    │    │    │  1 │  2 │  3 │
│    │    │    │    │ 🟢 │ 🟢 │    │
├────┼────┼────┼────┼────┼────┼────┤
│  4 │  5 │  6 │  7 │  8 │  9 │ 10 │
│    │ 🔴 │ 🔴 │    │ 🟡 │    │    │
└────┴────┴────┴────┴────┴────┴────┘

🟢 Nguyễn Văn A — Remote
🔴 Trần Thị B — Nghỉ cả ngày
🟡 Lê Văn C — Nghỉ buổi sáng
```

**Click ngày → popup danh sách người nghỉ trong ngày đó.**

### 6.3 Export lịch nghỉ tháng

```javascript
// Client-side export Excel
function exportLeaveCalendar(month, year, data) {
  const headers = ['Ngày', 'Nhân viên', 'Loại nghỉ', 'Lý do'];
  // Generate .xlsx using sheetjs
}
```

---

## 7. Nhắc nhở & Thông báo

### 7.1 Nhắc nhở

| Sự kiện | Thời điểm | Người nhận | Nội dung |
|---------|-----------|------------|----------|
| Đơn sắp đến hạn | Trước 3 ngày | User | "Đơn nghỉ ngày 28/08 sắp đến, nhớ bàn giao công việc" |
| Đơn pending quá lâu | Sau 24h chưa duyệt | Manager | "Có 2 đơn nghỉ chờ duyệt quá 24 giờ" |
| Kết quả duyệt | Ngay khi action | User | "Đơn nghỉ 28/08 đã được duyệt" / "bị từ chối: [lý do]" |
| Quota sắp hết | Còn 2 ngày | User | "Bạn còn 2/12 ngày nghỉ năm nay" |

### 7.2 Realtime push

```javascript
// Manager subscribe đơn pending mới
supabase.channel('leave-pending')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leave_requests', filter: 'status=eq.PENDING' }, (payload) => {
    showToast(`📋 ${payload.new.user_name} vừa gửi đơn nghỉ ${payload.new.type}`);
    refreshPendingList();
  })
  .subscribe();

// User subscribe kết quả đơn của mình
supabase.channel(`leave-user-${userId}`)
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leave_requests', filter: `user_id=eq.${userId}` }, (payload) => {
    if (payload.new.status === 'APPROVED') {
      showToast('✅ Đơn nghỉ đã được duyệt!');
    } else if (payload.new.status === 'REJECTED') {
      showToast(`❌ Đơn nghỉ bị từ chối: ${payload.new.rejected_reason}`);
    }
  })
  .subscribe();
```

> **Hint thay thế:** Nếu dùng Node.js + Socket.io: `io.to('managers').emit('new_leave_request', {...})`. Nếu dùng Firebase: FCM push + Firestore listener.

---

## 8. Logging & Audit (Áp dụng từ Phase 2)

### 8.1 Business Timeline cho leave request

| Thời gian | Event | Actor | Source |
|-----------|-------|-------|--------|
| 08/25 09:00 | `CREATED` | User#12 | USER |
| 08/25 09:01 | `SUBMITTED` | User#12 | USER |
| 08/25 14:30 | `APPROVED` | Manager#3 | MANAGER |
| 08/28 08:00 | `CHECKIN_SKIPPED` | System | SYSTEM |
| 08/28 18:00 | `COMPLETED` | System | SYSTEM |

### 8.2 Audit log cho leave

| Action | Bắt buộc lý do? | Ghi khi |
|--------|----------------|---------|
| `APPROVE_LEAVE` | ❌ | Manager duyệt |
| `REJECT_LEAVE` | ✅ (min 10) | Manager từ chối |
| `CANCEL_LEAVE` | ✅ (min 5) | User hủy đơn |
| `REQUEST_INFO_LEAVE` | ❌ | Manager yêu cầu bổ sung |

---

## 9. API Endpoints

| Method | Path | Mô tả | Auth |
|--------|------|-------|------|
| `GET` | `/rest/v1/leave_types_config` | Danh sách loại nghỉ | Public |
| `GET` | `/rest/v1/leave_quotas` | Quota của user | User/Manager/HR |
| `GET` | `/rest/v1/leave_requests` | Danh sách đơn (filter: status, user, date) | User (own) / Manager/HR (all) |
| `POST` | `/rest/v1/leave_requests` | Tạo đơn mới | User |
| `PATCH` | `/rest/v1/leave_requests?id=eq.{id}` | Cập nhật đơn DRAFT | User (own) |
| `POST` | `/rest/v1/rpc/check_leave_quota` | Kiểm tra quota trước submit | User |
| `POST` | `/rest/v1/rpc/approve_leave` | Duyệt đơn | Manager/HR |
| `POST` | `/rest/v1/rpc/reject_leave` | Từ chối đơn | Manager/HR |
| `POST` | `/rest/v1/rpc/cancel_leave` | Hủy đơn | User (own, DRAFT/PENDING) |
| `GET` | `/rest/v1/leave_request_comments` | Comment trên đơn | Liên quan |
| `POST` | `/rest/v1/leave_request_comments` | Thêm comment | User/Manager |

---

## 10. Test Case

| ID | Mô tả | Input | Expected |
|----|-------|-------|----------|
| **P3-01** | Tạo đơn nghỉ cả ngày, đủ quota | `FULL_DAY`, 28/08, lý do đủ 10 ký tự | `status = PENDING`, quota chưa trừ |
| **P3-02** | Tạo đơn, hết quota | `FULL_DAY`, còn 0 ngày | API return lỗi "Insufficient annual quota", không tạo đơn |
| **P3-03** | Tạo đơn HALF_DAY_AM | `HALF_DAY_AM`, 1 ngày | `status = PENDING`, end_date = start_date |
| **P3-04** | Tạo đơn lý do quá ngắn | Lý do "Bệnh" (4 ký tự) | UI block, API 400 |
| **P3-05** | Manager APPROVE đơn | `PENDING` → APPROVE | `status = APPROVED`, `annual_used +1`, audit log ghi, user nhận noti |
| **P3-06** | Manager REJECT đơn, không nhập lý do | Không nhập reason | UI block, API 400 |
| **P3-07** | Manager REJECT đơn, nhập lý do | "Dự án đang gấp deadline" | `status = REJECTED`, `rejected_reason` lưu, audit log ghi, user nhận noti |
| **P3-08** | User hủy đơn DRAFT | `DRAFT` → CANCEL | Đơn chuyển `CANCELLED`, quota không đổi |
| **P3-09** | User hủy đơn đã APPROVED | `APPROVED` → thử cancel | API lỗi "Cannot cancel approved request" |
| **P3-10** | User có đơn APPROVED FULL_DAY → cron không tạo penalty | Check-in ngày đó | `should_skip_penalty = true`, không có penalty record |
| **P3-11** | User HALF_DAY_AM, check-in chiều | Chiều 13:00 check-in | Bình thường, không penalty |
| **P3-12** | User REMOTE, check-in từ nhà | GPS cách văn phòng 5km | Pass (không check radius), không penalty |
| **P3-13** | User LATE_ARRIVAL duyệt, check-in 9:45 | Deadline 9:30 | Không tạo penalty dù sau deadline |
| **P3-14** | Manager xem calendar tháng | Tháng 8/2026 | Hiển thị đúng màu theo loại, đúng người |
| **P3-15** | Export lịch nghỉ tháng | Tháng 8/2026 | File Excel tải về đúng format |
| **P3-16** | Realtime: user nhận kết quả duyệt | Manager approve | PWA user hiện toast "Đơn nghỉ đã được duyệt" ngay lập tức |
| **P3-17** | Realtime: manager nhận đơn mới | User submit đơn | PWA manager hiện toast + badge số đơn pending +1 |
| **P3-18** | Nhắc nhở trước 3 ngày nghỉ | Đơn duyệt ngày 28/08 | Ngày 25/08 user nhận noti nhắc nhở |
| **P3-19** | Nhắc pending quá 24h | Đơn gửi 25/08 09:00 | Ngày 26/09:00 manager nhận noti "2 đơn chờ duyệt quá 24h" |
| **P3-20** | Carry over tự động năm mới | Năm 2026 còn 3 ngày | Năm 2027 quota = 12 + 3 = 15 |
| **P3-21** | Audit log cho approve | Manager approve | `action = APPROVE_LEAVE`, old_value = PENDING, new_value = APPROVED |
| **P3-22** | Business timeline đầy đủ | Đơn từ tạo đến duyệt | Có đủ: CREATED → SUBMITTED → APPROVED → COMPLETED |
| **P3-23** | RLS: user xem đơn người khác | User#123 query đơn User#456 | Trả về empty (hoặc 403 tùy config) |
| **P3-24** | RLS: manager xem đơn team | Manager query | Trả về đơn của team mình |
| **P3-25** | Quota remote tháng | Đã dùng 3/3 remote | Đơn remote thứ 4 bị từ chối với lỗi "Insufficient remote quota" |

---

## 11. Tóm tắt kiến trúc Phase 3

```
User (PWA)
    ├── Tạo đơn nghỉ → kiểm tra quota → submit → PENDING
    ├── Xem lịch nghỉ cá nhân
    ├── Nhận thông báo kết quả duyệt (Realtime)
    └── Check-in (tích hợp: skip penalty nếu có đơn APPROVED)

Manager (PWA Admin)
    ├── Xem danh sách đơn PENDING
    ├── Duyệt / Từ chối / Yêu cầu bổ sung
    ├── Xem calendar team
    ├── Export lịch nghỉ
    └── Nhận nhắc nhở đơn pending quá 24h

Supabase
    ├── PostgreSQL: leave_requests, leave_quotas, leave_types_config, comments
    ├── Realtime: push status update về user + manager
    ├── RPC: check_leave_quota, approve_leave, reject_leave, cancel_leave, should_skip_penalty
    ├── RLS: user own data, manager team, HR all
    └── Edge Function: cron tạo quota đầu năm + nhắc nhở

Cron Jobs
    ├── 1/1 hàng năm: Tạo quota mới + carry over
    └── Hàng ngày 08:00: Nhắc nhở đơn sắp đến hạn + pending quá 24h
```

---

> **Phase 3 HOÀN THÀNH.**  
> **Sẵn sàng cho Phase 4: Accounting & Fund Management** khi bạn yêu cầu.
