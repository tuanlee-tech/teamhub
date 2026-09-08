# TeamHub Routes And Features


## User-Facing Pages

| URL | Nhóm | Chức năng |
|---|---|---|
| `/` | Công khai | Trang chủ, điều hướng tới màn hình thành viên, quản lý và kiosk. |
| `/login` | Xác thực | Đăng nhập bằng username/mật khẩu hoặc Google. |
| `/register` | Xác thực | Đăng ký tài khoản mới, chờ manager duyệt. |
| `/onboarding` | Xác thực | Hoàn thiện tên hiển thị và username sau khi đăng nhập Google. |
| `/pending` | Xác thực | Hiển thị trạng thái tài khoản đang chờ duyệt hoặc bị từ chối. |
| `/offline` | Hệ thống | Màn hình khi mất kết nối mạng. |
| `/member` | Thành viên | Điểm danh bằng GPS hoặc QR, xem trạng thái điểm danh và tiền phạt trong ngày. |
| `/kiosk` | Kiosk | Màn hình điểm danh công khai, QR realtime, trạng thái và thông báo bằng giọng nói. |
| `/manager` | Quản lý | Dashboard điều hướng tới các chức năng quản trị. |
| `/manager/settings` | Quản lý | Cấu hình ca làm, múi giờ, giờ bắt đầu tính trễ, vị trí văn phòng, GPS, ngân hàng, VietQR và giọng MC. |
| `/manager/members` | Quản lý | Duyệt tài khoản mới, từ chối, duyệt lại và xem trạng thái thành viên. |
| `/manager/penalties` | Quản lý | Cấu hình các khung phạt theo số phút trễ và số tiền tương ứng. |
| `/manager/roster` | Quản lý | Cấu hình thành viên cần điểm danh trong từng ngày, loại hoặc khôi phục thành viên. Route giữ nguyên slug `roster`. |

## System Routes

| URL | Chức năng |
|---|---|
| `/auth/callback` | Nhận callback OAuth từ Google và tạo session. |
| `/auth/continue` | Kiểm tra profile/membership rồi điều hướng tới `/manager`, `/member`, `/pending` hoặc `/onboarding`. |
| `/auth/confirm` | Xác nhận link email và điều hướng người dùng. |
| `/api/cron` | Tạo ngày điểm danh, sinh danh sách thành viên và xử lý auto-late. |
| `/api/sepay/webhook` | Nhận webhook thanh toán từ SePay. |
| `/api/vietqr/[fineCode]` | Tạo QR thanh toán cho khoản phạt. |

## Domain Naming

| Internal term | UI term |
|---|---|
| Roster | Danh sách điểm danh |
| Roster day | Ngày điểm danh |
| Roster member | Thành viên trong danh sách điểm danh |
| Remove from roster | Loại khỏi ngày điểm danh |
| Restore roster member | Khôi phục vào ngày điểm danh |
| Auto-late | Tự động ghi nhận trễ |
| Attendance day | Ngày công |

## Notes

- Route `/manager/roster` giữ nguyên để không ảnh hưởng liên kết và URL hiện tại.
- Các route dưới `/manager` yêu cầu tài khoản manager đang active.
- `/member` yêu cầu thành viên active.
- `/kiosk` là màn hình công khai dành cho thiết bị điểm danh.

## Product Tours And Contextual Help

### Mục tiêu

Product tour dùng để hướng dẫn người dùng lần đầu sử dụng app. Tour phải ngắn, theo đúng ngữ cảnh của từng role và không làm cản trở thao tác chính.

- Dùng `Driver.js` cho tour, spotlight và popover.
- Mỗi tour có tối đa 3–5 bước.
- Mỗi route có tour riêng, không gộp toàn bộ app vào một tour dài.
- Luôn có nút `Bỏ qua` và cho phép mở lại bằng nút `? Hướng dẫn`.
- Không mở tour khi target chưa render hoặc dữ liệu cần thiết chưa tải xong.
- Không hiển thị tour trên `/auth/*`, `/offline` và các API route.

### Quy ước selector

Các element được highlight phải dùng selector ổn định, không dùng class Tailwind hoặc vị trí DOM.

```tsx
<section data-tour="member-check-in" />
<button data-tour="roster-sync">Đồng bộ thành viên</button>
```

Quy ước đặt tên:

| Prefix | Phạm vi |
|---|---|
| `member-*` | Tính năng của thành viên |
| `manager-*` | Tính năng chung của manager |
| `settings-*` | Cấu hình văn phòng |
| `penalties-*` | Khung phạt |
| `roster-*` | Danh sách người cần điểm danh |
| `members-*` | Quản lý tài khoản thành viên |
| `kiosk-*` | Màn hình kiosk |

### Quy tắc hiển thị

