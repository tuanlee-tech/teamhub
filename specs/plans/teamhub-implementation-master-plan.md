# KẾ HOẠCH TRIỂN KHAI MASTER TEAMHUB

> Trạng thái: Draft v2, chờ review và phê duyệt.
> Phạm vi tài liệu: kế hoạch thực thi; không thay thế specification, migration hoặc contract đã được phê duyệt.
> Quy tắc: không bắt đầu implementation trước khi plan này được human approval.

## 1. Cơ Sở Lập Kế Hoạch

### 1.1 Mục Tiêu

Xây dựng TEAMHUB từ repository hiện chỉ có specification. Trình tự thực thi phải ưu tiên contract dữ liệu, bảo mật/RLS, RPC và kiểm thử trước khi phát triển màn hình hoặc polish giao diện.

Mục tiêu của kế hoạch này là biến source of truth thành backlog có thứ tự, dependency, gate xác minh và điểm dừng để human approval. Tài liệu này không được dùng để tự ý thay đổi nghiệp vụ hoặc bỏ qua RLS/migration contract.

### 1.2 Nguồn Sự Thật Và Thứ Tự Ưu Tiên

| Thứ tự | Nguồn | Cách dùng |
| --- | --- | --- |
| 1 | Human-approved decisions | Ràng buộc cao nhất. Phải được ghi vào decision log trước coding. |
| 2 | `specs/docs/codebase-decision.md` | Stack, architecture, security, testing và deployment target. |
| 3 | `specs/supabase/migrations/001_initial_schema.sql` | Baseline schema/RLS/RPC trước khi apply vào môi trường thật. |
| 4 | `specs/docs/phase1-core-checkin.md` đến `phase5-advanced-polish.md` | Hành vi theo module và acceptance criteria. |
| 5 | `specs/supabase/rls-test/rls_test_queries.sql`, seed và README | Ý định test, fixture và ghi chú migration. |
| 6 | Skills và suy luận kỹ thuật | Chỉ bổ sung quy trình; không được chống lại các nguồn trên. |

### 1.3 Inventory Hiện Tại

| Nhóm | Artefact | Ý nghĩa |
| --- | --- | --- |
| Architecture | `specs/docs/codebase-decision.md` | Định nghĩa React 18/TypeScript/Vite PWA và Supabase-first architecture. |
| Nghiệp vụ | `specs/docs/phase1-core-checkin.md` | Check-in, tablet, GPS, review và penalty ticket. |
| Nghiệp vụ | `specs/docs/phase2-payment-fund.md` | Payment setting, VietQR, Sepay webhook, fund. |
| Nghiệp vụ | `specs/docs/phase3-leave-management.md` | Leave, quota, approval, calendar và attendance bridge. |
| Nghiệp vụ | `specs/docs/phase4-accounting-fund.md` | Reconciliation, deposit, withdrawal, accounting. |
| Nghiệp vụ | `specs/docs/phase5-advanced-polish.md` | Notification, PWA/offline, export, performance và operational polish. |
| Quyết định | `specs/docs/open-questions.md` | D-01 đến D-06 và các open question cũ. |
| Database | `specs/supabase/migrations/001_initial_schema.sql` | Baseline schema, RLS, functions và constraints. |
| Test | `specs/supabase/rls-test/rls_test_queries.sql` | RLS intent cần chạy bằng non-owner/PostgREST identity. |
| Fixture | `specs/seeds/seed.sql` | Seed phục vụ local/test. |

Repository hiện chưa có product source, `package.json`, Supabase project configuration, CI, deployment configuration hoặc design system. Vì vậy `INF-001` phải tạo skeleton có thể chạy được trước khi làm feature.

### 1.4 Cách Dùng Skills Và Model

| Nguồn | Trách nhiệm bắt buộc |
| --- | --- |
| Graphify | Lập evidence map, dependency graph, migration impact và truy vết source trước khi sửa. |
| GSD | Chia milestone, checkpoint, dependency và human gate. |
| ECC | Giữ scope nhỏ, secure-by-default, test liên quan, evidence-based verification và cleanup. |
| Awesome Design và UI UX Pro Max | Chỉ áp dụng cho UI/frontend sau khi contract backend ổn định. |
| Model routing | Recon nhẹ dùng Gemini Flash; plan/logic/code lớn dùng Terra; patch nhỏ dùng Luna/muse/mimo; escalation dùng Sol; test/CI dùng Nemotron. Không dùng Ox Alpha. |

## 2. Đánh Giá Tổng Quan Và Quyết Định Đã Chốt

### 2.1 Kết Luận Kiến Trúc

TEAMHUB là hệ thống có nhiều trust boundary: employee app, kiosk tablet, manager/HR/admin, Supabase Auth/JWT, Postgres/RLS, Edge Functions, Sepay webhook và cron. Client chỉ được gọi RPC/Edge Function có contract rõ ràng; client không được có quyền ghi trực tiếp vào bảng nghiệp vụ nhạy cảm.

Write path chuẩn:

```text
UI hoặc kiosk -> Auth/session validation -> RPC hoặc Edge Function
  -> role/scope/location validation -> transaction + idempotency + audit
  -> database state thay đổi -> Realtime/notification an toàn
```

### 2.2 Quyết Định Đã Có Trong Source

| ID | Quyết định | Hệ quả bắt buộc |
| --- | --- | --- |
| D-01 | Không còn legacy penalty; `penalty_tickets` là canonical. | Tạo ticket ngay khi vi phạm được xác nhận; `transaction_id` `NOT NULL UNIQUE`. |
| D-02 | `user_roles` là source of truth; `roles[]` là JWT claim; `users.role` là primary role. | Không dựa vào client-side role hoặc stale UI state để cấp quyền. |
| D-03 | Baseline chưa apply có thể sửa; baseline đã apply phải immutable và dùng migration mới. | `GOV-003` phải xác nhận trạng thái trước khi viết SQL. |
| D-04 | Sensitive write dùng guarded `SECURITY DEFINER` RPC và `SET search_path = public`. | Role guard phải nằm trong function; direct client write bị deny. |
| D-05 | Half-day và quota đã có rule cũ trong source. | Được thay thế bởi quyết định quota phút bên dưới sau khi ghi decision log. |
| D-06 | Unique check-in dùng `vn_date(created_at)` theo `Asia/Ho_Chi_Minh`. | Tất cả RPC/check constraint/job phải dùng cùng quy ước business date. |

### 2.3 Quyết Định Human Đã Chốt Trong Phiên Này

Các quyết định dưới đây phải được đồng bộ vào `specs/docs/open-questions.md` hoặc decision record được phê duyệt trong `GOV-002` trước khi implementation dựa vào chúng.

