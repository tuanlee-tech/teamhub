**TeamHub - Kế Hoạch Release 1**

> **Smart Attendance, Automated Fines & Team Culture**

| Hạng mục | Giá trị |
|---|---|
| Tên dự án | **TeamHub** |
| Repository | <https://github.com/tuanlee-tech/team-hub> |
| Package | `@teamhub/app` |
| Env prefix | `TEAMHUB_` |

---

Dự án là greenfield, dùng `Next.js + TypeScript + Supabase`. Vì phạm vi bao phủ toàn bộ SRS, bản đầu sẽ được chia thành các milestone có thể kiểm thử độc lập trước khi phát hành.

**Quyết Định Đã Chốt**

| Hạng mục | Quyết định |
|---|---|
| Phạm vi | Toàn bộ SRS |
| Tenant | Một nhóm, mọi bảng có `organization_id` để mở rộng |
| Kiosk | Manager đăng nhập một lần, mở giao diện toàn màn hình |
| Đăng ký | Công khai, mọi tài khoản phải chờ manager duyệt |
| Username | Thu thêm email để xác minh và khôi phục mật khẩu |
| Roster | Tự thêm mọi member active, manager loại người nghỉ/remote |
| Múi giờ, phiên | Manager cấu hình |
| Biên phạt | Chỉ áp tier khi `late_minutes > threshold` |
| Auto-late | Phút kế tiếp sau tier cao nhất, ví dụ 10:06 |
| QR check-in | Token động hết hạn sau 30 giây |
| GPS | Chuyển sang QR nếu accuracy lớn hơn 100m |
| Thanh toán | Rule + mã phạt duy nhất; sai số tiền chờ đối soát |
| SePay | HMAC-SHA256 |
| VietQR | `compact`, `showinfo=true`, `fullacc=true` |
| Ngân hàng | Chỉ 11 ngân hàng trong SRS |
| Quỹ | Manager nhập khoản chi thủ công |
| Biểu đồ | Cột theo member/ngày và đường xu hướng |
| Thông báo | TTS, Realtime và Web Push |

## Kiến Trúc

```text
TeamHub - Next.js 16 PWA trên Vercel
        |
        +-- Supabase Auth: Google, email/password
        +-- PostgreSQL: nghiệp vụ, RLS, RPC
        +-- Realtime: kiosk và dashboard
        +-- Storage: avatar, chứng từ chi
        +-- Cron: tạo roster, auto-late, retry notification
        +-- Edge Functions:
              sepay-webhook
              dispatch-push
              maintenance/reconciliation
        |
        +-- VietQR image API
        +-- SePay webhook
        +-- Web Speech API
        +-- Web Push/VAPID
```

Frontend dùng App Router, Tailwind CSS, Supabase SSR, Zod, React Hook Form, Recharts và thư viện QR nội bộ. PWA dùng manifest của Next.js và service worker có Serwist để cache app shell, xử lý push và cập nhật phiên bản.

## Mô Hình Dữ Liệu

| Nhóm | Bảng chính |
|---|---|
| Tổ chức và người dùng | `organizations`, `profiles`, `organization_members`, `organization_settings` |
| Luật phạt | `penalty_tiers` |
| Điểm danh | `attendance_days`, `daily_roster`, `attendance_records`, `check_in_attempts`, `kiosk_qr_challenges` |
| Phạt và quỹ | `fines`, `sepay_webhook_events`, `fund_transactions`, `fine_allocations`, `fund_entry_audits` |
| TTS | `tts_settings`, `message_packs`, `message_templates`, `announcement_events`, `tts_pool_states`, `kiosk_sessions` |
| Push | `push_subscriptions`, `notification_outbox` |
| Game hóa | `member_stats`, `member_title_history` |

Mỗi `attendance_day` lưu snapshot giờ làm, phiên, tier và cấu hình liên quan. Thay đổi cấu hình không được làm sai lịch sử hoặc tự động thay đổi khoản phạt đã phát sinh.

## Logic Nghiệp Vụ

### Điểm danh