1. Xác định tour theo `role + pathname`.
2. Chỉ tự mở nếu người dùng chưa hoàn thành tour đó.
3. Lưu trạng thái hoàn thành theo từng tour, không dùng một cờ chung cho toàn app.
4. Ưu tiên lưu server để đồng bộ nhiều thiết bị; có thể dùng `localStorage` làm fallback.
5. Nếu một target không tồn tại, bỏ qua bước đó thay vì làm tour bị lỗi.
6. Sau khi đổi layout hoặc đổi tên target, tăng `tourVersion` để người dùng có thể xem lại tour mới.
7. Tour phải hoạt động tốt trên mobile; popover không được vượt khỏi viewport.

### Trạng thái tour đề xuất

```ts
type TourProgress = {
  tourId: string;
  version: number;
  completedAt?: string;
  skippedAt?: string;
};
```

Tour ID nên ổn định:

```text
member-home-v1
manager-dashboard-v1
manager-settings-v1
manager-penalties-v1
manager-roster-v1
manager-members-v1
kiosk-v1
```

## Tour Scenarios

### `/member` — `member-home-v1`

**Mục tiêu:** giúp thành viên biết cách điểm danh và xem kết quả.

| Bước | Target | Tiêu đề | Nội dung cần hiển thị |
|---|---|---|---|
| 1 | `member-check-in` | Điểm danh hôm nay | Đây là khu vực điểm danh. Bạn có thể dùng GPS hoặc QR tùy tình huống. |
| 2 | `member-gps-check-in` | Điểm danh bằng GPS | Bấm nút GPS khi đang ở trong khu vực văn phòng và cho phép trình duyệt truy cập vị trí. |
| 3 | `member-qr-check-in` | Điểm danh bằng QR | Nếu GPS không chính xác, dùng QR đang hiển thị tại kiosk văn phòng. |
| 4 | `member-attendance-status` | Kết quả điểm danh | Sau khi điểm danh, xem giờ, trạng thái trễ và khoản phạt tại đây. |

**Điều kiện:** chỉ chạy khi người dùng active và trang đã tải xong `CheckInCard`.

### `/manager` — `manager-dashboard-v1`

**Mục tiêu:** giúp manager hiểu các khu vực quản trị.

| Bước | Target | Tiêu đề | Nội dung cần hiển thị |
|---|---|---|---|
| 1 | `manager-settings` | Luật văn phòng | Cấu hình ca làm, giờ tính trễ, vị trí, ngân hàng và giọng MC. |
| 2 | `manager-members` | Thành viên | Duyệt và quản lý tài khoản được phép tham gia tổ chức. |
| 3 | `manager-penalties` | Khung phạt | Khai báo các mốc phút trễ và số tiền phạt. |
| 4 | `manager-roster` | Người cần điểm danh | Chọn ai phải có mặt trong từng ngày làm việc. |

### `/manager/settings` — `manager-settings-v1`

**Mục tiêu:** cấu hình luật hoạt động trước khi bắt đầu sử dụng.

| Bước | Target | Tiêu đề | Nội dung cần hiển thị |
|---|---|---|---|
| 1 | `settings-attendance` | Ca làm và giờ tính trễ | Cài timezone, giờ bắt đầu/kết thúc phiên và giờ bắt đầu tính trễ. |
| 2 | `settings-work-days` | Ngày làm việc | Chọn các ngày tổ chức cần điểm danh. |
| 3 | `settings-office-location` | Vị trí văn phòng | Cài tọa độ, bán kính cho phép và độ chính xác GPS tối đa. |
| 4 | `settings-bank` | Thanh toán và VietQR | Cấu hình tài khoản nhận tiền phạt và thông tin QR. |
| 5 | `settings-tts` | Giọng MC | Chọn sự kiện, giọng đọc, quiet hours và tốc độ phát. |

**Lưu ý:** cần gắn `data-tour` vào ba form lớn thay vì target từng input nhỏ ở bước đầu tiên.

### `/manager/penalties` — `manager-penalties-v1`

**Mục tiêu:** giúp manager hiểu threshold và cách khung phạt chuyển mức.

| Bước | Target | Tiêu đề | Nội dung cần hiển thị |
|---|---|---|---|
| 1 | `penalties-form` | Thêm khung phạt | Nhập số phút trễ và số tiền. Số tiền tự format theo đơn vị nghìn. |
| 2 | `penalties-threshold` | Mốc bắt đầu phạt | Ví dụ `1 phút` nghĩa là bắt đầu áp dụng từ phút trễ đầu tiên theo business rule. |
| 3 | `penalties-list` | Các khung hiện có | Mỗi khung hiển thị cả khoảng phút và khoảng giờ cụ thể. |
| 4 | `penalties-highest-tier` | Chỉ lấy mức cao nhất | Khi trễ nhiều hơn, hệ thống chỉ áp dụng khung cao nhất đã vượt qua, không cộng dồn. |