| ID | Quyết định | Contract thực thi |
| --- | --- | --- |
| HD-01 | Tablet là thiết bị đăng ký riêng, không phải Supabase Auth user. | Có registry, location/branch binding, credential secret tách biệt và trạng thái `active`/`inactive`/`revoked`. |
| HD-02 | Credential tablet tạo server-side kiosk session ngắn hạn; QR/OTP do server cấp. | Session token chỉ nằm trong memory; QR/OTP TTL ngắn, one-time consume, revoke tablet/session có hiệu lực ngay. Exact TTL và rotation là config contract cần chốt. |
| HD-03 | GPS nonce dùng PostgreSQL, không thêm Redis ở phase đầu. | Nonce có TTL, consumed state, consume atomically trong transaction/RPC và cleanup bằng scheduler. |
| HD-04 | Role claim tạo bằng server-side access-token hook đọc `user_roles`. | Trigger provision public user; thay role phải revoke/refresh session để quyền cũ không kéo dài. |
| HD-05 | Time lưu UTC `TIMESTAMPTZ`; business date và attendance display explicit `Asia/Ho_Chi_Minh`. | Không dùng server-local timezone hoặc parse client không rõ offset. |
| HD-06 | Staff chỉ đọc safe attendance RPC. | RPC trả `checkin_deadline`, `tablet_start`, `tablet_end`, computed availability; không lộ `auto_absent_at` hoặc sensitive config. |
| HD-07 | Late tier là upper-bound; `PENDING_REVIEW` chặn auto-absent và penalty. | Không cron/auto ticket khi review chưa kết thúc. |
| HD-08 | Scheduler dùng Supabase Cron gọi Edge Function. | Mỗi job phải idempotent, có lock/concurrency control, execution log và retry strategy. |
| HD-09 | Mỗi branch có đúng một payment setting active. | Ticket dùng office branch; nếu không resolve được thì dùng manager-configured `default_branch_code`, có audit. |
| HD-10 | Avatar public; selfie, leave/fund evidence và export private. | Private object chỉ lấy qua signed URL ngắn hạn sau authorization. |
| HD-11 | Withdrawal từ `threshold_amount` trở lên cần hai approver. | Approver khác nhau, transition atomic, có immutable audit. |
| HD-12 | Manager xem leave company-wide; schedule/calendar do manager, HR và admin quản lý. | Có audit cho work intervals, break, AM/PM slots và date overrides. |
| HD-13 | Annual leave quota lưu/trừ theo phút. | FULL_DAY trừ số working minutes của ngày; HALF_DAY trừ 50% daily quota; EARLY_LEAVE tính working minutes còn lại. |
| HD-14 | EARLY_LEAVE không cần checkout. | Employee chọn giờ về theo bước 30 phút; server validate theo schedule và tính quota, không tạo attendance checkout. |
| HD-15 | Work calendar mặc định Mon-Fri, nhưng có date override. | Hỗ trợ holiday, nghỉ ghép, Saturday make-up; Sunday mặc định off; total daily work time không bị ép 480 phút. |
| HD-16 | Nếu thiếu annual quota, manager reject, audited override hoặc unpaid sau employee consent. | Áp dụng cho FULL_DAY, HALF_DAY_AM, HALF_DAY_PM và EARLY_LEAVE. |
| HD-17 | REMOTE quota theo tháng; request cross-month split; half-day REMOTE trừ `0.5`. | Cần schema/validation biểu diễn half-day REMOTE và phân bổ theo từng month. |
| HD-18 | Sepay `id=0` chỉ local development qua env flag mặc định `false`. | Staging/production luôn xác minh HMAC; không có bypass ngẫu nhiên. |
| HD-19 | UI ưu tiên semantic HTML, accessibility và responsive. | Visual polish đợi design source; không tự tạo brand/visual system không có source. |

### 2.4 Các Điểm Cần Reconcile Trước Khi Code

| Phát hiện | Ảnh hưởng | Xử lý trong plan |
| --- | --- | --- |
| `leave_quotas` hiện hướng theo đơn vị ngày và precision cũ không phù hợp quota phút. | Có thể tràn quota năm hoặc không biểu diễn đúng nửa ngày nếu tổng work minutes lẻ. | Dùng đơn vị phút có precision phù hợp, hoặc ràng buộc daily total chia hết cho 2; chốt trong `GOV-003`, không dùng float. |
| Schema chưa có contract đầy đủ cho tablet registry/session, GPS nonce và kiosk challenge. | Kiosk có thể bị biến thành ordinary employee login nếu làm với Auth đơn thuần. | Thêm logical schema/RPC group tablet trước UI kiosk. |
| Work schedule, break interval, AM/PM slot và date override cần cho rule leave mới. | Không thể tính leave/early leave đúng bằng hard-code 8 giờ. | Xây calendar engine trước leave request RPC. |
| Phase/RLS intent và sensitive write architecture có nguy cơ lệch direct table access. | Có thể bypass role guard, audit và state machine. | Chỉ cấp client grant tới safe RPC/view; RLS test phải cover direct deny. |
| Payment setting cần invariant theo branch. | Multiple active setting hoặc fallback mơ hồ làm sai QR/ticket. | Constraint/index + guarded RPC + audit cho activation/default branch. |
| REMOTE half-day chưa có representation schema cụ thể. | UI/API có thể không biết chọn AM/PM hay 0.5 day. | `LEV-002` quy định request field/enum và test cross-month trước implementation. |

## 3. Kế Hoạch Foundation

### 3.1 Nguyên Tắc Foundation

1. Xác nhận baseline migration đã từng apply ở môi trường thật hay chưa trước khi sửa SQL.
2. Thiết lập app shell, typed Supabase boundary, environment validation và test harness trước feature.
3. Tạo identity/role/audit/RLS/RPC contract trước mọi screen có write capability.
4. Tạo storage bucket policy trước khi upload selfie/evidence/export.
5. Mỗi feature merge phải có migration, policy/RPC, unit/integration test và UI state tối thiểu cùng một scope.

### 3.2 Nền Tảng Frontend

| Hạng mục | Phương án |
| --- | --- |
| App shell | React 18 + TypeScript strict + Vite + PWA, layout tách staff/kiosk/manager. |
| Routing | React Router v6; route guard dựa vào server-verified session/claim, không chỉ dựa vào hidden menu. |
| Server state | TanStack Query; invalidate theo mutation thành công và Realtime event đã được scope. |
| Local UI state | Zustand chỉ cho UI/session ephemeral không nhạy cảm; kiosk token không persist localStorage. |
| Form | React Hook Form + Zod, cùng schema/error map với API contract nếu khả thi. |
| UI | Tailwind + Headless UI/Radix; semantic controls, keyboard, focus, error message và responsive first. |
| Error boundary | Route-level error boundary, not-found, loading/skeleton, retry có ý thức cho request idempotent. |

### 3.3 Nền Tảng Supabase