- Thời gian được lấy từ server, không tin timestamp của điện thoại.
- Cả giờ check-in và giờ hợp lệ được cắt xuống phút.
- `09:35:59` thành `09:35`, không trễ.
- Với tier 10 phút, trễ đúng 10 phút chưa bị phạt; từ phút 11 mới áp tier.
- GPS được kiểm tra Haversine phía server, yêu cầu accuracy không quá 100m.
- Chỉ lưu khoảng cách và accuracy phục vụ audit, hạn chế lưu tọa độ chính xác.
- QR dùng chuỗi ngẫu nhiên đủ mạnh, database chỉ lưu hash và thời điểm hết hạn.
- Một QR có thể được nhiều member dùng trong 30 giây, nhưng mỗi member chỉ có một attendance record mỗi ngày.
- Check-in và cron chạy đồng thời vẫn chỉ tạo một kết quả nhờ unique constraint và transaction locking.

### Roster Và Auto-late

- Cron tạo ngày làm việc và roster từ toàn bộ member active.
- Manager có thể bỏ chọn member nghỉ phép hoặc remote.
- Auto-late chạy mỗi phút bằng Supabase Cron và hoàn toàn idempotent.
- Nếu tier cao nhất là 30 phút và giờ chuẩn là 09:35, auto-late bắt đầu lúc 10:06.
- Không có tier thì auto-late từ phút đầu tiên vượt giờ hợp lệ, không sinh khoản tiền phạt.
- Member check-in sau auto-late được cập nhật giờ thực tế nhưng khoản phạt cao nhất vẫn giữ nguyên.
- Điều chỉnh roster muộn không xóa dữ liệu; fine được chuyển sang `waived` và lưu audit.

### SePay Và VietQR

Nội dung chuyển khoản dự kiến:

```text
{DESCRIPTION_RULE} MC {FINE_CODE} {ASCII_MEMBER_NAME}
```

- `des` được chuyển thành không dấu, chỉ chữ, số và khoảng trắng.
- VietinBank bắt buộc rule chứa `SEVQR`.
- Dropdown lấy `banks.json`, sau đó lọc với whitelist 11 ngân hàng.
- Webhook xác minh `X-SePay-Signature` trên raw body, kiểm tra timestamp trong khoảng 5 phút.
- `SePay id` có unique constraint để chống retry và gửi trùng.
- Chỉ xử lý giao dịch tiền vào, đúng tài khoản, đúng rule và đúng mã phạt.
- Đúng mã và đúng số tiền sẽ tự động đóng phạt.
- Thiếu hoặc thừa tiền được lưu `unmatched`, manager ghép hoặc xác nhận thủ công.
- Giao dịch và cập nhật fine nằm trong cùng database transaction.
- Fine đã trả không bị xóa; kiosk chỉ lọc `status = unpaid`.

### TTS

- Mọi sự kiện được ghi vào `announcement_events`, không chỉ giữ trong bộ nhớ trình duyệt.
- Database duy trì shuffle bag riêng theo loại sự kiện và pool template.
- Không lặp lại câu vừa đọc; chỉ trộn lại sau khi dùng hết pool.
- Queue sắp theo priority rồi FIFO.
- Kiosk claim sự kiện bằng lease để tránh hai tab cùng đọc.
- Quiet hours ngoài khung sẽ đánh dấu sự kiện `suppressed`, không đọc bù vào hôm sau.
- Cooldown được manager cấu hình và bắt đầu sau sự kiện `speechSynthesis.onend`.
- Tablet cần nút “Bật MC” sau khi tải lại để đáp ứng chính sách autoplay của trình duyệt.
- Template custom chỉ chấp nhận placeholder cho phép, giới hạn độ dài và kiểm tra danh sách nội dung cấm.

### Push Và PWA

- Subscription được lưu theo user và thiết bị.
- Payment thành công tạo notification cho member và mọi manager trong cùng transaction.
- Edge Function xử lý outbox, xóa subscription khi push service trả `404/410`.
- iPhone/iPad chỉ nhận Web Push khi PWA đã được thêm vào Home Screen trên iOS 16.4 trở lên.
- Check-in, thanh toán và thao tác manager luôn yêu cầu online.
- Offline chỉ hỗ trợ app shell, trạng thái kết nối và dữ liệu chỉ đọc đã cache.

## Phân Quyền

