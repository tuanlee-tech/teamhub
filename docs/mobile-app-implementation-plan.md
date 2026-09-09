# TeamHub: Kế hoạch UI/UX mobile-first và checklist triển khai (cập nhật 2026-09-09)

Ngày lập gốc: 2026-09-09. Viết lại lần 2 bởi agent làm việc trực tiếp với chủ codebase.

Trạng thái: **Quyết định đã chốt và phạm vi đã gom lại để bắt đầu build.** Không làm demo/route `/demo`; không làm passcode cho manager; có thêm role `kiosk`. Các checkbox chỉ được đánh dấu sau khi thực hiện và kiểm chứng trên code thật.

> **Build status (2026-09-09):** hợp nền vào nhánh hiện tại. Đã dựng các route của luồng nhân viên và kiosk (mục 5.1–5.6, 5.8, 5.9), checkpoint hợp lệ lúc xong: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` đều pass.

> Các checkbox của phân khúc đã làm được đánh dấu ở mục 5.1–5.6, 5.8, 5.9; các phân khúc 5.7 (grid quản lý touch-first) và TTS/đối soát chưa hoàn thành.

## 1. Mục tiêu

- Chuyển từ giao diện website/dashboard sang trải nghiệm ứng dụng mobile-first kiểu native; khoảng 99% người dùng dùng điện thoại hoặc tablet.
- Giữ nền Next.js, Supabase và PWA hiện tại; không viết lại ứng dụng iOS/Android trong phạm vi này.
- Hỗ trợ tablet dọc/ngang, giữ trạng thái khi xoay màn hình.
- Tái sử dụng UI atoms qua `@/components/ui`, giữ nhận diện TeamHub và tối ưu cho thao tác cảm ứng.
- **Làm thật, không có chế độ demo**: route thật, dữ liệu thật; khi DB chưa đáp ứng thì bổ sung migration và seed dữ liệu mẫu có chủ đích cho môi trường dev.
- Một tablet đặt tại văn phòng dùng tài khoản role `kiosk` để phát QR/OTP check-in và hiển thị danh sách đi trễ; manager vắng mặt vẫn có thiết bị cho mọi người quét.

## 2. Quyết định đã chốt

- Không cần landing page giới thiệu. Điểm vào ứng dụng là auth hoặc trang chủ tùy phiên đăng nhập; onboarding ngắn chỉ dành cho lần đầu/hoàn thiện thông tin bắt buộc (display name + username).
- Có ba role: **`member`**, **`manager`**, **`kiosk`**. Không tạo role `admin` mới.
- Member và manager cùng có trải nghiệm nhân viên; manager mặc định vào trang chủ có check-in. Role `kiosk` là tài khoản thiết bị, mặc định vào màn Check-in QR/OTP.
- Không làm passcode/bảo vệ router cho manager: tài khoản không còn dùng chung (tablet dùng role `kiosk`) nên không cần lớp khóa. Việc quản trị của *người dùng đã đăng nhập* vẫn được bảo vệ bằng RLS/RPC guard trên server.
- Trang chủ có bottom navigation, QR là thao tác nhanh nổi bật ở giữa. Kiosk có thanh điều hướng riêng hai mục **Check-in / Đi trễ**.
- QR hub chỉ có hai tab: **Quét mã** và **QR thanh toán phạt**.
- Quét mã phục vụ check-in QR/OTP. QR thanh toán là tài khoản tổ chức, kèm nội dung định danh người được thanh toán.
- **QR thanh toán đại diện một order cụ thể**: số tiền của order đó + tài khoản tổ chức + quy tắc nội dung chuyển khoản đang cấu hình. Không đại diện tổng dư nợ. Trang chủ có thể hiển thị tổng dư nợ chỉ để tham khảo; con số đó không quyết định số tiền trên QR.
- Phiếu phạt có hai tab **Cần thanh toán / Lịch sử**, có màn hình chi tiết.
- Danh sách đi trễ có hai tab **Chưa thanh toán / Đã thanh toán**, mặc định hôm nay, chỉ đọc là chính.
- Danh sách đi trễ bao gồm check-in trễ và auto-late; chỉ hiển thị QR thanh toán, tuyệt đối không có QR check-in.
- Danh sách đi trễ **chỉ dành cho người trong tổ chức** (đã đăng nhập, active member/manager/kiosk). Chưa triển khai link công khai không đăng nhập ở phạm vi này.
- Không xây tính năng/chế độ/route trình chiếu riêng. Người dùng tự chia sẻ màn hình lên TV.
- Manager có màn hình grid icon chức năng, toggle tự động duyệt thành viên và module đối soát giao dịch không khớp.
- Auto-approve chỉ là toggle đơn giản: bật → mọi đăng ký mới được duyệt tự động; tắt → đăng ký mới chờ manager duyệt/từ chối. Không duyệt backlog, không cấp manager, không kích hoạt lại tài khoản bị từ chối/vô hiệu hóa.
- Cấu hình âm thanh/giọng MC phải có nghe thử.
- Màn hình check-in và Danh sách đi trễ phải có UI kích hoạt TTS bằng thao tác người dùng.
- Mọi thiết bị đang mở Danh sách đi trễ và đã bật MC đều đọc độc lập. Không chọn loa chính, không bầu thiết bị phát, không khóa phát giữa các thiết bị.
- OTP: mã ngắn hiển thị trên kiosk, không gửi SMS/email, theo tổ chức và phiên kiosk, có thời hạn và giới hạn thử tại server.
- Ứng dụng giả định một tổ chức (organization mặc định); không mở rộng multi-organization UX.

## 3. Điều hướng và phân quyền

### 3.1. Luồng vào ứng dụng

```text
Mở ứng dụng
  Chưa đăng nhập -> Auth (login / register / Google)
  Thiếu display_name hoặc username -> Onboarding
  Membership pending -> Chờ duyệt
  Membership rejected -> Thông báo bị từ chối
  Active:
    role member    -> Trang chủ nhân viên
    role manager   -> Trang chủ nhân viên (kèm lối Quản lý)
    role kiosk     -> Màn Check-in QR/OTP (kiosk)