| Layer | Trách nhiệm |
| --- | --- |
| PostgreSQL | Canonical state, constraints, transactional RPC, audit, outbox/job state và business date function. |
| Auth | Employee/manager/HR/admin identity; user provisioning trigger; access-token hook từ `user_roles`. |
| RLS | Default deny trên bảng nghiệp vụ; chỉ capability tới row/function cần thiết. |
| RPC | Entry point cho check-in, leave state transition, payment/fund state transition và protected read. |
| Edge Functions | Tablet session/challenge orchestration nếu cần, Sepay webhook, cron workers, notification/export. |
| Storage | Bucket privacy và signed URL policy; metadata trong database và audit cho evidence. |
| Realtime | Chỉ publish event đã lọc theo tenant/role/row policy; không thay cho query an toàn. |

### 3.4 Logical Data Domains Cần Có

| Domain | Entity/contract mục tiêu | Ghi chú |
| --- | --- | --- |
| Identity | `users`, `user_roles`, profile provisioning, session invalidation | `users.role` là primary role; `user_roles` là source cho JWT `roles[]`. |
| Organization | company, branch, office location, manager setting, `default_branch_code` | Nguồn branch của payment ticket phải deterministic. |
| Audit | append-only audit log, actor, request/correlation id, old/new safe payload | Không ghi secret, raw token hoặc evidence signed URL vào audit. |
| Tablet | tablet registry, credential hash/rotation, kiosk session, QR/OTP challenge | Tablet không tạo `auth.users` record. |
| Attendance | attendance/check-in, GPS nonce, review/anomaly, late tier, `penalty_tickets` | Việt Nam business date và unique check-in per user/day. |
| Work calendar | schedule, working interval, break interval, AM/PM slot, date override | Engine dùng chung cho leave và attendance availability. |
| Leave | request, quota allocation/ledger, approval, shortage resolution | Annual leave theo phút; REMOTE theo monthly day unit. |
| Payment/fund | payment setting per branch, payment ticket, webhook event, fund, deposit, withdrawal, approval | Idempotency key và immutable transaction/audit. |
| Storage/export | private evidence metadata, export job, retention/access log nếu cần | Object path không được coi là authorization. |

### 3.5 Quy Tắc Đo Lường Leave

1. Daily working minutes là tổng working intervals của date sau khi áp dụng date override; break không được tính.
2. FULL_DAY trừ daily working minutes của date được chấm công theo calendar.
3. HALF_DAY_AM và HALF_DAY_PM dùng slot manager-configured để validate phạm vi, nhưng trừ chính xác 50% daily quota theo quyết định human.
4. EARLY_LEAVE nhận departure time theo bước 30 phút, validate trong/rành giờ schedule, sau đó tính tổng working minutes chưa làm trong phần còn lại.
5. Vì daily total có thể lẻ, schema phải biểu diễn được nửa phút hoặc validation phải ép daily total chẵn; không làm tròn âm thầm. Quy tắc được chọn phải có test.
6. REMOTE dùng quota theo tháng; half-day là `0.5`; request cross-month được tách allocation theo từng month trong transaction.
7. Ngày off không tự động tiêu thụ annual quota. Request trên ngày off chỉ được phép nếu phase specification bổ sung một exception rõ ràng.

## 4. Kế Hoạch API, RPC Và Edge Function

### 4.1 Nguyên Tắc Contract

1. RPC là thin contract có input Zod-compatible, output typed, error code ổn định và không leak dữ liệu nhạy cảm.
2. Function ghi state phải validate actor role, tenant/branch/location scope, current state, idempotency và audit trong cùng transaction khi có thể.
3. `SECURITY DEFINER` function phải `SET search_path = public`, schema-qualify đối tượng quan trọng và `REVOKE` execute mặc định nếu cần.
4. Không gọi `auth.uid()` như bằng chứng duy nhất cho kiosk: tablet session/scope phải được server validate.
5. Edge Function dùng service role chỉ ở server; không expose service role key cho browser.

### 4.2 RPC/Read Contract Ưu Tiên

| Contract | Actor | Mục đích | Guard chính |
| --- | --- | --- | --- |
| `get_my_checkin_availability` | employee | Safe read deadline, tablet window và availability | Chỉ user hiện tại, business date HCM, không trả sensitive config. |
| `create_tablet_session` | tablet credential | Đổi credential thành kiosk session ngắn hạn | Verify registry state, credential hash, location binding, rate limit/audit. |
| `issue_tablet_challenge` | kiosk session | Cấp QR/OTP one-time | Kiosk scope, short TTL, nonce/challenge hash, rate limit. |
| `submit_verified_checkin` | kiosk session + employee proof | Tạo check-in | Consume nonce/challenge atomically, location/date/unique/late/review rules, audit. |
| `review_attendance_case` | manager/HR/admin theo policy | Resolve anomaly/PENDING_REVIEW | State transition, scope, reason, audit; chỉ sau resolve mới penalty/absence được xử lý. |
| `request_leave` | employee | Tạo leave request | Calendar/quota/overlap/month split validation, idempotency. |
| `transition_leave_request` | manager/HR/admin | Approve/reject/override/unpaid resolution | State machine, approval scope, employee consent khi unpaid, audit. |
| `create_payment_ticket` | authorized actor | Tạo QR/ticket theo branch | Resolve office/default branch deterministically, active setting invariant, idempotency. |
| `transition_fund_withdrawal` | authorized approver | Approval payout | Distinct approvers, threshold, state machine, audit. |

Tên RPC trên là contract target. Tên cụ thể, parameter và return DTO được chốt trong `GOV-003` trước khi code.

### 4.3 Edge Functions

| Function logical | Trigger | Trách nhiệm | Idempotency/bảo mật |
| --- | --- | --- | --- |
| `sepay-webhook` | Sepay HTTP POST | Verify signature, parse event, call payment settlement contract | Verify HMAC ở staging/prod; `id=0` chỉ local env flag; dedupe provider event id/raw fingerprint. |
| `attendance-auto-absence` | Supabase Cron | Xử lý cases qua deadline nếu không `PENDING_REVIEW` | Job lock + execution log + idempotent per user/business date. |
| `tablet-cleanup` | Supabase Cron | Revoke/expire session và cleanup nonce/challenge hết hạn | Safe batched cleanup, không xóa audit. |
| `notification-worker` | Cron/outbox | Gửi notification qua provider được chọn sau | Outbox/dedupe/retry, không block transaction nghiệp vụ. |
| `export-worker` | Authenticated request/queue | Tạo private export | Authorize trước enqueue, object private, signed URL ngắn hạn. |

### 4.4 Error Và Idempotency

