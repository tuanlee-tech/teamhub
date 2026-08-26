# Open Questions & Decision Log — TeamHub

> Sổ theo dõi tập trung. Mọi OPEN QUESTION phải được giải quyết bởi **human** trước khi
> implement luồng liên quan. Agent KHÔNG được tự quyết rồi code.
> Quy ước: FACT = có bằng chứng trực tiếp · INFERENCE = suy luận hợp lý · OQ = chưa đủ thông tin.

---

## 1. Decision Log (đã chốt)

| Ngày | ID | Quyết định | Phạm vi ảnh hưởng |
|------|----|-----------|-------------------|
| 26/08/2026 | D-01 | **Xóa hẳn bảng legacy `penalties`** khỏi schema/seed/test/docs. Bảng phạt canonical duy nhất: `penalty_tickets`. `transaction_id` (NOT NULL UNIQUE) sinh ngay lúc tạo phiếu. | 001_initial_schema.sql, seed.sql, rls_test_queries.sql, phase1 §7.8, phase2 §1.2, README |
| 26/08/2026 | D-02 | **Role model multi-role-ready từ đầu**: JWT claim = mảng `roles[]`; `user_roles` là nguồn truth; `users.role` chỉ là role chính. Phase 1 chỉ cấp `staff` / `manager` (mỗi user 1 dòng user_roles). Role `accountant`/`hr`/`admin` reserved trong schema, kích hoạt P4/P5 — **không đổi schema sau này**. | phase1 §6.4, mọi RLS snippet, codebase-decision §5.3 |
| 26/08/2026 | D-03 | **Sửa trực tiếp specs/** (kể cả SQL) vì chưa có môi trường nào apply migration. Từ thời điểm apply thật: quy tắc "không sửa applied migration, tạo 002+" có hiệu lực. | Toàn bộ specs/supabase |
| 26/08/2026 | D-04 | Business RPC ghi dữ liệu nhạy cảm = `SECURITY DEFINER` + `SET search_path = public` + role-guard bên trong; client write trực tiếp bị RLS deny; webhook/cron dùng service_role. | 001 (9 RPC), codebase-decision §5.2/§5.4 |
| 26/08/2026 | D-05 | Half-day nghỉ phép chiếm đúng 0.5 ngày: cột used/remaining → `NUMERIC(5,1)`; carry-over cap theo grade (JUNIOR=3, còn lại=5). | leave_quotas, approve_leave, cron SQL |
| 26/08/2026 | D-06 | Anti-replay check-in ngày: unique index `uq_checkins_user_day (user_id, vn_date(created_at))`, timezone chuẩn `Asia/Ho_Chi_Minh`. | checkins, phase1 Rule 3 |

## 2. Open Questions (chưa quyết — chặn luồng tương ứng)

### OQ-01 · Tablet authentication ⛔ chặn T3.2/TBL-*
- **Vấn đề:** Test TBL-07 yêu cầu từ chối `tablet_id` không hợp lệ, nhưng schema không có
  bảng registry tablet và chưa định nghĩa cơ chế xác thực thiết bị tablet (JWT? API key?).
- **Cần quyết:** cách tablet authenticate + nơi lưu danh sách tablet hợp lệ.

### OQ-02 · Nonce storage (anti-replay GPS) ⛔ chặn submit_checkin_gps
- **Vấn đề:** Phase 1 Rule 1 yêu cầu lưu nonce đã dùng (TTL 5 phút) nhưng schema không có
  bảng nonces; phase 5 gợi ý Upstash Redis.
- **Cần quyết:** bảng DB (`checkin_nonces`) hay Redis/Upstash free-tier?

### OQ-03 · remote_quota monthly hay yearly? ⚠️ chặn luồng REMOTE của Phase 3
- **Vấn đề:** Docs mô tả "3/tháng" nhưng `leave_quotas` lưu theo năm và `approve_leave`
  cộng dồn vào `remote_used` của năm.
- **Cần quyết:** giữ semantics yearly (đổi docs) hay thêm truy đếm theo tháng (đổi logic).

### OQ-04 · Staff đọc settings cho UI?
- **Vấn đề:** RLS `settings` chỉ cho manager/admin. User thường có cần đọc
  `checkin_deadline`/`tablet_start` để hiển thị UI ("Chưa đến giờ check-in")?
- **Cần quyết:** expose subset qua view/RPC public-read, hay server tự tính toàn bộ.

### OQ-05 · Timezone convention chính thức
- **Vấn đề:** Seed/spec dùng `+07`; `vn_date()` ghim `Asia/Ho_Chi_Minh`; cần xác nhận
  DB session timezone (`supabase config.toml` / connection param) đặt nhất quán.
- **Cần quyết:** confirm khi setup Supabase local (task T0.1).

## 3. Lưu ý bảo mật còn mở (review ở security gate)
- Sepay test payload `id = 0` skip HMAC verify (phase2 Part 2) — ai cũng POST được
  `{"id":0}` để probe endpoint. Cần giới hạn bằng env flag (chỉ bật ở dev).
- Rate limiting đầy đủ thuộc Phase 5 — trước đó chỉ dựa HMAC + dedup.