**Điều kiện:** nếu chưa có tier, vẫn chạy bước form nhưng bỏ qua bước danh sách.

### `/manager/roster` — `manager-roster-v1`

**Mục tiêu:** hướng dẫn manager cấu hình **ai cần điểm danh trong từng ngày**.

| Bước | Target | Tiêu đề | Nội dung cần hiển thị |
|---|---|---|---|
| 1 | `roster-date-select` | Chọn ngày | Chọn ngày cần cấu hình danh sách điểm danh. Route vẫn là `/manager/roster`. |
| 2 | `roster-sync` | Đồng bộ thành viên | Thêm các thành viên active vào ngày này. Không tạo bản ghi trùng. |
| 3 | `roster-required-count` | Ai cần điểm danh | Những người trong nhóm này sẽ được tính trạng thái đúng giờ, trễ và tiền phạt. |
| 4 | `roster-excluded-members` | Người được miễn | Dùng `Loại` cho người nghỉ phép/remote; họ không bị tính trễ hoặc phạt trong ngày. |
| 5 | `roster-restore-member` | Khôi phục | Dùng `Khôi phục` khi thành viên quay lại và cần điểm danh. |

**Điều kiện:**

- Nếu chưa có `attendance_day`, ưu tiên highlight `roster-sync` và giải thích cần đồng bộ trước.
- Nếu ngày đã `auto_late_processed` hoặc `closed`, chỉ hiển thị giải thích và bỏ qua bước thao tác.
- Không gọi đây là “Roster” trên UI; dùng “Danh sách điểm danh”, “Ngày công” hoặc “Người cần điểm danh”.

### `/manager/members` — `manager-members-v1`

**Mục tiêu:** giúp manager duyệt quyền tham gia tổ chức.

| Bước | Target | Tiêu đề | Nội dung cần hiển thị |
|---|---|---|---|
| 1 | `members-status-summary` | Tổng quan thành viên | Xem nhanh số người đang chờ duyệt, đang hoạt động và bị từ chối. |
| 2 | `members-pending-list` | Tài khoản chờ duyệt | Kiểm tra tên và username trước khi cho phép truy cập dữ liệu nhóm. |
| 3 | `members-approve` | Duyệt thành viên | Duyệt để tài khoản có thể vào màn hình thành viên và điểm danh. |
| 4 | `members-reject` | Từ chối hoặc duyệt lại | Từ chối tài khoản không hợp lệ; có thể dùng “Duyệt lại” sau này. |

### `/kiosk` — `kiosk-v1`

**Mục tiêu:** hướng dẫn người vận hành kiosk.

| Bước | Target | Tiêu đề | Nội dung cần hiển thị |
|---|---|---|---|
| 1 | `kiosk-qr` | QR điểm danh | Thành viên quét QR này để điểm danh tại văn phòng. |
| 2 | `kiosk-fullscreen` | Toàn màn hình | Bật toàn màn hình để kiosk dễ quan sát và sử dụng. |
| 3 | `kiosk-live-feed` | Trạng thái realtime | Theo dõi ai đã điểm danh, ai trễ và thông báo mới. |
| 4 | `kiosk-speech` | Thông báo bằng giọng nói | Kiosk có thể đọc các sự kiện theo cấu hình của manager. |

### Contextual Help

Ngoài tour tự động, các khu vực dễ gây nhầm lẫn cần có nút `? Hướng dẫn` hoặc tooltip:

| Khu vực | Nội dung help |
|---|---|
| Giờ bắt đầu tính trễ | Đây là thời điểm bắt đầu tính số phút trễ, không phải giờ bắt đầu phiên. |
| Threshold khung phạt | Mốc phút dùng để chọn khung phạt cao nhất đã vượt qua. |
| Đồng bộ thành viên | Thêm thành viên active vào danh sách ngày; không xóa người đã loại. |
| Ngày đã ghi nhận trễ | Hệ thống đã tự động xử lý người chưa điểm danh, nên không nên thay đổi danh sách. |
| Bán kính văn phòng | Khoảng cách tối đa từ tọa độ văn phòng mà GPS được chấp nhận. |

### Definition Of Done Cho Mỗi Tour

- Có `tourId` và `version` ổn định.
- Có target `data-tour` rõ ràng trong component tương ứng.
- Có nội dung tiếng Việt ngắn gọn, không dùng thuật ngữ nội bộ nếu không giải thích.
- Có trạng thái lần đầu, hoàn thành, bỏ qua và xem lại.
- Không lỗi khi target chưa xuất hiện hoặc danh sách chưa có dữ liệu.
- Kiểm tra desktop, mobile và trạng thái ngày trống/ngày đã đóng.