| Nhóm | Ví dụ |
| --- | --- |
| Authorization | `FORBIDDEN_ROLE`, `FORBIDDEN_SCOPE`, `TABLET_REVOKED`, `SESSION_EXPIRED` |
| Validation | `INVALID_BUSINESS_DATE`, `INVALID_DEPARTURE_SLOT`, `OUTSIDE_TABLET_WINDOW`, `INVALID_GPS_NONCE` |
| State conflict | `ALREADY_CHECKED_IN`, `PENDING_REVIEW`, `LEAVE_STATE_CONFLICT`, `SECOND_APPROVER_REQUIRED` |
| Quota | `INSUFFICIENT_ANNUAL_QUOTA`, `REMOTE_MONTH_QUOTA_EXCEEDED`, `UNPAID_CONSENT_REQUIRED` |
| External | `WEBHOOK_SIGNATURE_INVALID`, `WEBHOOK_DUPLICATE`, `PAYMENT_SETTING_UNAVAILABLE` |

Client map error code sang copy có thể hành động; không parse raw Postgres error string để điều khiển UI.

## 5. Thiết Kế Module Chi Tiết

### 5.1 Identity, Role Và Organization

1. Provision public user từ Auth event trong transaction an toàn và idempotent.
2. `user_roles` là membership canonical; custom access-token hook build `roles[]` từ server-side data.
3. Role mutation qua guarded admin RPC; mutation phải write audit và revoke/rotate session theo policy để claim cũ không kéo dài.
4. Office location, branch và manager setting phải có scope rõ ràng; không fallback bằng client-provided branch code.
5. Manager company-wide leave read không đồng nghĩa với manager có quyền sửa mọi employee/branch; write scope vẫn phải explicit.

### 5.2 Tablet Và Attendance

1. Admin đăng ký tablet với label, office location/branch, credential lifecycle và status.
2. Kiosk exchange credential lấy opaque session ngắn hạn; browser không persist session qua local storage.
3. Server issue QR/OTP challenge per kiosk session; challenge one-time, short-lived, revoke-aware và rate-limited.
4. GPS nonce được issue/consume trong PostgreSQL; consume và create check-in nằm trong một transaction để tránh replay/race.
5. Check-in resolve business date `Asia/Ho_Chi_Minh`, unique per employee/date, location/window/late tier, anomaly và review state.
6. `PENDING_REVIEW` là terminal blocker cho automated absence/penalty cho đến khi có human resolution.
7. Cron chỉ xử lý eligible record; không tự ý thay đổi case đang review.

### 5.3 Payment Và Fund

1. Payment setting là config theo branch, chỉ một active record per branch, activation/deactivation qua guarded RPC.
2. Ticket resolve branch từ office trước, sau đó `default_branch_code`; result resolution được persist/audit để reconciliation không phụ thuộc config tương lai.
3. Webhook lưu provider event và xử lý idempotent trước khi settle ticket/fund transaction.
4. Fund transaction giữ liên kết với ticket/transaction canonical; không tạo dòng tiền không truy vết được nguồn.
5. Withdrawal threshold đòi hỏi hai approver khác nhau; không cho phép self-approval hoặc duplicate approval.

### 5.4 Leave Và Work Calendar

1. Calendar engine tính working intervals sau date override; break interval tách rõ khỏi working interval.
2. Manager/HR/admin config weekly schedule, AM/PM slots và overrides; mọi thay đổi phải audit và có effective date.
3. Leave request snapshot schedule/quota calculation inputs cần thiết để lịch sử không bị thay đổi bởi schedule cập nhật sau này.
4. Annual quota ledger lưu allocation/debit/credit theo phút; không chỉ lưu một số dư denormalized mà không có trace.
5. Shortage transition phải lưu manager decision, reason và employee consent nếu unpaid.
6. Attendance bridge cập nhật theo explicit state transition; không tạo double deduction/duplicate absence.

### 5.5 Accounting, Notification, Export Và PWA

1. Accounting/reconciliation consume immutable payment/fund facts, không tính lại từ UI cache.
2. Notification dùng outbox sau commit; provider là decision M6, không là dependency cho core state machine.
3. Export là job authenticated, object private và signed URL ngắn hạn; metadata/audit lưu DB.
4. PWA offline chỉ cache static/safe read. Check-in, leave approval, payment và fund write không được silently queue nếu không có idempotency/UX contract rõ ràng.

## 6. Kế Hoạch Frontend Và UX

### 6.1 Route Map Mục Tiêu

| Khu vực | Route logical | Ghi chú |
| --- | --- | --- |
| Authentication | `/login`, callback/reset routes | Auth error rõ ràng, accessible form. |
| Employee | `/app/dashboard`, `/app/checkin`, `/app/leave`, `/app/payments` | Chỉ hiện action mà server role/scope cho phép. |
| Kiosk | `/kiosk` | Tách app shell, session in-memory, idle timeout và revoke handling. |
| Manager/HR | `/manage/attendance`, `/manage/leave`, `/manage/schedule`, `/manage/payments` | Review/approval/audit context. |
| Admin | `/admin/users`, `/admin/roles`, `/admin/tablets`, `/admin/settings` | Guard mạnh, dangerous action confirmation. |
| Accounting | `/accounting/fund`, `/accounting/reconciliation`, `/accounting/exports` | Read/report/export theo role. |

### 6.2 Nguyên Tắc UX Bắt Buộc

1. Semantic element trước div/button giả: label, fieldset, table, dialog, live region và heading hierarchy.
2. Keyboard, focus trap/return, color contrast, error state và screen-reader copy là acceptance criteria.
3. Responsive first: employee flow mobile-first; kiosk full-screen tablet; manager/accounting desktop-friendly nhưng không vỡ trên mobile.
4. Action nhạy cảm hiện rõ scope, target, state và consequence trước confirm.
5. Optimistic update chỉ dùng cho mutation idempotent/có rollback rõ ràng; attendance/payment/approval ưu tiên server-confirmed state.
6. Chưa được tự thêm visual brand, illustration system, animation language hoặc design tokens ngoài source. Polish chỉ bắt đầu khi có visual source đã được approve.

### 6.3 Frontend Data Boundary

1. Tạo typed repository/hook layer gọi RPC/Edge Function; component không truy cập table nhạy cảm trực tiếp.
2. Query key phân tách actor/scope/business date; invalidate chính xác sau mutation.
3. Không persist JWT role copy, kiosk credential, session token, QR secret hoặc GPS nonce vào local storage/log/error reporter.
4. Realtime event chỉ refresh data đã authorize; UI không tin event để tự cấp quyền hoặc tự kết luận state transition.

## 7. Bảo Mật, RLS Và Audit Plan

### 7.1 Baseline Security

