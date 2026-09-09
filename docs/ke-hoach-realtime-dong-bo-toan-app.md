# Kế Hoạch Realtime Đồng Bộ Toàn App

## Mục Tiêu

Khi mở đồng thời các màn hình:

- `/kiosk?tab=checkin`
- `/kiosk?tab=late`
- `/member`
- `/fines?tab=unpaid`
- `/fines?tab=history`
- `/late?tab=unpaid`
- `/late?tab=paid`

mọi thay đổi check-in, attendance, phiếu phạt và thanh toán phải được phản ánh ngay mà không cần refresh thủ công.

Màn hình có TTS phải nhận cùng event realtime với UI để đọc đúng trạng thái, không đọc trùng và không đọc dữ liệu cũ.

## Hiện Trạng

### Realtime infrastructure

Channel hiện tại:

```text
organization:<organizationId>
```

Broadcast hiện có:

- `check-in-status`
- `fine-status`
- `fund-status`

Consumer hiện tại:

- Kiosk nhận check-in, cập nhật activity feed, toast và TTS.
- Kiosk reload late list khi nhận `fine-status` hoặc `fund-status`.
- Member refresh khi user hiện tại check-in hoặc có `fine-status`.
- Fine list refresh một phần khi fine đã tồn tại trong list ban đầu.

### Khoảng trống hiện tại

- Kiosk tab `late` chưa reload ngay khi chỉ có check-in mới.
- `/fines` chưa nhận `fund-status` và `fine_allocations`.
- Fine mới tạo không luôn được thêm vào `/fines`.
- `/late` chưa subscribe realtime.
- Fine detail chưa realtime.
- Payment QR panel chưa realtime.
- Payload hiện thiếu `work_date`, `attendance_state`, `late_minutes`, `fine_code` và `event_id` chuẩn.
- TTS kiosk chưa dùng đầy đủ cấu hình MC trong Settings.
- Nhiều kiosk cùng organization có nguy cơ đọc cùng một announcement.

## Phạm Vi Màn Hình

### 1. Kiosk check-in

Route: `/kiosk?tab=checkin`

Realtime cần có:

- Lượt điểm danh mới.
- Tên user.
- Phương thức điểm danh.
- Thành công/thất bại.
- Lý do thất bại.
- Thời gian điểm danh.
- Toast.
- TTS.
- Rotate QR/OTP sau check-in thành công.

Nguyên tắc:

- Snapshot `get_recent_check_in_attempts` dùng khi mở/reconnect.
- Broadcast dùng cho event phát sinh sau khi subscribe.
- Deduplicate theo `event_id` hoặc `attempt_id`.
- Feed cập nhật local, không reload toàn trang.

### 2. Kiosk late

Route: `/kiosk?tab=late`

Realtime cần có:

- User vừa điểm danh làm thay đổi danh sách trễ.
- Fine mới được tạo.
- Fine chuyển `paid` hoặc `waived`.
- Allocation làm thay đổi outstanding amount.
- Nút QR thanh toán biến mất khi hết nợ.
- Badge hai tab unpaid/paid cập nhật.

Nguyên tắc:

- Check-in/attendance event gọi lại `loadLate(lateDate)`.
- Fine/allocation/fund event cũng gọi lại `loadLate(lateDate)`.
- Chỉ reload khi `work_date` trùng ngày đang chọn.
- Modal QR phải phản ánh fine đã paid hoặc waived.

### 3. Member

Route: `/member`

Realtime cần có:

- Trạng thái điểm danh hôm nay.
- Giờ điểm danh.
- Trạng thái đúng giờ/trễ.
- Số phút trễ.
- Fine phát sinh.
- Fine được thanh toán hoặc miễn.

Nguyên tắc:

- Chỉ refresh khi `user_id` của event là user hiện tại.
- Event của user khác không được refresh member page.
- Fine/allocation thay đổi phải cập nhật phần trạng thái phạt.
- Toast không được spam do event của user khác.

### 4. Fines

Routes:

- `/fines?tab=unpaid`
- `/fines?tab=history`

