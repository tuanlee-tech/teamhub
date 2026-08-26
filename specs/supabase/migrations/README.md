**Database schema SQL tổng hợp toàn bộ 5 Phase** , bao gồm schema, RLS, indexes, views, và functions.

📄 [**001_initial_schema.sql**](migrations/001_initial_schema.sql)

---

## Tóm tắt schema (27 bảng + 2 views + 14 RPC)

### Phase 1 — Core Check-in (8 bảng)
| Bảng | Mục đích |
|------|----------|
| `users` | Nhân viên + grade (INTERN→DIRECTOR); role chính, multi-role qua `user_roles` |
| `titles` | Danh hiệu hệ thống |
| `office_locations` | Tọa độ văn phòng + bán kính |
| `checkins` | Bản ghi check-in GPS/Tablet/Manual — unique 1 record/user/ngày (`uq_checkins_user_day`) |
| `tablet_tokens` | QR + OTP 60 giây, 30 giây refresh |
| `late_tiers` | Cấu hình phạt đi trễ động |
| `fraud_rules` | Cấu hình phạt gian lận động |
| `settings` | `checkin_deadline`, `tablet_start/end`, version keys, `withdraw_threshold` |

> **Đã xóa (26/08/2026):** bảng legacy `penalties` — mọi phạt ghi vào `penalty_tickets`.

### Phase 2 — Payment & Fund (9 bảng)
| Bảng | Mục đích |
|------|----------|
| `payment_settings` | STK, bank, prefix, VA code |
| `penalty_tickets` | 4 trạng thái: `UNPAID/PAID/WAIVED/CASH_PAID` |
| `fund_transactions` | INCOME/EXPENSE, 6 nguồn |
| `sepay_webhook_logs` | Dedup `sepay_id` |
| `unmatched_transactions` | Đối soát: `NO_TRANSACTION_ID/TICKET_NOT_FOUND/AMOUNT_MISMATCH` |
| `audit_logs` | Append-only, diff JSONB |
| `event_timelines` | Travel time cho mỗi entity |
| `system_logs` | 5 level × 6 category |
| `client_logs` | PWA gửi lỗi về |

### Phase 3 — Leave Management (4 bảng)
| Bảng | Mục đích |
|------|----------|
| `leave_types_config` | 6 loại nghỉ + màu calendar (seed sẵn) |
| `leave_quotas` | Annual + remote + carry_over (generated column) |
| `leave_requests` | 6 trạng thái workflow |
| `leave_request_comments` | Trao đổi trên đơn |

### Phase 4 — Accounting (2 bảng)
| Bảng | Mục đích |
|------|----------|
| `withdraw_requests` | Threshold + 2 approver |
| `user_roles` | 1 user nhiều vai |

### Phase 5 — Advanced (4 bảng)
| Bảng | Mục đích |
|------|----------|
| `notifications` | 3 kênh: push/in-app/email |
| `user_preferences` | Theme, language, sound, push |
| `user_push_tokens` | FCM token theo platform |
| `login_attempts` | Brute force tracking |

### Views
- `fund_balance_total` — Tổng thu/chi/số dư toàn bộ
- `fund_balance_by_branch` — Theo chi nhánh (HN/HCM/ALL)

### 15 RPC Functions
`process_payment` · `waive_penalty` · `cash_payment` · `check_leave_quota` · `approve_leave` · `reject_leave` · `should_skip_penalty` · `match_unmatched` · `refund_unmatched` · `create_withdraw_request` · `approve_withdraw` · `manual_deposit` · `report_monthly` · `update_updated_at_column`

### Bảo mật
- **RLS** bật cho cả 27 bảng
- **Policies** theo role: staff/manager/accountant/hr/admin
- **Helper** `auth_has_role()` để check mảng roles trong JWT
- **Business RPC**: SECURITY DEFINER + role-guard bên trong; client write trực tiếp vào bảng nhạy cảm bị RLS deny
- **`vn_date()`**: helper IMMUTABLE cho unique index check-in theo ngày (+07)

### Cách dùng
```bash
# Local
supabase start
supabase db reset
# Paste nội dung file vào SQL Editor hoặc:
psql -h localhost -p 54322 -d postgres -f 001_initial_schema.sql

# Production
supabase link --project-ref <ref>
supabase db push
```