| Kiểm soát | Yêu cầu |
| --- | --- |
| Default deny | Enable RLS trên bảng nghiệp vụ; không cấp broad `anon`/`authenticated` write grant. |
| Role guard | Guard trong RPC, không chỉ ở UI hoặc RLS filter. |
| Scope guard | Check company/branch/office/user relation cho mọi write/read privileged. |
| `SECURITY DEFINER` | `SET search_path = public`, schema-qualified object quan trọng, execute grant tối thiểu. |
| Auth claim | Hook đọc `user_roles`; role change revoke/refresh session theo policy. |
| Audit | Actor, target, action, reason, correlation id và safe before/after snapshot. |
| Secrets | Env-only, không commit, redact webhook secret/tablet credential/token trong log. |
| Storage | Bucket/object policy và signed URL authorization, không dựa vào unguessable path. |

### 7.2 RLS Matrix Tối Thiểu

| Tài nguyên | Employee | Manager/HR | Admin | Kiosk | Service role |
| --- | --- | --- | --- | --- | --- |
| Hồ sơ cá nhân | Self safe fields | Theo công việc/scope | Quản trị | Không | Backend only |
| `user_roles` | Không direct mutate | Không direct mutate trừ khi policy explicit | Guarded RPC | Không | Hook/backend |
| Tablet registry/session | Không | Không mặc định | Guarded admin RPC | Chỉ own scoped session | Backend only |
| Attendance | Self safe read/RPC request | Review trong scope | Quản trị theo policy | Checked RPC only | Cron/RPC |
| Leave | Self request/read | Company-wide read và scoped transition | Quản trị | Không | Backend only |
| Payment/fund | Theo nghiệp vụ | Theo scope | Theo policy | Không | Webhook/cron |
| Private evidence/export | Chỉ signed URL sau auth | Theo record scope | Theo policy | Không | Worker only |

### 7.3 Audit Event Tối Thiểu

1. Role mutation, session revoke, tablet register/credential rotate/status change.
2. GPS nonce/challenge consume failure rate-limit signal, nhưng không lưu raw secret.
3. Check-in creation, anomaly, review, auto-absence decision và penalty ticket lifecycle.
4. Schedule/calendar override, leave request/approval/reject/override/unpaid consent/quota adjustment.
5. Payment setting activate/default branch change, webhook acceptance/rejection, fund deposit/withdrawal/approval.
6. Private evidence/export access request và signed URL generation nếu policy yêu cầu.

## 8. Kế Hoạch Migration Và Dữ Liệu

### 8.1 Gate Bắt Buộc Trước SQL

`GOV-003` phải trả lời bằng evidence: `001_initial_schema.sql` đã được apply tới môi trường thật chưa?

| Trạng thái | Cách xử lý |
| --- | --- |
| Chưa apply | Sửa baseline `001_initial_schema.sql` để phản ánh contract đã approve, cập nhật README/seed/RLS test cùng thay đổi. |
| Đã apply ít nhất một môi trường thật | Không sửa lịch sử; tạo migration append-only, backfill có rollback/verification plan. |
| Không xác định được | Coi như đã apply để tránh rewrite lịch sử; dùng migration mới. |

### 8.2 Thứ Tự Logical Migration

| Nhóm | Nội dung | Dependency |
| --- | --- | --- |
| A. Identity và audit | User provisioning, `user_roles` hook support, audit/correlation primitives, session invalidation contract | Baseline applicability |
| B. Organization và config | Branch/location invariant, manager setting, payment active-setting invariant | A |
| C. Tablet/attendance security | Registry, credential/session/challenge, GPS nonce, protected RPC, review/auto-absence guards | A, B |
| D. Work calendar và leave | Schedule/interval/break/slot/override, quota minute ledger, request allocation/state machine | A, B |
| E. Payment/fund/accounting | Webhook event/idempotency, ticket/fund constraint, withdrawal two approval, reconciliation support | A, B |
| F. Storage/advanced ops | Bucket policies, outbox/export metadata, performance indexes/retention | A-E theo feature |

### 8.3 Migration Rules

1. Mỗi migration có `up` change, data backfill nếu cần, invariant query và rollback/forward-fix note.
2. Dùng constraint/index cho invariant database: unique business check-in, active payment setting per branch, transaction linkage, distinct withdrawal approver, idempotency event.
3. Dùng transaction và row lock cho quota allocation, nonce/challenge consume, payment settlement và approval race.
4. Không dùng client timestamp để xác định business date; database/RPC là canonical.
5. Seed phải deterministic, idempotent hoặc resettable và không có production secret.
6. RLS test phải cập nhật trong cùng PR với schema/policy/RPC change.

### 8.4 Data Migration Và Compatibility

1. Nếu quota cũ tồn tại theo day unit, backfill phải có conversion formula được approve theo schedule/legacy policy; không tự suy diễn nếu không có data source.
2. Nếu daily work total lẻ, chọn precision quota phút phù hợp trước backfill; không làm tròn im lặng.
3. Payment setting existing phải được audit để đảm bảo chỉ một active per branch trước khi thêm unique partial index/constraint.
4. Khi thêm storage metadata, existing object chỉ được attach sau khi xác minh owner/scope; không mở public để "fix" legacy access.

## 9. Backlog Thực Thi Chi Tiết

### M0. Governance Và Executable Contract

| ID | Công việc | Kết quả | Dependency |
| --- | --- | --- | --- |
| GOV-001 | Tạo evidence map và traceability matrix source -> decision -> task -> test | Matrix và scope boundaries đã review | None |
| GOV-002 | Đồng bộ HD-01 đến HD-19 vào decision log | Decision record có owner, date, schema impact | GOV-001 |
| GOV-003 | Xác nhận status `001`, chốt migration strategy, DTO/error/unit detail | Migration strategy, RPC DTO, enum/unit và unresolved-detail closure | GOV-002 |
| GOV-004 | Threat model và data classification | Trust boundary, secret/storage/audit policy | GOV-003 |

### M1. Foundation, Identity Và Security

| ID | Công việc | Kết quả | Dependency |
| --- | --- | --- | --- |
| INF-001 | Scaffold Vite React TypeScript PWA và env validation | App run/build/test có thể lặp lại | GOV-003 |
| INF-002 | Typed Supabase client, routing, query/error boundary và shared UI primitives | Frontend boundary an toàn | INF-001 |
| DB-001 | Apply logical migration A/B và core indexes/constraints/audit | Canonical foundation schema | GOV-003 |
| AUTH-001 | Provision trigger, `user_roles` claim hook, role mutation/session revoke | Identity/claim test pass | DB-001 |
| SEC-001 | RLS default deny, guarded RPC convention và role/scope helper | Direct-table deny test pass | DB-001, AUTH-001 |
| STO-001 | Storage bucket policy và signed URL service contract | Private/public object test pass | SEC-001 |
| TEST-001 | Test harness, seeded identities và non-owner RLS runner | CI-local verification basis | INF-001, DB-001 |

### M2. Tablet Và Core Check-In