- Pending user chỉ xem hồ sơ và trạng thái chờ duyệt.
- Active member xem bảng hôm nay, lịch sử cá nhân, bảng quỹ và thông tin công khai của member.
- Manager quản lý cấu hình, roster, tài khoản, đối soát, chi quỹ và TTS.
- Check-in, thanh toán, auto-late và tính title chỉ thực hiện qua RPC hoặc Edge Function.
- Raw webhook, email, GPS audit và push endpoint không nằm trong các bảng Realtime công khai.
- Service role chỉ tồn tại trong Vercel/Supabase secrets.
- Avatar chỉ được user ghi vào thư mục của mình; chứng từ chi chỉ manager được ghi.
- Đăng ký công khai được bảo vệ bằng CAPTCHA, rate limit và thông báo lỗi không tiết lộ tài khoản tồn tại.

## Lộ Trình Triển Khai

1. **Khởi tạo nền tảng**  
   Tạo Next.js, Supabase local, migrations, CI, lint, typecheck, test runner, manifest và cấu trúc route.

2. **Auth và membership**  
   Triển khai Google OAuth, username alias cho email/password, xác minh email, pending approval, bootstrap manager, profile và avatar.

3. **Cấu hình manager**  
   Làm giờ làm, work days, session, timezone, tier, office/map, bank, VietQR, TTS, quiet hours và member approval.

4. **Roster và điểm danh**  
   Tạo attendance snapshot, roster tự động, GPS RPC, QR động, audit attempt, tính trễ và cron auto-late.

5. **Phạt, SePay và quỹ**  
   Sinh fine code/VietQR, webhook HMAC, deduplication, đối soát sai số, expense thủ công, receipt và ledger.

6. **Kiosk Realtime và TTS**  
   Xây màn hình tablet, transaction feed, QR check-in, Wake Lock, queue, priority, cooldown, trend/custom pack và shuffle bag.

7. **Title và notification**  
   Tính tỷ lệ trên các ngày roster đã được xử lý, lưu lịch sử title, tạo achievement event, Web Push cho member/manager.

8. **Dashboard và hoàn thiện PWA**  
   Lịch sử, filter, biểu đồ cột/đường, install flow, offline shell, responsive mobile/tablet, accessibility và hardening.

## Kiểm Thử

- Unit test cho Haversine, phút trễ, biên tier nghiêm ngặt, title, quiet hours và template interpolation.
- SQL/pgTAP test cho RLS, cron idempotency, concurrent check-in, snapshot cấu hình và unique fine.
- Fixture test webhook cho HMAC sai, timestamp cũ, duplicate ID, sai rule, sai số tiền và retry.
- Playwright test toàn luồng manager, pending member, GPS, QR hết hạn, kiosk realtime và payment.
- Mock Web Speech và Push trong CI; kiểm thử thật trên Chrome Android, Safari iOS PWA và tablet mục tiêu.
- Chạy lint, typecheck, unit, database reset, integration, E2E và production build trong CI.

## Rủi Ro Cần Lưu Ý

- Manager đăng nhập trực tiếp trên tablet khiến thiết bị giữ quyền rộng; nên dùng tài khoản manager riêng cho kiosk và bật screen pinning của hệ điều hành.
- GPS trình duyệt có thể bị giả lập; geofence và QR ngắn hạn chỉ giảm rủi ro, không chống được chia sẻ camera trực tiếp.
- Chất lượng giọng Việt của Web Speech phụ thuộc tablet; cần màn hình kiểm tra và chọn voice trước khi vận hành.
- Nội dung custom do manager viết không thể bảo đảm an toàn ngữ nghĩa tuyệt đối chỉ bằng denylist.
- `banks.json`, VietQR và SePay là dịch vụ ngoài; ứng dụng cần cache danh sách ngân hàng, timeout và trạng thái lỗi rõ ràng.

Khi bắt đầu triển khai sẽ cần cấu hình Supabase, Google OAuth, SePay HMAC, VAPID, tài khoản ngân hàng và thông tin manager đầu tiên qua biến môi trường hoặc secret manager, không đưa secret vào mã nguồn. Không có tệp nào được thay đổi trong giai đoạn lập kế hoạch này.