```

### 3.2. Các lộ trình hiện có

```text
Nhân viên (member + manager), bottom navigation:
  Trang chủ | Phiếu phạt | QR | Đi trễ | Cá nhân

Trang chủ
  Check-in GPS (QR/OTP luôn truy cập được)
  Tổng dư nợ (tham khảo) + lối tắt tới Phiếu phạt
  Ô Quản lý (chỉ manager)

QR hub (khoảng hai dấu chấm tương tác)
  Quét mã (camera / nhập OTP)
  QR thanh toán phạt (theo order đang chọn)

Phiếu phạt
  Cần thanh toán / Lịch sử
  Chi tiết order

Đi trễ
  Chọn ngày -> hai tab Chưa thanh toán / Đã thanh toán
  Phóng lớn QR thanh toán của order

Cá nhân
  Hồ sơ / Đăng xuất / Lối vào Quản lý (chỉ manager)

Kiosk (role kiosk), thanh điều hướng riêng:
  Check-in QR/OTP   (mặc định sau đăng nhập)
  Đi trễ            (chọn ngày, hai tab, QR thanh toán, bật MC)
```

### 3.3. Ma trận quyền theo role

| Chức năng | member | manager | kiosk |
|---|---|---|---|
| Check-in GPS bản thân | Có | Có | Không |
| Quét QR / nhập OTP bản thân | Có | Có | Không |
| Phiếu phạt, chi tiết, QR thanh toán cá nhân | Có | Có | Không |
| Danh sách đi trễ theo ngày (dữ liệu tối thiểu) | Có | Có | Có |
| Phóng lớn QR thanh toán trong Đi trễ | Có | Có | Có |
| Bật/tắt MC trên thiết bị | Có | Có | Có |
| Phát QR/OTP check-in (challenge) | Không | Có | Có |
| Cá nhân (hồ sơ/đăng xuất) | Có | Có | Không |
| Grid quản lý và mọi công cụ quản lý | Không | Có | Không |
| Hồ sơ, giao dịch, thông tin nhạy cảm của người khác | Không | Giới hạn theo nhu cầu | Không |

- Giữ tối đa năm mục bottom navigation cho member/manager; không thêm tab thứ sáu.
- Màn hình QR thay bottom navigation chính bằng hai tab riêng, có nút quay lại.
- Màn hình chi tiết có route/back rõ ràng; hỗ trợ refresh, deep link và Back của trình duyệt.
- Manager dùng được chức năng nhân viên cho chính mình. Kiểm tra quyền ở server/API/RPC và RLS, không chỉ ẩn icon.
- Role `kiosk` không thuộc roster, không chịu ngày công, không phát sinh auto-late/phạt, không bị tính vào thống kê, không được xem hồ sơ/giao dịch riêng. Mọi quyền của kiosk gắn với phiên kiosk đang hoạt động.

### 3.4. Dự kiến route thật

```text
/                          -> điều hướng theo trạng thái phiên (auth/onboarding/pending/home)
/(auth)/login, register    -> giữ luồng xác thực hiện có
/(auth)/onboarding         -> hoàn thiện display_name + username
/(auth)/pending            -> chờ duyệt
/member                    -> trang chủ nhân viên
/fines                     -> phiếu phạt (tab trong URL: ?tab=unpaid|history)
/fines/[fineCode]          -> chi tiết order/phiếu
/qr?tab=scan|payment       -> QR hub hai tab (thay bottom nav, có quay lại)
/late?date=YYYY-MM-DD&tab=unpaid|paid -> danh sách đi trễ theo ngày
/profile                   -> cá nhân
/manager                   -> grid quản lý
/manager/members           -> Thành viên (+ toggle auto-approve)
/manager/roster            -> Ngày công
/manager/penalties         -> Khung phạt
/manager/settings?tab=attendance|payments|voice -> Ca làm & GPS / Thanh toán / Âm thanh & MC
/manager/reconciliation    -> Đối soát giao dịch
/manager/kiosk             -> Thiết bị/tài khoản kiosk, lối vào màn kiosk
/kiosk                     -> Trang kiosk (Check-in QR/OTP + tab Đi trễ)
```

Nguyên tắc: tab, ngày và order đã chọn nằm trong URL search params để không mất khi refresh/xoay màn hình; chi tiết là route thật, không phải modal đơn thuần; back quay về nguồn trong app hợp lệ.

## 4. Tổ chức code (duy trì và mở rộng)

Giữ nguyên cấu trúc Next.js hiện tại, gom theo tính năng:

```text
src/
  app/                      # Route thật + guard server + khởi tạo dữ liệu
    (auth)/                 # login, register, onboarding, pending
    member/ fines/ late/ profile/   # luồng nhân viên
    qr/ fines/[fineCode]/   # luồng tập trung: header/back, không bottom nav 5 mục
    manager/                # grid + các module quản lý
    kiosk/                  # màn Check-in QR/OTP + tab Đi trễ
  components/
    ui/                     # Atoms dùng chung (import qua @/components/ui)
    app-shell/             # BottomNav, AppHeader, BackButton, TabBar, trạng thái trang
    member/                # Trang chủ, check-in (nhận dữ liệu và gọi action, không tự query)
    qr/                    # Quét mã (camera/OTP), QR thanh toán order, copy/tải/share
    fines/                 # Danh sách + chi tiết order
    late/                  # Danh sách đi trễ theo ngày
    manager/               # Grid, thành viên, roster, khung phạt, cài đặt, đối soát, kiosk
    tts/                   # Bộ phát dùng chung, nghe thử, nút kích hoạt theo trang
  lib/
    domain/                # Quy tắc thuần (late minutes, trạng thái phiếu, phân bổ…) + test
    qr/                    # Tạo/hiển thị ảnh QR, hợp đồng order/thanh toán
    tts/                   # Hàng đợi phát, chống trùng ID sự kiện (chỉ khi triển khai)
  server/ (nếu cần)         # Tách logic server chỉ dùng trong app router, tránh chạy ở client