| ID | Công việc | Kết quả | Dependency |
| --- | --- | --- | --- |
| TAB-001 | Tablet registry, credential lifecycle và kiosk session contract | Admin/tablet security tests | DB-001, SEC-001 |
| TAB-002 | QR/OTP challenge và PostgreSQL GPS nonce | One-time/TTL/replay/concurrency tests | TAB-001 |
| CHK-001 | Safe employee availability read và business-date engine | No sensitive config leak test | SEC-001 |
| CHK-002 | Verified check-in RPC, unique/day, late tier, anomaly/review | Transactional check-in tests | TAB-002, CHK-001 |
| CHK-003 | Manager review, penalty ticket link và attendance UI | `PENDING_REVIEW` guard tests | CHK-002 |
| CHK-004 | Cron auto-absence worker + lock/execution log | Idempotency/retry tests | CHK-003 |
| UI-CHK-001 | Employee/kiosk/manager check-in flows | Responsive/a11y/e2e happy and failure paths | INF-002, CHK-002 |

### M3. Payment Và Fund

| ID | Công việc | Kết quả | Dependency |
| --- | --- | --- | --- |
| PAY-001 | Branch/default branch/payment-setting invariant | One active setting per branch test | DB-001, SEC-001 |
| PAY-002 | Payment ticket creation và VietQR presentation | Deterministic branch/ticket test | PAY-001, INF-002 |
| PAY-003 | Sepay webhook verification/idempotency/settlement | Local bypass only + HMAC staging/prod test | PAY-002 |
| FUN-001 | Fund deposit/transaction lifecycle | Immutable source linkage test | PAY-003 |
| FUN-002 | Withdrawal two-approver workflow | Distinct approver/threshold/state race tests | FUN-001 |
| UI-PAY-001 | Payment/fund manager and accounting flows | Accessible status/error handling | PAY-002, FUN-002 |

### M4. Leave Và Work Calendar

| ID | Công việc | Kết quả | Dependency |
| --- | --- | --- | --- |
| LEV-001 | Work schedule, intervals, breaks, AM/PM slots và overrides | Calendar calculation unit suite | DB-001, SEC-001 |
| LEV-002 | Quota minute ledger và REMOTE monthly allocation contract | Odd-duration, half-day, cross-month tests | LEV-001 |
| LEV-003 | Leave request RPC và overlap/state validation | Employee request integration tests | LEV-002 |
| LEV-004 | Company-wide manager read, approvals, shortage resolution/consent | Scope/audit/state-machine tests | LEV-003 |
| LEV-005 | Attendance bridge | No double deduction/absence regression tests | LEV-004, CHK-003 |
| UI-LEV-001 | Employee request, manager calendar/approval, schedule admin UI | Responsive/a11y/e2e tests | INF-002, LEV-004 |

### M5. Accounting Và Reconciliation

| ID | Công việc | Kết quả | Dependency |
| --- | --- | --- | --- |
| ACC-001 | Accounting read model và reconciliation query | Reconciled/unreconciled report tests | PAY-003, FUN-002 |
| ACC-002 | Private export job/storage access | Authorized export and signed URL tests | ACC-001, STO-001 |
| UI-ACC-001 | Accounting reports, filters và export UI | Keyboard/table/mobile behavior tests | INF-002, ACC-002 |

### M6. Advanced Và Polish

| ID | Công việc | Kết quả | Dependency |
| --- | --- | --- | --- |
| ADV-001 | Notification outbox/provider integration | Dedupe/retry/failure observability | Core events, provider decision |
| ADV-002 | PWA offline/cache strategy | No unsafe offline write behavior | INF-001, UI flows |
| ADV-003 | Performance/index/retention review | Query/load evidence | Production-like data |
| ADV-004 | Visual polish | Approved visual source only | Design source |

### M7. Production Readiness

| ID | Công việc | Kết quả | Dependency |
| --- | --- | --- | --- |
| OPS-001 | CI quality gates | Build/type/lint/unit/integration/RLS suite | TEST-001, CI decision |
| OPS-002 | Staging deployment, secrets, CORS/OAuth domains | Environment checklist evidence | Hosting/domain decisions |
| OPS-003 | Monitoring/alert/runbook/backup drill | Incident and recovery evidence | Alert/observability decisions |
| OPS-004 | Security/accessibility/performance release review | Signed release checklist | All target milestones |

## 10. Dependency, Sequencing Và Parallelization

### 10.1 Đường Găng

```text
GOV-001 -> GOV-002 -> GOV-003 -> DB-001 -> AUTH-001 + SEC-001
  -> TAB-001 -> TAB-002 -> CHK-002 -> CHK-003 -> CHK-004
  -> LEV-001 -> LEV-002 -> LEV-003 -> LEV-004 -> LEV-005
  -> PAY-001 -> PAY-002 -> PAY-003 -> FUN-001 -> FUN-002 -> ACC-001
```

`DB-001`, `AUTH-001`, `SEC-001` và `TEST-001` là hard gate. Không bắt đầu client feature write trước khi identity, RLS và test boundary tương ứng đã pass.

### 10.2 Công Việc Có Thể Song Song

| Sau khi gate pass | Track song song cho phép | Điều kiện |
| --- | --- | --- |
| GOV-003 | INF-001 và threat model GOV-004 | Không viết business schema trước baseline decision. |
| DB-001 + AUTH-001 + SEC-001 | TAB-001, PAY-001, LEV-001, STO-001, TEST-001 | Không trùng file/schema ownership; mỗi track có contract rõ. |
| CHK-002 | UI kiosk/employee check-in và CHK-003 | UI dùng mocked/typed contract, không bypass RPC. |
| PAY-002 | UI payment và PAY-003 | UI không fake successful webhook settlement. |
| LEV-003 | UI leave request và LEV-004 | Manager action chỉ merge sau state machine backend pass. |
| M5 | Notification/export work | Provider và storage security gate phải rõ. |

### 10.3 Quy Tắc Ownership Để Tránh Xung Đột

1. Một task schema/RPC chỉ có một owner đang sửa migration/function tại một thời điểm.
2. Frontend có thể song song với backend chỉ trên DTO đã chốt; mock phải bị xóa/transfer trước merge.
3. Mỗi PR phải link task ID, source decision, test evidence và migration impact.
4. Không gộp "refactor nền tảng" không liên quan vào feature PR.

## 11. Milestone Và Acceptance Gate

