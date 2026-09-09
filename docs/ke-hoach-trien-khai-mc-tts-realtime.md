# Kế Hoạch Triển Khai MC/TTS Realtime

## Mục tiêu

Áp dụng cấu hình MC trong `/manager/settings` vào các màn hình cần đọc thông báo bằng giọng nói, ưu tiên `/kiosk`, đồng thời giữ thông báo trực quan bằng toast khi loa không hoạt động.

MC/TTS phải:

- Đọc đúng ngôn ngữ, voice, tốc độ và cao độ đã cấu hình.
- Tôn trọng danh sách sự kiện được bật.
- Tôn trọng cooldown và quiet hours.
- Nhận event realtime từ toàn tổ chức.
- Không đọc trùng khi nhiều nguồn cập nhật cùng một dữ liệu.
- Có fallback an toàn khi browser không hỗ trợ Speech API hoặc không có voice phù hợp.

## Hiện Trạng

### Cấu hình đã có

`tts_settings` hiện lưu:

- `personality`
- `enabled_events`
- `cooldown_seconds`
- `quiet_enabled`
- `quiet_start`, `quiet_end`
- `locale`
- `preferred_voice`
- `speech_rate`
- `speech_pitch`

Settings UI đã cho manager chỉnh sửa các giá trị này và lưu qua `updateTtsSettings`.

Database cũng đã có nền tảng cho message engine:

- `message_packs`
- `message_templates`
- `announcement_events`
- `tts_pool_states`
- `kiosk_sessions`

### Đang hoạt động

Kiosk hiện:

- Nhận Broadcast `check-in-status`.
- Hiển thị toast khi có check-in.
- Đọc câu hard-code khi toggle local `Đọc kết quả` bật.
- Có nút test loa.
- Có fallback chọn voice `vi-*`.
- Có xử lý delay sau `speechSynthesis.cancel()` để tránh mất phần đầu câu.

### Chưa được áp dụng

Kiosk chưa đọc theo các cấu hình server:

- Personality.
- Enabled events.
- Cooldown.
- Quiet hours.
- Locale.
- Preferred voice.
- Speech rate.
- Speech pitch.

`message_templates`, `announcement_events` và `tts_pool_states` chưa có consumer/processor trong frontend hoặc backend.

## Phạm Vi Sự Kiện

### Sự kiện cần đọc

| Event | Ý nghĩa | Màn hình phát mặc định |
|---|---|---|
| `check_in` | Điểm danh thành công | Kiosk |
| `late` | Điểm danh trễ hoặc phát sinh trạng thái trễ | Kiosk |
| `payment` | Thanh toán phạt thành công | Kiosk |
| `on_time` | Điểm danh đúng giờ | Kiosk |
| `achievement` | Thành viên đạt title/danh hiệu | Kiosk |
| `fund_balance` | Thay đổi hoặc thông báo số dư quỹ | Kiosk/Manager tùy cấu hình |

Check-in thất bại mặc định chỉ hiển thị toast và activity feed, không đọc thành tiếng để tránh làm ồn do nhập sai nhiều lần. Nếu cần đọc thất bại, phải thêm tùy chọn riêng.

### Quyết định cần giữ

- Toggle trên kiosk là công tắc tắt tiếng nhanh của thiết bị.
- Settings manager là cấu hình cấp tổ chức.
- Toast vẫn hiển thị dù TTS tắt hoặc loa hỏng.
- TTS chỉ là lớp trình bày; không được quyết định trạng thái nghiệp vụ.

## Kiến Trúc Đề Xuất

### 1. TTS engine dùng chung

Tạo một client utility/hook dùng chung cho kiosk và các màn hình phát TTS:

- Nhận `TtsSettings` từ server.
- Chọn voice theo `preferred_voice` và `locale`.
- Fallback theo locale, sau đó fallback voice mặc định.
- Áp dụng `speech_rate` và `speech_pitch`.
- Quản lý `cancel`, delay, queue và cleanup.
- Phát hiện browser không hỗ trợ Web Speech API.
- Cho phép test một câu cụ thể.

Không để các component tự tạo `SpeechSynthesisUtterance` với thông số hard-code.

### 2. Chuẩn hóa payload realtime

Các event Broadcast dùng channel:

```text
organization:<organizationId>
```

Payload nên có dạng:

```text
event_id
event_type
priority
organization_id
user_id
display_name
attendance_state
late_minutes
fine_amount_vnd
fine_code
status
created_at
```

Không gửi thông tin nhạy cảm hoặc raw payment payload vào Broadcast.

### 3. Tách event nghiệp vụ và announcement

Event nghiệp vụ dùng để cập nhật UI:

- `check-in-status`
- `fine-status`
- `fund-status`

Event announcement dùng để quyết định có đọc hay không:

- `check_in`
- `late`
- `payment`
- `on_time`
- `achievement`
- `fund_balance`

Một event nghiệp vụ có thể tạo announcement hoặc không, tùy `enabled_events`.

### 4. Render message

Ưu tiên render theo thứ tự:

1. Template đang bật, đúng `event_type` và `personality`.
2. Template system mặc định.
3. Câu fallback cố định trong code.

Biến hỗ trợ:

- `display_name`
- `late_minutes`
- `fine_amount_vnd`
- `fine_code`
- `fund_balance`

### 5. Queue và cooldown

TTS engine cần queue ở phía kiosk:

- Không phát hai câu cùng lúc.
- Deduplicate theo `event_id`.
- Tôn trọng `cooldown_seconds`.
- Có priority.
- Sự kiện payment/late có thể ưu tiên hơn on-time.
- Không phát trong quiet hours.
- Event bị bỏ qua trong quiet hours vẫn cập nhật UI bình thường.

## Kế Hoạch Theo Giai Đoạn

### P0. Áp dụng cấu hình cơ bản cho kiosk

- Tải `tts_settings` khi mở kiosk.
- Áp dụng locale, preferred voice, rate và pitch.
- Dùng chung TTS engine cho event thật và nút test.
- Áp dụng enabled events cho check-in.
- Áp dụng quiet hours theo timezone tổ chức.
- Áp dụng cooldown tối thiểu.
- Broadcast khi manager lưu TTS settings để kiosk đang mở cập nhật không cần reload.

### P1. Chuẩn hóa check-in announcements

- Bổ sung event type `check_in`, hoặc thống nhất mapping `on_time`/`late`.
- Payload check-in chứa attendance state và late minutes.
- Toast vẫn hiển thị độc lập với TTS.
- Kiosk feed, QR rotation, toast và TTS dùng cùng một event.
- Check-in thất bại không đọc mặc định.

### P1. Áp dụng cho thanh toán và tiền phạt

- Khi payment thành công, phát `payment` nếu được bật.
- Khi fine chuyển trạng thái, cập nhật UI và cân nhắc phát announcement.
- Khi `fine_allocations` làm thay đổi outstanding amount, phát event tương ứng.
- Kiosk, fine detail, payment QR và late list dùng chung status event.

### P1. Áp dụng cho title và fund balance

- Xác định producer tạo `achievement` event khi title thay đổi.
- Xác định producer tạo `fund_balance` event khi số dư thay đổi.
- Chỉ đọc fund balance ở kiosk/manager được cấu hình, tránh đọc mọi transaction nhỏ.

### P2. Message packs và personality

- Seed system templates cho từng personality.
- Thêm UI quản lý message packs/templates nếu cần cho manager.
- Chọn template tránh lặp qua `tts_pool_states`.
- Test template với dữ liệu mẫu trước khi lưu.

### P2. Announcement queue server-side

Chỉ triển khai nếu cần đảm bảo nhiều kiosk dùng chung thứ tự/phát một lần:

- Tạo `announcement_events` từ server-side domain event.
- Lease event cho kiosk primary speaker.
- Dùng `kiosk_sessions.is_primary_speaker` để tránh nhiều kiosk cùng đọc.
- Broadcast event đã render text đến speaker.
- Xử lý retry, expiry và spoken timestamp.

Giai đoạn này không cần làm trước khi P0/P1 hoàn tất.

## Quyền Và An Toàn

- Chỉ active member trong organization được nhận Broadcast.
- Không gửi số tài khoản, raw webhook hoặc dữ liệu thanh toán nhạy cảm.
- TTS config chỉ manager được cập nhật.
- Kiosk chỉ được đọc payload đã được giới hạn.
- Không dùng `user_metadata` cho authorization.
- Trigger `SECURITY DEFINER` phải giữ `search_path = ''` và giới hạn payload.

## Tiêu Chí Hoàn Thành P0

- Đổi locale trong Settings, kiosk áp dụng sau khi nhận config mới.
- Đổi voice ưu tiên, kiosk dùng đúng voice nếu thiết bị có voice đó.
- Đổi rate/pitch, câu test và event thật đều dùng giá trị mới.
- Tắt một event trong `enabled_events`, event đó không đọc nhưng UI vẫn cập nhật.
- Bật quiet hours, event trong khung giờ không đọc nhưng vẫn có toast/feed.
- Cooldown ngăn đọc dồn nhiều event liên tiếp.
- Reload kiosk không làm mất cấu hình server.
- Không có câu TTS nào bị cắt phần đầu do `cancel()`.
- Loa/browser lỗi vẫn có toast và activity feed.

## Kiểm Thử

### Kiosk

- Check-in đúng giờ.
- Check-in trễ.
- Check-in thất bại.
- Nhiều lượt check-in liên tiếp.
- Thanh toán thành công.
- Tắt TTS bằng toggle local.
- Quiet hours bật/tắt.
- Browser không có voice tiếng Việt.
- Reload kiosk.
- Hai kiosk cùng organization.

### Settings

- Mỗi personality.
- Mỗi enabled event.
- Cooldown 0, cooldown lớn.
- Locale và voice không tồn tại.
- Rate/pitch biên 0.5/2 và 0/2.
- Quiet hours qua nửa đêm.

### Regression

- Toast vẫn hiển thị khi TTS tắt.
- Check-in state vẫn được cập nhật dù TTS lỗi.
- Payment status vẫn cập nhật dù TTS lỗi.
- Không lộ dữ liệu thành viên khác ngoài display name cần thiết.
- Không tạo thêm polling dày trên kiosk.

## Thứ Tự Thực Hiện

1. Hoàn thiện tài liệu này trước khi code.
2. Tạo TTS engine dùng chung và model config.
3. Nạp/broadcast TTS settings cho kiosk.
4. Chuẩn hóa check-in event và apply enabled events/quiet/cooldown.
5. Kết nối payment/fine event.
6. Đánh giá achievement/fund balance event.
7. Sau cùng mới triển khai message template pool và primary speaker queue nếu cần.