Realtime cần có:

- Fine mới xuất hiện ở tab chưa thanh toán.
- Fine chuyển sang đã trả.
- Fine được miễn.
- Outstanding amount thay đổi do allocation.
- Badge count của hai tab.

Nguyên tắc:

- Nghe `fine-status`, `fine-allocation-status`, `fund-status`.
- Không chỉ kiểm tra fine có trong list cũ; fine mới cũng phải trigger refresh.
- Lọc theo `user_id` hiện tại.
- Sau event, server tính lại `allocatedVnd` và `outstandingVnd`.
- Giữ nguyên tab hiện tại sau refresh.

### 5. Late

Routes:

- `/late?tab=unpaid`
- `/late?tab=paid`

Realtime cần có:

- User mới bị ghi nhận trễ.
- User vừa check-in, làm thay đổi `checked_in_at`.
- Fine mới được tạo.
- Fine chuyển paid/waived.
- Outstanding amount thay đổi.
- Badge count hai tab.
- Nội dung modal QR thanh toán.

Nguyên tắc:

- Thêm `organizationId` vào `LateList`.
- Subscribe các event attendance/check-in/fine/allocation/fund.
- Chỉ reload khi `event.work_date === workDate`.
- Giữ nguyên ngày đang chọn và tab hiện tại.
- Refresh bằng `get_daily_late_list`.
- Nếu modal mở và fine hết outstanding, cập nhật modal ngay.

## Chuẩn Hóa Event

### Event nguồn database

| Thay đổi | Event |
|---|---|
| `check_in_attempts` insert | `check-in-status` |
| `attendance_records` insert/update | `attendance-status` |
| `fines` insert/update | `fine-status` |
| `fine_allocations` insert/update/delete | `fine-allocation-status` |
| `fund_transactions` insert/update | `fund-status` |
| `tts_settings` update | `tts-settings-status` |

### Payload envelope

Mỗi event cần có:

```ts
{
  event_id: string;
  organization_id: string;
  event_type: string;
  entity_id: string;
  user_id: string | null;
  work_date: string | null;
  occurred_at: string;
}
```

Payload riêng có thể chứa:

```ts
{
  display_name?: string | null;
  method?: "gps" | "qr" | "otp";
  succeeded?: boolean;
  attendance_state?: "pending" | "on_time" | "late" | "excused";
  late_minutes?: number;
  fine_id?: string;
  fine_code?: string;
  status?: "unpaid" | "paid" | "waived";
}
```

Không gửi raw payment payload, số tài khoản, webhook data hoặc thông tin nhạy cảm vào Broadcast.

Event nên được dùng như invalidation signal. UI nhận event rồi fetch lại snapshot từ server/RPC thay vì tự tính trạng thái tiền hoặc attendance từ payload không đầy đủ.

## Payment Sync

Luồng cần đồng bộ:

```text
SePay webhook
  -> process_fine_payment
  -> update fines.status = paid
  -> insert fund_transactions
  -> insert fine_allocations
  -> Broadcast fine-status
  -> Broadcast fund-status
  -> Broadcast fine-allocation-status
  -> tất cả màn hình fetch lại snapshot
```

Không chỉ dựa vào `fines.status`, vì outstanding amount còn phụ thuộc `fine_allocations`.

Các màn phải cập nhật cùng lúc:

- Kiosk late.
- `/member` nếu khoản phạt thuộc user hiện tại.
- `/fines` cả hai tab.
- `/late` cả hai tab.
- Fine detail.
- Payment QR panel.

## TTS Realtime

### Event được đọc

Mặc định chỉ kiosk phát TTS:

- Check-in đúng giờ.
- Check-in trễ.
- Thanh toán thành công.
- Achievement.
- Fund balance nếu được bật.

Check-in thất bại mặc định chỉ hiển thị toast và activity feed, không đọc để tránh spam.

### Cấu hình cần áp dụng

Kiosk phải tải và dùng:

- `enabled_events`
- `personality`
- `cooldown_seconds`
- `quiet_enabled`
- `quiet_start`, `quiet_end`
- `locale`
- `preferred_voice`
- `speech_rate`
- `speech_pitch`

Khi manager lưu Settings:

```text
tts_settings update
  -> tts-settings-status
  -> kiosk reload config
  -> event kế tiếp dùng config mới
```

### Chống đọc trùng

TTS cần:

- `event_id` để deduplicate.
- Queue phát tuần tự.
- Cooldown.
- Priority.
- Bỏ qua event quá cũ.
- Không đọc trong quiet hours.

Nếu có nhiều kiosk cùng organization:

- Chỉ kiosk primary speaker được đọc.
- Kiosk khác vẫn cập nhật UI/toast.
- Dùng `kiosk_sessions.is_primary_speaker` để tránh đọc trùng.

## Hook Dùng Chung

Mở rộng `useOrganizationRealtime`:

```ts
useOrganizationRealtime(organizationId, {
  onCheckIn,
  onAttendance,
  onFine,
  onFineAllocation,
  onFund,
  onTtsSettings,
});
```

Hook phải đảm bảo:

- Một channel cho mỗi component instance.
- Cleanup đúng khi unmount.
- Không tạo channel mới do callback identity thay đổi.
- Có xử lý `SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`.
- Có resubscribe khi mất mạng.
- Fetch snapshot sau reconnect.
- Không tạo polling dày thay cho Realtime.

## Thứ Tự Triển Khai

### P0: Đồng bộ nghiệp vụ

1. Chuẩn hóa payload và `event_id`.
2. Thêm Broadcast cho `fine_allocations`.
3. Thêm `work_date` vào event.
4. Sửa kiosk late reload khi có check-in.
5. Kết nối `/late` vào realtime.
6. Sửa `/fines` nhận fine mới và allocation.
7. Kết nối fine detail và payment QR.

### P1: Member và reconnect

1. Member chỉ refresh khi event thuộc user hiện tại.
2. Thêm `attendance-status`.
3. Xử lý reconnect và snapshot reload.
4. Giữ đúng tab/date/search params sau refresh.
5. Không hiển thị toast cho event không liên quan.

### P1: TTS theo event

1. Tải `tts_settings` cho kiosk.
2. Áp dụng enabled events.
3. Áp dụng locale/voice/rate/pitch.
4. Áp dụng cooldown/quiet hours.
5. Deduplicate TTS event.
6. Broadcast khi settings thay đổi.

### P2: Multi-kiosk speaker

1. Xác định kiosk primary speaker.
2. Heartbeat `kiosk_sessions`.
3. Chỉ primary kiosk đọc.
4. Kiosk khác takeover khi primary offline.
5. Các kiosk không đọc vẫn sync UI.

## Tiêu Chí Nghiệm Thu

Mở đồng thời toàn bộ các tab đã nêu ở đầu tài liệu.

### Khi check-in

- Kiosk activity feed cập nhật ngay.
- Kiosk late list cập nhật nếu có liên quan.
- `/member` cập nhật đúng user.
- `/late` cập nhật đúng ngày.
- `/fines` cập nhật fine/badge nếu phát sinh.
- Toast hiển thị độc lập với TTS.
- TTS chỉ đọc ở màn hình được bật.

### Khi thanh toán xong

- Fine detail đổi trạng thái ngay.
- Payment QR chuyển sang hết nợ.
- `/fines` chuyển item từ unpaid sang history.
- `/late` chuyển item từ unpaid sang paid.
- Kiosk late list cập nhật.
- `/member` cập nhật khoản phạt nếu thuộc user hiện tại.
- Outstanding amount không còn stale.
- Không cần refresh thủ công.

### Độ tin cậy

- Reconnect vẫn lấy lại snapshot mới nhất.
- Không duplicate feed.
- Không duplicate TTS.
- Không đọc event ngoài quiet hours.
- Không làm lộ dữ liệu ngoài organization.
- Một lỗi TTS không làm hỏng cập nhật nghiệp vụ.