| Milestone | Mục tiêu | Gate đạt |
| --- | --- | --- |
| M0 - Contract Ready | Decision và baseline strategy rõ | Human approval, decision log update plan, migration applicability evidence. |
| M1 - Secure Foundation | App scaffold + identity/RLS/test base | Build/type/lint pass; non-owner direct deny; role claim/revoke test pass. |
| M2 - Attendance Ready | Kiosk check-in, review, auto-absence | Replay/race/expired/revoked/session/`PENDING_REVIEW` tests pass; end-to-end check-in pass. |
| M3 - Money Flow Ready | Payment, webhook, fund withdrawal | HMAC/idempotency/branch invariant/two-approver tests pass. |
| M4 - Leave Ready | Schedule/calendar/quota/approval/bridge | Cross-month, override, odd-duration, shortage/consent, double-deduction tests pass. |
| M5 - Accounting Ready | Reconciliation và private export | Reconciliation invariant và authorization/export test pass. |
| M6 - Advanced Ready | Notification, PWA, performance/polish | Provider decision, offline safety và performance evidence pass. |
| M7 - Production Ready | CI, staging, security/release ops | Staging smoke, secret/CORS/OAuth, monitoring/runbook, release checklist pass. |

Mỗi milestone chỉ "done" khi code, migration, RLS, test, documentation và operational evidence của scope đó đều đạt. UI demo một mình không được coi là done.

## 12. Chiến Lược Test Và Verification

### 12.1 Lớp Test

| Lớp | Phạm vi | Ví dụ bắt buộc |
| --- | --- | --- |
| Unit | Pure business calculation và mapper | HCM business date, late upper-bound, schedule intervals, daily minutes, half-day, early-leave, cross-month REMOTE. |
| Database integration | Constraint, RPC, transaction, lock | Duplicate check-in, nonce/challenge replay, quota race, payment webhook duplicate, two approver. |
| RLS | Non-owner/PostgREST identity | Direct select/insert/update/delete deny; safe RPC chỉ trả dữ liệu hợp lệ. |
| Edge Function | Signature, auth, idempotency, retry | Sepay HMAC, local-only `id=0`, cron lock, expired tablet session. |
| Component | Form/dialog/table/error/a11y | Focus, label, keyboard, validation, loading/error state. |
| E2E | Critical role journey | Employee check-in, kiosk revoke, manager review, leave approval, payment settlement, withdrawal approval. |
| Non-functional | Security/performance/accessibility | Secret scan, dependency scan, query plan/index, keyboard/screen-reader smoke. |

### 12.2 Security Test Matrix Bắt Buộc

1. Employee không đọc được `auto_absent_at`, tablet credential, raw payment secret, private evidence URL hoặc role membership nhạy cảm.
2. Kiosk session expired/revoked/khác location không issue challenge hoặc check-in.
3. QR/OTP/GPS nonce đã dùng, hết hạn, sai session hoặc race song song chỉ có một consume thành công.
4. Role thay đổi không cho session/claim cũ tiếp tục protected action theo policy revoke/refresh.
5. `PENDING_REVIEW` không bị cron gán absent/ticket; sau resolve thì chỉ có một legitimate transition.
6. Hai approval withdrawal là hai actor khác nhau và không thể duplicate trong race.
7. Webhook sai HMAC bị reject ở staging/production; duplicate event không tạo duplicate settlement.
8. Private Storage object không tải được bằng URL path trước khi signed URL đã authorize.

### 12.3 Verification Command Và Evidence

Exact command sẽ được chốt khi `INF-001` tạo package scripts. Tối thiểu phải có command có thể lặp lại cho: format/lint, typecheck, unit test, database migration check, RLS runner, Edge Function test, build và E2E smoke. CI phải chạy cùng gate này, không chỉ chạy frontend build.

## 13. Risk Register Và Giảm Thiểu

| Risk | Xác suất/ảnh hưởng | Giảm thiểu | Gate/xử lý |
| --- | --- | --- | --- |
| Role/RLS bypass | Cao/Cao | Default deny, guarded RPC, non-owner tests, claim revoke | M1 security gate |
| Tablet credential/session leak | Trung bình/Cao | Hash/rotate credential, short opaque session, memory-only token, revoke, audit/rate limit | M2 tablet tests |
| GPS/QR/OTP replay | Trung bình/Cao | PostgreSQL nonce/challenge TTL + atomic consume + transaction lock | M2 concurrency suite |
| Auto-absence phạt nhầm case review | Trung bình/Cao | Explicit `PENDING_REVIEW` guard, idempotent cron, execution log | M2 job tests |
| Payment duplicate/fake webhook | Trung bình/Rất cao | HMAC, provider event dedupe, transaction state machine, audit | M3 webhook tests |
| Sai quota do schedule linh hoạt | Cao/Cao | Calendar engine, minute ledger, no silent rounding, edge-case suite | M4 calculation tests |
| Multiple active payment setting | Trung bình/Cao | Database invariant + guarded activation + audit | M3 DB tests |
| Private evidence lộ | Trung bình/Cao | Private buckets, signed URL after auth, metadata scope, log hygiene | M1/M5 storage tests |
| Migration baseline đã apply nhưng bị rewrite | Thấp/Rất cao | Evidence gate; unknown coi như applied; append-only migration | M0 gate |
| Polish sớm làm mất focus | Cao/Trung bình | M6 dependency on approved visual source | Scope review |
| Provider/hosting chưa chọn | Cao/Trung bình | Isolate adapter/outbox, defer M6/M7 | Human decision gate |

## 14. Mười Task Khuyến Nghị Đầu Tiên

| Thứ tự | ID | Scope nhỏ có thể giao | Điều kiện xong |
| --- | --- | --- | --- |
| 1 | GOV-001 | Trace source, decision, conflict và test target thành matrix | Reviewer xác nhận không bỏ sót source artefact. |
| 2 | GOV-002 | Ghi HD-01 đến HD-19 vào decision log | Mỗi decision có impact/schema owner và không còn wording drift. |
| 3 | GOV-003 | Xác nhận status `001`, chốt migration strategy, DTO/error/unit detail | Human sign-off cho executable contract. |
| 4 | GOV-004 | Threat model và data classification | Sensitive data/secret/storage boundary đã review. |
| 5 | INF-001 | Tạo React/Vite/PWA skeleton và scripts | Clean install, typecheck, test và production build pass. |
| 6 | DB-001 | Tạo/apply foundation schema và audit/constraint | Migration apply + invariant query pass. |
| 7 | AUTH-001 | Provision user, role claim hook, role revoke contract | Role matrix và stale-session test pass. |
| 8 | SEC-001 | RLS default deny và guarded RPC convention | RLS non-owner suite pass. |
| 9 | TEST-001 | Local database/RLS/fixture runner | Deterministic repeatable verification pass. |
| 10 | TAB-001 | Tablet registry/session lifecycle | Register/revoke/expire/unauthorized tests pass. |

Không nên bắt đầu UI check-in, Sepay webhook, leave calculation hoặc fund withdrawal trước khi task dependency của chúng đã xong.

## 15. Công Việc Implementation Đầu Tiên

### GOV-001 - Tạo Traceability Và Executable-Contract Packet