supabase/migrations/       # Migration mới cho kiosk, OTP, auto-approve, đối soát, seed hỗ trợ
supabase/seed-*.ts         # Seed dữ liệu mẫu có chủ đích cho dev (không tự chèn vào prod)
```

Quy tắc:
- Component màn hình **không tự import Supabase hay fixtures**; nhận dữ liệu/action từ route hoặc prop.
- Route chỉ ghép màn hình, chạy guard và gọi query/action.
- Chỉ tạo component dùng chung khi thực sự dùng lại ở ≥2 nơi; colocate component tách biệt theo tính năng.
- Không giới thiệu Redux/repository layer/fetching framework mới.
- Seed chỉ nạp dữ liệu mẫu vào môi trường dev/test có kiểm soát; không tự động chèn vào dữ liệu đang dùng thật.
- Trạng thái cho phép phát âm thanh không được tự khôi phục sau reload; chỉ dùng trong phiên.

## 5. Checklist tính năng

### 5.1. App shell, auth và onboarding

- [x] Thay điểm vào landing page bằng điều hướng theo trạng thái đăng nhập/hồ sơ/phê duyệt (mục 3.1).
- [x] Giữ đăng nhập, đăng ký, Google và các luồng xác thực hiện có.
- [ ] Onboarding ngắn: display name + username bắt buộc, phần hướng dẫn có thể bỏ qua.
- [x] Không xin quyền camera/GPS trước khi người dùng cần sử dụng.
- [x] Header gọn, bottom navigation, trạng thái active, back và safe area.
- [x] Manager chuyển về trang chủ nhân viên sau auth; kiosk chuyển về màn Check-in sau đăng nhập.
- [ ] Có loading, empty, error, offline và retry nhất quán.
- [ ] Điều chỉnh PWA start URL và kiểm tra hành vi standalone; safe area, dvh, keyboard.

### 5.2. Trang chủ và check-in

- [x] Lời chào, ngày làm việc, ca làm và trạng thái hôm nay (on time/late/auto-late/chưa check-in).
- [x] Nút check-in GPS rõ ràng, dễ chạm; QR/OTP luôn truy cập được.
- [x] Hiển thị đang lấy vị trí, đang xác nhận, thành công và lỗi riêng biệt.
- [x] Hỗ trợ bị từ chối GPS, không có GPS, sai số lớn và ngoài phạm vi; có lối sang QR/OTP.
- [x] Giờ và trạng thái thành công lấy từ server, không tự tạo giờ xác nhận ở client.
- [x] Không coi mọi bản ghi attendance tồn tại là đã check-in; auto-late với `checked_in_at = null` vẫn hiện nút check-in.
- [ ] Hiển thị tổng dư nợ (tham khảo), số phiếu và lối tắt tới thanh toán.
- [x] Hiển thị ô Quản lý theo role.

### 5.3. QR hub: Quét mã

- [x] Camera toàn màn hình với khung quét, hướng dẫn và nút quay lại.
- [ ] Flash khi thiết bị hỗ trợ; xử lý camera bị từ chối hoặc không khả dụng.
- [x] Nhập OTP thay thế camera; xác thực thời hạn và giới hạn thử tại server.
- [x] Chống gửi trùng khi đang xử lý cùng lượt quét.
- [x] Chỉ báo thành công sau xác nhận từ server.
- [x] Nhận diện QR sai loại; không tự mở URL/nội dung tùy ý từ QR.
- [x] Dừng camera khi đổi sang tab thanh toán, rời trang hoặc chuyển nền.
- [x] Kiểm tra mã QR đúng tổ chức, còn hạn, bị thu hồi; nhiều kiosk cùng phát mã không thu hồi nhau.

### 5.4. QR hub: QR thanh toán phạt

- [x] QR đại diện **một order cụ thể**: số tiền order, người được thanh toán, tổ chức/chủ tài khoản nhận tiền.
- [x] Hiển thị ngân hàng, số tài khoản, số tiền và nội dung chuyển khoản chính xác (theo `transfer_description_rule`).
- [x] Mã thanh toán bất biến theo order/membership trong tổ chức; không dùng tên/username làm định danh chính.
- [x] Nổi bật nút copy nội dung chuyển khoản; copy số tài khoản, số tiền và toàn bộ thông tin.
- [x] Tải ảnh QR kèm thông tin cần thiết, chia sẻ bằng khả năng của thiết bị; fallback tải/mở ảnh khi không hỗ trợ sharing.
- [ ] Cung cấp ảnh qua cơ chế phù hợp (same-origin image) không phụ thuộc redirect cross-origin hiện tại.
- [x] Hiển thị rõ các khoản nợ/số tiền mà order đang đại diện (số tiền gốc, đã đóng, còn dư).
- [x] Khi không còn nợ, hiển thị trạng thái hết nợ, không thúc giục chuyển tiền.
- [ ] Tải lại trạng thái khi quay lại từ ứng dụng ngân hàng (focus/visibility); có nút kiểm tra thủ công.

### 5.5. Phiếu phạt và chi tiết

- [x] Hai tab Cần thanh toán / Lịch sử.
- [x] Danh sách có ngày, mã phiếu, thông tin đi trễ, số tiền còn nợ và trạng thái.
- [x] Chi tiết có số tiền gốc, phần đã phân bổ, dư nợ và thông tin giao dịch được phép xem.
- [x] QR chi tiết gắn với phiếu/order cụ thể, không nhầm với QR định danh member.
- [x] Có copy/tải QR và thông tin chuyển khoản như QR hub.
- [x] Phân biệt đã thanh toán và được miễn (waived); không trình bày miễn phạt như giao dịch đã trả.
- [x] Không tự đánh dấu đã trả từ việc nhấn nút, tải ảnh hoặc mở app ngân hàng.
- [x] Chỉ cho member xem chi tiết phiếu/giao dịch của chính mình trong luồng cá nhân.

### 5.6. Danh sách đi trễ theo ngày

- [x] Chọn ngày, mặc định hôm nay theo múi giờ tổ chức.
- [x] Hai tab Chưa thanh toán / Đã thanh toán.
- [x] Hiển thị đúng check-in trễ và auto-late, không tạo giờ check-in giả.
- [x] Danh tính, số phút/thông tin trễ và tiền còn nợ dễ đọc.
- [x] Chỉ QR thanh toán theo phiếu/order; nhấn phóng lớn để dễ quét.
- [x] Phiếu đã trả không tiếp tục hiển thị QR yêu cầu trả tiền.
- [x] Xử lý phiếu được miễn riêng (badge riêng), không tính vào nhóm đã thanh toán.
- [ ] Cập nhật sau đối soát; hiển thị thời điểm cập nhật và lỗi kết nối.
- [x] Chỉ công khai dữ liệu tối thiểu trong tổ chức; không lộ email, GPS hoặc giao dịch ngân hàng chi tiết.
- [x] Responsive điện thoại/tablet; không có tính năng trình chiếu riêng.
- [ ] Tích hợp UI bật/tắt MC và phát sự kiện thanh toán phù hợp với ngày đang xem.

### 5.7. Cá nhân và quản lý

- [x] Cá nhân: tên, username, ảnh/chữ viết tắt, tổ chức, vai trò, trạng thái và đăng xuất.
- [ ] Grid quản lý: Thành viên, Ngày công, Khung phạt, Ca làm & GPS, Thanh toán, Đối soát giao dịch, QR check-in (kiosk), Âm thanh & MC.
- [ ] Lối phát QR check-in là chức năng riêng (kiosk/manager), không nằm trong Danh sách đi trễ.
- [ ] Tối ưu các trang quản lý bên trong cho cảm ứng; không chỉ đổi trang hub.
- [ ] Danh sách/bảng quản lý trên mobile vẫn cung cấp đủ thông tin bằng card hoặc chi tiết.

### 5.8. Kiosk (tablet, role `kiosk`)

- [x] Thêm role `kiosk` vào `app_role`; tài khoản kiosk do manager tạo (không tự đăng ký role này).
- [x] Kiosk mặc định vào màn **Check-in QR/OTP**; phát mã trong khung giờ ca làm đã cấu hình, ngoài ca hiển thị ca tiếp theo, không có mã còn hiệu lực.
- [x] Kiosk có tab **Đi trễ** với chọn ngày, hai tab, phóng lớn QR thanh toán, bật/tắt MC.
- [x] Kiosk tự cập nhật mã khi hết hạn; nhiều kiosk cùng tổ chức không thu hồi mã của nhau.
- [x] Kiosk không truy cập grid quản lý, cá nhân, hồ sơ người khác, đối soát hoặc chi tiết giao dịch ngân hàng.
- [x] Guard server (`requireActiveMember("kiosk")` hoặc tương đương), RPC challenge phân biệt manager/kiosk, RLS giới hạn màn hình kiosk.
- [x] Kiosk không thuộc roster, không tự check-in, không phát sinh fines, không nằm trong member_stats.
- [x] Không cần passcode/khóa màn (đã chốt bỏ).

### 5.9. Tự động phê duyệt thành viên

- [x] Toggle trong Quản lý -> Thành viên -> Cài đặt phê duyệt; mặc định tắt.
- [x] Bật → mọi đăng ký mới được duyệt tự động; tắt → đăng ký mới chờ manager duyệt/từ chối.
- [x] Không tự duyệt backlog đang chờ khi bật.
- [x] Không cấp manager, không kích hoạt lại tài khoản bị từ chối/vô hiệu hóa.
- [x] Tắt toggle không thu hồi quyền của người đã được duyệt.
- [x] Ghi audit người thay đổi cấu hình và nguồn phê duyệt (auto/manual).
- [ ] Xác định thời điểm membership mới bắt đầu chịu quy tắc ngày công (kéo vào roster từ ngày làm việc chưa bắt đầu tại thời điểm duyệt) để tránh phạt ngoài dự kiến.

### 5.10. SePay và đối soát thủ công

- [ ] Lưu giao dịch hợp lệ vào inbox trước khi xử lý nghiệp vụ; xác thực webhook HMAC theo hợp đồng tích hợp (sha256= trên `{timestamp}.{raw}` và kiểm tra `X-SePay-Timestamp`).
- [ ] Gắn đúng tổ chức qua mapping tài khoản ngân hàng rõ ràng; sự kiện chưa xác định tổ chức không hiện cho manager bất kỳ; backfill chỉ khi có bằng chứng an toàn.
- [ ] Ghi sổ số tiền **thực nhận**; không làm mất chênh lệch so với tiền phiếu (chuyển thiếu giữ phần dư nợ, chuyển thừa giữ tiền chưa phân bổ cho manager xử lý).
- [ ] Chống xử lý lặp theo giao dịch nhà cung cấp; retry trả kết quả nhất quán; đồng bộ trạng thái sự kiện/giao dịch/phân bổ/phiếu trong một transaction.
- [ ] Giữ parser mã phiếu hiện có cho mã đã phát hành; mã phiếu cũ đã trả đưa vào hàng chờ gợi ý member, không tự chuyển sang phiếu mới.
- [ ] Hai tab đối soát Cần xử lý / Đã xử lý, badge số khoản chờ.
- [ ] Lọc ngày giao dịch/khoảng ngày theo múi giờ tổ chức; phân biệt ngày nhận webhook với ngày giao dịch.
- [ ] Tìm theo mã giao dịch, nội dung, member và lý do không khớp; có nút Tất cả cần xử lý.
- [ ] Chi tiết giữ nội dung gốc, mã tham chiếu, số tiền thực nhận và lý do không khớp.
- [ ] Cho quản lý chọn member và phiếu còn nợ, nhập/phê duyệt số tiền phân bổ; hiển thị tổng phân bổ và tiền còn dư trước khi xác nhận.
- [ ] RPC kiểm tra role, tổ chức, số dư và trạng thái thực tế; khóa transaction/phiếu chống duyệt đồng thời; không phân bổ quá tiền nhận hoặc dư nợ; chỉ tất toán phiếu khi đủ tiền.
- [ ] Audit người xử lý, lý do, trước/sau; sửa sai qua quy trình điều chỉnh có dấu vết.
- [ ] Seed dữ liệu mẫu sự kiện (api tĩnh) để module đối soát kiểm thử được khi chưa có webhook thật.

### 5.11. TTS: kích hoạt, nghe thử và phát sự kiện

- [ ] Bộ phát dùng chung có bật/tắt, nghe thử, hàng đợi, dừng và xử lý lỗi; không chặn chức năng chính khi TTS tắt/lỗi.
- [ ] Check-in và Danh sách đi trễ có nút Bật âm thanh; nút bật phát câu xác nhận ngắn ngay trong thao tác.
- [ ] Reload/phiên mới cần kích hoạt lại; không coi cờ local storage là bằng chứng được phép phát; giữ trạng thái trong phiên khi còn hoạt động, kích hoạt lại khi resume bị chặn.
- [ ] Phân biệt tắt trên thiết bị với tắt bởi cấu hình tổ chức.
- [ ] Cấu hình có giọng, tốc độ, cao độ, phong cách, câu mẫu và **Nghe thử / Dừng**; nghe thử dùng giá trị chưa lưu, không tạo sự kiện thật; báo giọng phụ thuộc thiết bị.
- [ ] Check-in: chỉ phát sau xác nhận server; quét trùng không đọc lặp.
- [ ] Thanh toán: chỉ phát sau đối soát thành công, không phát khi QR mới bị quét; giao dịch chưa match không đọc tên hoặc tuyên bố đã trả.
- [ ] Thanh toán một phần không đọc là hoàn tất; nội dung theo trạng thái thực tế.
- [ ] Chỉ nhận sự kiện mới phù hợp với ngày đang xem; không đọc toàn bộ lịch sử khi bật/reload; chống trùng theo ID sự kiện trong phiên.
- [ ] Mọi thiết bị bật MC đọc độc lập; không dùng primary-speaker lease/election; rời trang dừng hàng đợi của trang đó.
- [ ] Tôn trọng cấu hình sự kiện, giờ yên lặng/cooldown; câu cà khịa có mức độ; không đọc tài khoản ngân hàng hoặc nội dung chuyển khoản.

Lưu ý: ứng dụng không quan sát thao tác quét QR trong app ngân hàng. Sự kiện MC thanh toán là kết quả đối soát, không phải lượt quét. Phát nền không được bảo đảm trên mobile web.

## 6. Nền code, phần cần sửa và chiến lược seed

### 6.1. Đã có sẵn (tái sử dụng)

| Khu vực | Hiện trạng |
|---|---|
| `src/lib/auth.ts` | `getMembershipContext()` + `requireActiveMember("manager")`; thêm nhánh role `kiosk` |
| `src/app/(auth)/actions.ts` | login/register/Google/onboarding/signOut đầy đủ; giữ nguyên |
| `src/components/ui/` | Đủ atoms cần dùng (PaperPanel, Stamp, FormInput, PrimaryButton, Toggle, Modal, Toast, DividedList, CurrencyText…); bổ sung BottomNav, SegmentedTabs, PageState khi cần chung |
| `src/components/module-shell.tsx` | Thay bằng app shell gọn + bottom nav, không phá quyền |
| `src/lib/domain/attendance.ts`, `payment.ts` | Quy tắc thuần + test; rà soát khớp với SQL gần nhất |
| `src/app/api/cron/route.ts`, `auto_late_idempotent`, `ensure_todays_roster` | Không thay đổi trong phạm vi UI; chỉ sửa nếu checklist 5.9/5.2 cần mốc ngày công |
| `src/app/api/vietqr/[fineCode]/route.ts` | Cơ sở QR; cần chuyển sang **theo order với số dư nợ thật** và cung ảnh same-origin để tải/share |

### 6.2. Cần migration/seed (DB chưa đáp ứng)

| Nhu cầu | Việc cần làm |
|---|---|
| Role `kiosk` | Thêm `'kiosk'` vào `public.app_role`; seed tài khoản kiosk dev; RLS/RPC tách quyền; loại kiosk khỏi mọi logic roster/auto-late/member_stats |
| Màn QR/OTP kiosk | Quyền `create_kiosk_qr_challenge` hiện chỉ manager → cho manager **và kiosk** trong ca làm; seed trạng thái ca |
| OTP thay camera | Bảng OTP kiosk (mã ngắn, org + kiosk session, `expires_at`, giới hạn thử) + RPC kiểm tra/nhập; seed mã mẫu |
| Danh sách đi trễ theo ngày | Projection chỉ đọc dữ liệu tối thiểu (không email/GPS/giao dịch chi tiết); dùng attendance_records + fines hiện có; seed attendance/fines mẫu vài ngày gần nhất |
| Phiếu phạt cá nhân | Tận dụng `fines`; QR theo order với số dư nợ (original − allocated); seed fines đủ trạng thái (unpaid/paid/waived) |
| Đối soát thủ công | Cormat UI trên `sepay_webhook_events`/`fund_transactions`/`fine_allocations`; seed sự kiện mẫu: match, thiếu tiền, thừa tiền, mã phiếu cũ, không match |
| Auto-approve | Setting riêng (`auto_approve_members`), logic duyệt đăng ký mới; audit; seed mẫu thành viên pending + active |
| TTS nghe thử/phát | Scaffolding `tts_settings`/`announcement_events` đã có; bổ sung player + sự kiện sạch từ check-in/payment; seed cấu hình giọng mẫu |

Seed chỉ chạy qua script dev (`npm run db:seed*`), không tự chèn vào production. Không lặp lại kiểu migration tự ghi đè toàn bộ hàng cũ (như `quiet_default_off`).

### 6.3. Cần rà soát kèm

- Ngày UTC so với ngày theo múi giờ tổ chức (thống nhất helper dùng chung `current_work_date`).
- Challenge QR phải gắn đúng organization; rotation mã chỉ trong phạm vi kiosk session.
- Publication realtime thực tế (kiểm tra `supabase_realtime` có đủ bảng cần subscribe).
- Membership giả định một tổ chức (`.maybeSingle()`): giữ nguyên, tách tổ chức khi có yêu cầu.

## 7. Thứ tự thực thi

1. **Nền và schema:** migration role `kiosk`, setting auto-approve, OTP, seed attendance/fines/sự kiện đối soát; rà soát guard server và RLS.
2. **App shell:** thay `module-shell` bằng layout gọn, bottom nav, header/back, safe area; `/` điều hướng theo trạng thái phiên; kiosk layout riêng hai tab.
3. **Trang chủ và check-in:** sửa trạng thái hôm nay theo server (auto-late ≠ đã check-in), GPS + lối QR/OTP, tổng dư nợ tham khảo.
4. **QR/OTP token:** cấp challenge cho kiosk trong ca làm; OTP hạn + giới hạn thử; camera scan/OTP trên điện thoại; dừng camera đúng lúc; kiosk app.
5. **Phiếu phạt & QR thanh toán:** danh sách/chi tiết, QR theo order với số dư nợ, copy/tải/share same-origin, làm mới khi quay lại app.
6. **Danh sách đi trễ:** chọn ngày, hai tab, phóng QR thanh toán, MC bật/tắt, cập nhật sau đối soát.
7. **Đối soát thủ công:** hai tab, lọc/tìm, chi tiết, chọn member + phiếu, xác nhận phân bổ, audit; bộ phát sự kiện thanh toán.
8. **Quản lý touch-first:** grid 8 chức năng, thành viên + auto-approve, cá nhân, kiosk devices; tối ưu các màn hình hiện có.
9. **TTS:** bộ phát dùng chung, nghe thử, kích hoạt theo trang, sự kiện check-in/thanh toán theo ngày, chống trùng, nhiều thiết bị độc lập.
10. **Kiểm thử E2E/mobile/tablet/bảo mật/hồi quy:** cập nhật checklist theo kết quả thực tế; chạy đủ `lint`, `typecheck`, `test`, `build`.

## 8. Tiêu chí nghiệm thu

- [ ] Chạy `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`; ghi rõ lỗi môi trường nếu bị chặn.
- [ ] Test phân quyền trực tiếp qua URL/API/RPC, không chỉ menu: member/manager/kiosk/anon; kiosk không gọi được công cụ quản lý và không nằm trong roster/stats.
- [ ] Member và manager cùng thực hiện được check-in, xem phiếu và QR thanh toán cá nhân.
- [ ] Test mobile iOS Safari/PWA và Android Chrome; tablet dọc/ngang, màn hình hẹp, bàn phím và safe area.
- [ ] Xoay màn hình không mất tab/ngày/phiếu/form đang thao tác; refresh/deep link/Back giữ ngữ cảnh.
- [ ] Test GPS/camera bị từ chối, QR sai/hết hạn, OTP sai nhiều lần, quét trùng và chuyển nền.
- [ ] Test mã phiếu mới/cũ, mã member, không match, thiếu/thừa tiền, webhook lặp/delayed và hai quản lý cùng duyệt.
- [ ] Đối chiếu tổng tiền thực nhận, đã phân bổ và còn dư; không tạo thanh toán kép hoặc mất chênh lệch.
- [ ] Test tải/chia sẻ/copy ảnh trên thiết bị thật và quay lại từ app ngân hàng.
- [ ] QR being always per-order: amount, account, holder, description đúng; trạng thái hết nợ không hiện QR yêu cầu trả.
- [ ] Danh sách đi trễ không lộ email/GPS/giao dịch ngân hàng chi tiết; kiosk xem được data tối thiểu cùng tổ chức.
- [ ] Test TTS sau reload/resume, không có giọng, lỗi playback, nhiều sự kiện và nhiều thiết bị cùng bật MC.
- [ ] Không đọc lại lịch sử, không đọc trùng webhook, không đọc thanh toán chưa được xác nhận.
- [ ] Test toggle auto-approve bật/tắt, backlog, tài khoản bị khóa và mốc bắt đầu chịu ngày công.

## 9. Ngoài phạm vi

- Ứng dụng native iOS/Android viết riêng.
- Route `/demo` hoặc chế độ demo; dữ liệu mẫu chỉ qua seed có kiểm soát.
- Passcode/bảo vệ màn hình cho tài khoản manager (đã chốt bỏ; tablet dùng role kiosk).
- Landing page quảng bá.
- Chế độ trình chiếu, kết nối TV hoặc quản lý screen casting.
- QR check-in trên trang Danh sách đi trễ.
- Điều phối một loa chính giữa các thiết bị.
- Link công khai không đăng nhập cho Danh sách đi trễ (chưa có quyết định mở rộng).
- Ví tiền/số dư member, hoàn tiền tự động hoặc nghiệp vụ tài chính chưa được duyệt.
- QR scanner chuyển khoản ngân hàng tổng quát.
- Đồng bộ check-in/thanh toán offline hoặc bảo đảm TTS khi chạy nền.
- Multi-organization UX.