**Mục tiêu:** đóng băng phạm vi và biến toàn bộ quyết định đã chốt thành evidence có thể dùng để code an toàn. Đây là công việc đầu tiên sau khi plan được phê duyệt; nó không viết product feature.

**Input:**

1. Tất cả file trong `specs/docs/`, `specs/supabase/`, `specs/seeds/`.
2. HD-01 đến HD-19 trong Section 2.3 của tài liệu này.
3. D-01 đến D-06 trong `specs/docs/open-questions.md`.

**Scope thực hiện:**

1. Tạo matrix: requirement/decision -> source path -> domain schema/RPC -> task ID -> test case -> owner/reviewer.
2. Liệt kê conflict/delta giữa baseline và contract mới, đặc biệt tablet, GPS nonce, quota phút, calendar, payment branch invariant, role hook và Storage.
3. Ghi rõ các schema details cần chốt: precision quota phút khi daily total lẻ, REMOTE half-day representation, tablet TTL/credential rotation và migration baseline status.
4. Đối chiếu `open-questions.md` để chuyển HD-01 đến HD-19 thành decision record có traceability.
5. Không sửa product code, không apply migration, không tự thay đổi nghiệp vụ ngoài những gì đã được human approve.

**Không nằm trong scope:**

1. Scaffold frontend, Supabase project setup, migration implementation, RLS implementation, UI wireframe hoặc provider selection.
2. Tự chọn FCM/OneSignal, Resend/SendGrid, CI, hosting, production domain hoặc visual design.

**Acceptance criteria:**

1. 100% artifact versioned được link trong matrix.
2. Mỗi HD-01 đến HD-19 có target task và test evidence target.
3. Không còn conflict P0 bị ẩn; mọi chi tiết chưa chốt được đánh dấu owner/gate thay vì bị suy đoán.
4. Reviewer có thể xác định rõ baseline `001` được sửa hay cần append migration trước `DB-001`.
5. Git diff chỉ chứa documentation đã được phê duyệt.

**Verification:**

1. Review source links không broken.
2. Review chéo với `001_initial_schema.sql` và `rls_test_queries.sql`.
3. Human sign-off trước khi chuyển sang `GOV-003`/`INF-001`.

## PLAN READY

Plan này sẵn sàng để review. Sau human approval, thực thi từ `GOV-001`; không bắt đầu product implementation trước gate governance và migration applicability.

## GHI CHÚ BÀN GIAO VÀ TIẾP TỤC

### Trạng Thái Tại Thời Điểm Dừng

1. Đã hoàn thành master plan này; chưa có product source, app scaffold, migration mới, RLS mới, test mới hoặc deployment configuration được tạo.
2. Chưa bắt đầu implementation. Plan cần human approval trước khi tạo/sửa bất kỳ contract hoặc product code nào.
3. Quyết định nghiệp vụ HD-01 đến HD-19 đã được tổng hợp trong Section 2.3, nhưng chưa được đồng bộ vào `specs/docs/open-questions.md`.
4. Git handoff state: chỉ có file plan này là untracked; không có commit nào được tạo trong phiên làm việc này.

### Cách Tiếp Tục Ở Phiên Tiếp Theo

1. Đọc lại Section 1, Section 2, Section 8, Section 9 và Section 15 của file này trước khi làm bất kỳ thay đổi nào.
2. Xác nhận human approval cho plan. Nếu chưa được approve, chỉ review/làm rõ plan; không code.
3. Sau approval, chạy `GOV-001`: lập traceability matrix source -> decision -> schema/RPC -> task -> test.
4. Chạy `GOV-002`: ghi HD-01 đến HD-19 thành decision record trong `specs/docs/open-questions.md` hoặc artifact decision đã được approve.
5. Chạy `GOV-003`: xác minh bằng evidence `001_initial_schema.sql` đã từng apply ở môi trường thật hay chưa; chỉ sau đó mới chọn sửa baseline hoặc thêm migration append-only.
6. Hoàn thành `GOV-004` threat model/data classification, rồi mới bắt đầu `INF-001`, `DB-001`, `AUTH-001`, `SEC-001` và `TEST-001` theo đúng dependency.

### Gate Không Được Bỏ Qua

1. Không sửa migration `001` nếu nó đã được apply ở bất kỳ môi trường thật nào; nếu không xác định được, coi như đã apply và tạo migration mới.
2. Không làm UI write flow trước RLS, guarded RPC, role/scope guard và test boundary tương ứng.
3. Không dùng Supabase Auth user cho tablet; tablet phải dùng registry, credential và kiosk session riêng.
4. Không cho client ghi trực tiếp bảng nhạy cảm, lưu service-role key, token kiosk, QR/OTP secret hoặc GPS nonce trong local storage.
5. Không tự động absent/penalty khi record là `PENDING_REVIEW`.
6. Không bỏ qua HMAC Sepay ở staging/production; `id=0` chỉ được phép ở local development qua env flag explicit mặc định `false`.
7. Không xử lý leave bằng hard-code 480 phút/ngày; dùng calendar/interval/date override và minute-quota contract.

### Chi Tiết Kỹ Thuật Cần Chốt Trong GOV-003

| Chủ đề | Cần chốt | Ảnh hưởng |
| --- | --- | --- |
| Tablet session | Exact TTL, credential rotation/recovery và session invalidation policy | `TAB-001`, `TAB-002`, security test |
| Quota phút | Precision/rounding khi daily work total là số lẻ | `LEV-001`, `LEV-002`, migration/backfill |
| REMOTE half-day | Field/enum/request representation và allocation detail | `LEV-002`, UI leave, test cross-month |
| Baseline migration | `001` đã apply hay chưa ở môi trường thật | Tất cả DB migration task |
| Provider/operations | Notification, email, rate limit, CI, hosting, domain/OAuth, alerting | M6/M7; không block M0-M5 |
| Visual source | Brand/design system đã được phê duyệt hay chưa | M6 polish; không block semantic/responsive UI |

### Kiểm Tra Nhanh Khi Mở Lại Workspace

1. Chạy `git status --short --untracked-files=all` để biết handoff state có thay đổi hay không.
2. Đọc `specs/plans/teamhub-implementation-master-plan.md` và đối chiếu các source path trong Section 1.3.
3. Nếu có thay đổi ngoài phạm vi, không revert; đánh giá conflict với task đang làm trước khi tiếp tục.
4. Dùng task ID trong Section 9 để cập nhật tiến độ và giữ một task `in_progress` tại một thời điểm.

### Prompt Khởi Động Gợi Ý

```text
Đọc specs/plans/teamhub-implementation-master-plan.md và toàn bộ source được liệt kê ở Section 1.3.
Plan đã được/chưa được human approval: [điền trạng thái].
Nếu đã được approve, bắt đầu GOV-001 và báo cáo evidence, conflict, migration applicability gate trước khi sửa code hoặc schema.
```
