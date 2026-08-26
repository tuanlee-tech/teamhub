# Feature Spec — Phase 1: Core Check-in System

**Version:** 1.0 | **Platform:** PWA (Web) — iOS & Android | **Scope:** MVP
**Last Updated:** 2026-08-24

---

## 1. Tổng quan

### 1.1 Bối cảnh
Công ty cần hệ thống điểm danh cho nhóm nhỏ. Không bắt buộc cài app native. Triển khai nhanh, chi phí thấp.

### 1.2 Kiến trúc 3 lớp
```
LỚP 1: GPS Check-in (PWA trên điện thoại)
    → Trong vùng: Check-in OK
    → Ngoài vùng / Lỗi GPS: Xuống Lớp 2

LỚP 2: Tablet Kiosk (tại công ty)
    → Smart QR động + OTP 6 số
    → Tự động tắt khi hết giờ hoặc đã đủ người check-in

LỚP 3: Anomaly Detection & Review
    → Device Fingerprint phát hiện gian lận
    → Bắt buộc selfie khi nghi ngờ
    → Quản lý duyệt thủ công + CCTV
```

### 1.3 Rủi ro cần kiểm soát
1. Mock GPS — giả lập vị trí từ xa.
2. Client Spoofing — sửa `lat/lng` bằng DevTools.
3. Replay Attack — chộp request cũ gửi lại.
4. Điểm danh hộ — đưa điện thoại cho người khác login.
5. Mất mạng — check-in đúng giờ nhưng request không đến server.

---

## 2. Luồng 1: GPS Check-in

### 2.1 Step-by-step

1. Nhân viên mở PWA (đã login, JWT lưu local).
2. Màn hình chỉ có **1 nút "Check-in"** duy nhất.
3. PWA gọi `GET /api/nonce` để xin nonce chống replay.
4. PWA lấy GPS qua `navigator.geolocation.getCurrentPosition()`.
5. PWA thu thập **Device Fingerprint** (hash từ các thông số thiết bị).
6. PWA gửi request lên server:
   ```json
   {
     "latitude": 10.7729,
     "longitude": 106.6982,
     "accuracy": 8.5,
     "timestamp": 1724500800000,
     "nonce": "abc123...",
     "device_fingerprint": "a3f7b2..."
   }
   ```
7. Server xử lý:
   - Verify nonce chưa dùng, timestamp không quá cũ.
   - Tự tính khoảng cách bằng **Haversine** (không tin `distance` từ client).
   - Kiểm tra 1 lần/ngày.
   - Kiểm tra Anomaly Rules (xem Luồng 3).
8. Kết quả:
   - **Trong vùng + Không anomaly** → `200 OK`, `status: VALID`.
   - **Ngoài vùng** → `403 Forbidden`, hiển thị fallback (Quét QR / Nhập OTP).
   - **Phát hiện anomaly** → `202 Accepted`, `status: PENDING_REVIEW`, bắt buộc selfie.

### 2.2 Business Rules

#### Rule 1: Anti-Replay (Nonce + Timestamp)

**Tại sao cần:** Nếu không có nonce, hacker có thể chộp request hợp lệ của đồng nghiệp, lưu lại và gửi lại để check-in hộ hoặc check-in vào ngày khác.

**Cách hoạt động:**
- Client gọi `GET /api/nonce` trước mỗi lần check-in.
- Server trả về `nonce` (UUID v4, TTL 5 phút).
- Client gửi kèm `nonce` và `timestamp` trong payload.
- Server kiểm tra:
  - `nonce` chưa từng được sử dụng (lưu Redis/DB, TTL 5 phút).
  - `|server_time - timestamp| <= 120 giây`.
- Vi phạm → `400 Bad Request`.

**Tại sao hiệu quả:** Hacker có chộp được request cũ cũng không dùng lại được vì nonce đã bị đánh dấu "đã dùng" và timestamp quá 2 phút bị từ chối.

#### Rule 2: Anti-Spoofing (Server tự tính khoảng cách)

**Tại sao cần:** Nếu server tin `distance` do client tự báo cáo, lập trình viên hoặc user biết JS có thể mở DevTools, sửa `distance: 0` dù đang ở Hà Nội.

**Cách hoạt động:**
- Client chỉ được gửi: `latitude`, `longitude`, `accuracy`, `timestamp`, `nonce`.
- **Cấm** client gửi `distance` hoặc `is_valid`.
- Server tự chạy Haversine từ `lat/lng` client đến tọa độ văn phòng.

**Giới hạn:** Nếu user sửa cả `lat/lng` thành đúng tọa độ văn phòng (bằng DevTools) thì server vẫn pass. Đây là giới hạn của web — chỉ có native app mới chống được hoàn toàn (đọc mock location flag từ OS). Tuy nhiên, rule này vẫn chặn được kẻ lười: gửi `distance: 0` nhưng `lat/lng` vẫn là Hà Nội.

#### Rule 3: One Check-in Per Day

**Tại sao cần:** Tránh nhân viên bấm nút 2 lần do lag mạng hoặc cố tình tạo nhiều bản ghi.

**Cách hoạt động:**
- Query kiểm tra trước khi INSERT: `SELECT id FROM checkins WHERE user_id = ? AND DATE(created_at) = CURRENT_DATE`.
- Nếu đã có bản ghi (bất kỳ status nào: VALID, PENDING_REVIEW, REJECTED, AUTO_ABSENT) → từ chối.
- Ngoại lệ: Khi REJECTED, bản ghi bị xóa (giải phóng slot), user có thể check-in lại 1 lần nếu còn trong giờ tablet.

#### Rule 4: Mock GPS Heuristic

**Tại sao cần:** GPS thật luôn có sai số (thường 3–20m, đôi khi 50m). Accuracy = 0m là bất thường, chỉ xuất hiện khi dùng app giả lập GPS.

**Cách hoạt động:**
- Nếu `accuracy == 0m` hoặc 2 lần lấy GPS cách nhau 0.5s nhảy > 1km → gắn cờ `suspicious_gps: true`.
- Không chặn hoàn toàn (web không chắc chắn), nhưng kết hợp với Anomaly Detection để trigger review.

### 2.3 Khái niệm kỹ thuật trong luồng này

#### 2.3.1 Công thức Haversine

Dùng để tính khoảng cách giữa 2 điểm trên mặt cầu Trái Đất từ vĩ độ và kinh độ.

**Tại sao không dùng khoảng cách Euclid thông thường?** Vì Trái Đất là hình cầu, không phải mặt phẳng. 2 điểm cách nhau 1 độ kinh độ ở xích đạo (~111km) khác xa so với ở cực Bắc (~0km). Haversine xử lý được độ cong này.

**Công thức:**
```
a = sin²(Δφ/2) + cos(φ₁) · cos(φ₂) · sin²(Δλ/2)
c = 2 · atan2(√a, √(1−a))
d = R · c
```

Trong đó:
- `φ₁, λ₁` = vĩ độ, kinh độ điểm 1 (nhân viên)
- `φ₂, λ₂` = vĩ độ, kinh độ điểm 2 (văn phòng)
- `Δφ = φ₂ − φ₁`, `Δλ = λ₂ − λ₁` (chuyển sang radian trước khi tính)
- `R` = bán kính Trái Đất ≈ **6.371.000 mét**
- `d` = khoảng cách mét

**Lý giải từng bước:**
1. `sin²(Δφ/2)`: Đo độ chênh lệch vĩ độ giữa 2 điểm.
2. `cos(φ₁) · cos(φ₂)`: Điều chỉnh theo độ rộng của vĩ tuyến (gần xích đạo thì vĩ tuyến rộng, gần cực thì hẹp).
3. `sin²(Δλ/2)`: Đo độ chênh lệch kinh độ.
4. `atan2(√a, √(1−a))`: Chuyển đổi góc cung tròn (central angle) giữa 2 điểm.
5. `R · c`: Nhân với bán kính Trái Đất để ra khoảng cách thực tế.

**Ví dụ:**
- Văn phòng: 10.7725°N, 106.6980°E
- Nhân viên: 10.7730°N, 106.6985°E
- Kết quả: ~78 mét

#### 2.3.2 Accuracy (Độ chính xác GPS)

Là bán kính sai số (mét) mà thiết bị báo cáo. Ví dụ: `accuracy: 10` nghĩa là vị trí thực tế nằm trong vòng tròn bán kính 10m quanh tọa độ báo cáo.

**Tại sao cộng accuracy vào khoảng cách?**
```
effective_distance = haversine_distance + accuracy
```

Nếu nhân viên cách văn phòng 95m nhưng accuracy là 15m (tức có thể thực tế chỉ cách 80m) → `effective = 110m`. Nếu bán kính cho phép là 100m → từ chối. Điều này thận trọng hơn, tránh trường hợp GPS lệch nhưng nhân viên thực sự đang trong vùng.

### 2.4 Test Cases — Luồng GPS

| TC-ID | Mô tả | Steps | Expected Result |
|---|---|---|---|
| GPS-01 | Check-in thành công trong vùng | 1. Mở PWA<br>2. Bấm Check-in<br>3. GPS trong bán kính | `200 OK`, `status: VALID`, `method: GPS` |
| GPS-02 | Check-in ngoài vùng | 1. GPS ngoài bán kính<br>2. Bấm Check-in | `403 Forbidden`, hiển thị fallback (Quét QR / Nhập OTP) |
| GPS-03 | Từ chối quyền GPS | 1. Tắt Location Services<br>2. Bấm Check-in | Hiển thị lỗi GPS, chuyển fallback |
| GPS-04 | Mock GPS (accuracy = 0) | 1. Bật Fake GPS, accuracy = 0<br>2. Check-in | Request vẫn gửi, server gắn `suspicious_gps: true`. Nếu kết hợp anomaly → `PENDING_REVIEW` |
| GPS-05 | Double check-in | 1. Check-in thành công<br>2. Bấm Check-in lần 2 | `400: "Bạn đã check-in hôm nay"` |
| GPS-06 | Replay attack | 1. Chộp request cũ<br>2. Gửi lại y hệt | `400: "Nonce đã được sử dụng"` hoặc `400: "Timestamp quá cũ"` |
| GPS-07 | Client gửi distance giả | 1. Sửa payload gửi `distance: 0`<br>2. Gửi request | Server bỏ qua `distance`, tự tính lại. Nếu lat/lng thật ngoài vùng → `403` |
| GPS-08 | Teleport anomaly | 1. Check-in ở Hà Nội lúc 08:00<br>2. Check-in ở TP.HCM lúc 08:15 | `202 PENDING_REVIEW`, bắt buộc selfie |


---

## 3. Luồng 2: Tablet Kiosk

### 3.1 Step-by-step

1. Tablet (iPad/Android) gắn cố định tại lễ tân, chạy ứng dụng kiosk fullscreen.
2. Trong giờ hoạt động (do quản lý set, ví dụ 9:00 – 9:45:59), tablet gọi `GET /api/tablet-token?tablet_id=LOBBY_01` mỗi 30 giây.
3. Server sinh cặp token:
   - `qr_token`: chuỗi ngẫu nhiên 32 ký tự (dùng cho QR Code).
   - `otp_code`: 6 chữ số ngẫu nhiên (dùng cho nhập tay).
   - TTL 60 giây, cờ `used: false`.
4. Tablet hiển thị QR Code lớn + dãy số OTP 6 chữ số bên dưới.
5. Nhân viên mở PWA → chọn tab **"Quét QR"** hoặc **"Nhập mã"**.
6. PWA quét QR hoặc nhập OTP → gửi lên server kèm `user_id`.
7. Server verify:
   - Token/OTP tồn tại?
   - Còn trong 60 giây?
   - `used == false`?
   - `tablet_id` hợp lệ?
   - User chưa check-in hôm nay?
8. Nếu pass → `200 OK`, `status: VALID`, `method: TABLET_QR` hoặc `TABLET_OTP`.

### 3.2 Business Rules

#### Rule 1: Token Lifecycle

**Tại sao cần:**
- **30 giây refresh:** Ngăn chặn việc chụp ảnh màn hình tablet gửi qua Zalo cho người ở nhà. Khi người nhận quét, token đã hết hạn hoặc đã bị dùng.
- **Dùng 1 lần:** Ngăn 1 mã được quét rồi lại nhập OTP cùng cặp để check-in 2 lần.
- **60 giây TTL:** Token không sống quá lâu, giảm cửa sổ tấn công.
- **Server sinh mã:** Tablet chỉ là màn hình hiển thị. Nếu tablet bị hack offline, không thể tự sinh mã giả vì không có secret key của server.

**Chi tiết:**
- Tablet gọi API mỗi 30 giây để lấy token mới.
- Mỗi cặp QR + OTP gắn với `tablet_id`, `created_at`, `expires_at = created_at + 60s`.
- Khi QR được quét hoặc OTP được nhập → `used = true` ngay lập tức. Cả 2 đều vô hiệu.

#### Rule 2: Tablet Operating Hours

Quản lý cấu hình trong dashboard:
- `tablet_start`: Giờ bắt đầu hiển thị QR/OTP (ví dụ: 09:00).
- `tablet_end`: Giờ kết thúc (ví dụ: 09:45:59).

Ngoài khung giờ này:
- Tablet hiển thị: *"Chưa đến giờ check-in"* (trước `tablet_start`).
- Hoặc: *"Đã hết giờ check-in. Vui lòng liên hệ quản lý."* (sau `tablet_end`).

#### Rule 3: Tablet Auto-Off

Tablet tự động ngừng tạo QR/OTP khi **một trong các điều kiện** sau thỏa mãn:
1. `current_time > auto_absent_at` (ví dụ: 10:05).
2. **Tất cả** nhân viên đang active đã có ít nhất 1 bản ghi `status: VALID` trong ngày.

**Lưu ý:** Nếu còn bản ghi `PENDING_REVIEW` (chưa duyệt), tablet **vẫn mở** để nhân viên đó có thể quét lại nếu bị REJECT.

**Manual Override:** Quản lý có thể bật/tắt tablet thủ công từ dashboard, bất chấp điều kiện tự động.

### 3.3 Test Cases — Luồng Tablet

| TC-ID | Mô tả | Steps | Expected Result |
|---|---|---|---|
| TBL-01 | Quét QR thành công | 1. Tablet hiển thị QR<br>2. PWA quét đúng QR<br>3. Gửi token | `200 OK`, `status: VALID`, `method: TABLET_QR` |
| TBL-02 | Nhập OTP thành công | 1. Đọc OTP từ tablet<br>2. Nhập đúng 6 số | `200 OK`, `status: VALID`, `method: TABLET_OTP` |
| TBL-03 | QR hết hạn | 1. Chờ 60 giây sau khi QR hiển thị<br>2. Quét | `400: "Token đã hết hạn"` |
| TBL-04 | OTP sai | 1. Nhập sai 6 số | `400: "Mã không hợp lệ"` |
| TBL-05 | Dùng QR rồi dùng OTP cùng cặp | 1. Quét QR thành công<br>2. Thử nhập OTP cùng cặp | `400: "Token đã được sử dụng"` |
| TBL-06 | Chụp ảnh QR gửi Zalo | 1. Chụp ảnh màn hình tablet<br>2. Gửi cho người khác quét ở nhà (sau 30-60s) | `400: "Token đã hết hạn"` hoặc đã bị dùng |
| TBL-07 | Tablet không hợp lệ | 1. Gửi request với `tablet_id` không tồn tại | `403: "Tablet không hợp lệ"` |
| TBL-08 | Tablet trước giờ mở | 1. Mở tablet lúc 8:30, `tablet_start = 9:00` | Hiển thị "Chưa đến giờ check-in" |
| TBL-09 | Tablet sau giờ đóng | 1. Mở tablet lúc 9:50, `tablet_end = 9:45:59` | Hiển thị "Đã hết giờ check-in" |
| TBL-10 | Tablet auto-off khi đủ người | 1. Tất cả nhân viên đã check-in VALID<br>2. Tablet vẫn đang mở | Tablet tự động chuyển sang màn hình "Đã đủ số lượng check-in" |
| TBL-11 | Tablet vẫn mở khi còn PENDING_REVIEW | 1. Có 1 nhân viên PENDING_REVIEW<br>2. Tất cả người khác đã VALID | Tablet vẫn tạo QR/OTP để nhân viên đó quét lại nếu bị REJECT |
| TBL-12 | Manager manual override | 1. Quản lý bấm "Mở tablet" lúc 10:00 trong dashboard | Tablet bật lại, tạo QR/OTP bình thường |


---

## 4. Luồng 3: Anomaly Detection & Review

### 4.1 Tại sao cần Anomaly Detection?

PWA thuần **không thể** xác định "người đang cầm điện thoại có phải chủ nhân không". Nếu nhân viên A đưa điện thoại đã mở khóa cho B, B logout A, login tài khoản B, rồi check-in — hệ thống kỹ thuật không chặn được 100%.

Vì vậy, ta dùng **Device Fingerprint** để phát hiện pattern bất thường, sau đó:
- Bắt buộc chụp selfie xác minh.
- Ghi nhận `PENDING_REVIEW` để quản lý xem xét.
- Kết hợp với camera giám sát (CCTV) để đối chiếu.

### 4.2 Device Fingerprint (Dấu vân tay thiết bị)

Dùng để xác định tính duy nhất của thiết bị và phát hiện gian lận. Không phải sinh trắc học (vân tay tay người), mà là "vân tay kỹ thuật số" — tập hợp các đặc điểm phần mềm/phần cứng tạo nên dấu ấn riêng của thiết bị.

| Thông tin thu thập | Ý nghĩa & Mục đích |
|---|---|
| **User Agent** | Chuỗi thông tin đại diện cho trình duyệt và hệ điều hành (ví dụ: Chrome 120 trên Android 14, Safari trên iOS 17). Giúp biết người dùng đang dùng thiết bị/trình duyệt gì. |
| **Screen width/height + colorDepth** | Độ phân giải màn hình (chiều rộng/chiều cao tính bằng pixel) và độ sâu màu sắc (thường là 24 hoặc 32 bit). Mỗi dòng điện thoại/máy tính có cấu hình màn hình riêng. |
| **Timezone** | Múi giờ thiết lập trên thiết bị (ví dụ: `Asia/Ho_Chi_Minh`). Giúp phát hiện việc dùng VPN hoặc thiết bị đặt sai múi giờ so với vị trí GPS. |
| **Canvas fingerprint (hash)** | Phương pháp ép trình duyệt vẽ một hình ảnh/đoạn văn bản ẩn bằng HTML5 Canvas. Do mỗi GPU và Driver đồ họa xử lý điểm ảnh, khử răng cưa (anti-aliasing), và nén màu khác nhau, hình vẽ tạo ra sẽ chứa đặc trưng riêng biệt của thiết bị đó. Kết quả được hash (băm) lại thành một chuỗi duy nhất. |
| **WebGL vendor/renderer** | Thông tin chi tiết về card màn hình (GPU) và nhà sản xuất (ví dụ: `Qualcomm Adreno 650`, `Apple GPU`, `NVIDIA GeForce`). Giúp nhận diện chính xác phần cứng đồ họa, đặc biệt hữu ích khi nhiều điện thoại cùng dùng Chrome nhưng GPU khác nhau. |
| **Font list** | Danh sách các phông chữ được cài đặt trên hệ thống. Mức độ tùy biến font chữ giữa các thiết bị/hệ điều hành thường không giống nhau (ví dụ: Windows có Calibri, macOS có Helvetica, Android có Roboto). |

**Cơ chế hoạt động:**
1. **Tổng hợp & Băm (Hashing):** Tất cả các thông số trên sẽ được gộp lại và chạy qua một hàm băm (thường là SHA-256) để tạo thành **chuỗi 64 ký tự** cố định. Chuỗi này đóng vai trò như "vân tay" của máy.
2. **So sánh:** Mỗi lần check-in, server so sánh fingerprint mới với lịch sử 30 ngày của user đó và toàn hệ thống.
3. **Phát hiện:** Nếu fingerprint xuất hiện ở 2+ user khác nhau trong thời gian ngắn → flag bất thường.

**Ảnh hưởng khi user cố tình thay đổi:**

| Hành động của nhân viên | Ảnh hưởng đến fingerprint | Giải thích |
|---|---|---|
| **Đổi múi giờ hệ thống** | ✅ Có, thay đổi một phần | Timezone là 1 thành phần trong fingerprint. Nếu đổi từ `Asia/Ho_Chi_Minh` sang `Asia/Tokyo`, hash sẽ khác. Tuy nhiên, nếu chỉ đổi giờ hệ thống mà không đổi timezone (ví dụ: đổi từ 08:00 thành 09:00 nhưng vùng vẫn là HCM) → **không ảnh hưởng** vì timezone lấy từ `Intl.DateTimeFormat().resolvedOptions().timeZone`, không phải giờ hiện tại. |
| **Đổi sang trình duyệt khác** | ✅ Có, thay đổi hoàn toàn | User Agent, Canvas hash, WebGL, Font list đều khác giữa Chrome, Safari, Firefox. Fingerprint sẽ khác hoàn toàn. |
| **Mở tab ẩn danh (Incognito)** | ⚠️ Có thể thay đổi | Một số trình duyệt (Safari) reset Canvas/Font trong Incognito. Chrome giữ nguyên phần lớn. Không đáng tin để dùng làm công cụ né tránh. |
| **Giả mạo User Agent** | ⚠️ Một phần | Nếu chỉ sửa User Agent bằng extension nhưng các thành phần khác (Canvas, WebGL, Screen) không đổi → fingerprint vẫn giống. Nếu dùng tool chuyên dụng spoof toàn bộ → có thể khác, nhưng độ khó cao hơn nhiều. |
| **Đổi điện thoại mới** | ✅ Có, thay đổi hoàn toàn | Màn hình, GPU, font, OS đều khác → fingerprint mới. Đây là trường hợp hợp lệ, nên quy tắc "Thiết bị lạ" chỉ cảnh báo chứ không chặn. |

**Chiến lược kết hợp:** Fingerprint không dựa vào 1 thành phần duy nhất. Nếu user đổi browser (User Agent đổi) nhưng vẫn cùng 1 điện thoại (Screen, Canvas, WebGL giữ nguyên) → server vẫn có thể nhận ra pattern quen thuộc. Nếu tất cả thành phần đều đổi → coi như thiết bị mới, trigger "Thiết bị lạ" (cảnh báo) thay vì "Chia sẻ thiết bị" (bắt buộc selfie).

### 4.3 Các quy tắc phát hiện bất thường

| Quy tắc | Nội dung | Mức độ | Tại sao đặt quy tắc này? |
|---|---|---|---|
| **Chia sẻ thiết bị** | Thiết bị này vừa được nhân viên khác sử dụng để check-in cách đây X phút | 🔴 Bắt buộc selfie | Dấu hiệu rõ ràng nhất của "điểm danh hộ": 2 người dùng chung 1 điện thoại trong thời gian ngắn. |
| **Thiết bị lạ** | Nhân viên chưa từng dùng thiết bị này trong 30 ngày qua | 🟡 Cảnh báo (tùy chọn selfie) | Có thể là đổi điện thoại mới, nhưng cũng có thể là mượn máy người khác. Cần ghi nhận để theo dõi. |
| **Đổi tài khoản nhanh** | Cùng 1 thiết bị có 2+ nhân viên đổi nhau login trong 15 phút | 🔴 Bắt buộc selfie | Nhiều tài khoản đổi nhau trên cùng 1 máy trong thời gian ngắn — rất nghi ngờ. |
| **Dịch chuyển tức thời** | 2 lần check-in cách < 30 phút nhưng khoảng cách GPS > 50km | 🔴 Bắt buộc selfie | Bất khả thi vật lý. Chứng tỏ có ít nhất 1 lần check-in là giả mạo vị trí. |

### 4.4 Selfie + Watermark + Camera Fallback

**Tại sao cần selfie:** Nếu không có selfie, nhân viên B có thể chụp sẵn ảnh mặt A, lưu trong điện thoại, rồi upload khi cần điểm danh hộ. Watermark chứa **thời gian chính xác đến giây** (do server cung cấp hoặc client lấy từ server time) → ảnh chụp trước đó không thể dùng được.

**Cách vẽ watermark (client-side Canvas):**
```javascript
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
// Vẽ ảnh camera lên canvas
// Vẽ text ở góc dưới: "08:15:23 | 24/08/2026 | userA@company.com"
// Export blob → upload
```

**Lưu ý:** Watermark do **client vẽ** lên Canvas trước khi upload. Server không tin watermark (có thể bị sửa bằng DevTools), chỉ dùng để quản lý xem xét thủ công. Nếu quản lý xem ảnh watermark 08:15:23, rồi xem CCTV 08:15:23 → khớp thời gian, khó fake.

**Camera Fallback (3 bước):**

| Bước | Hành động | Nếu fail → |
|---|---|---|
| **1** | PWA thử `capture="user"` (camera trước) | Sang bước 2 |
| **2** | Tự động switch sang `capture="environment"` (camera sau) | Sang bước 3 |
| **3** | Hiện popup: *"Không thể truy cập camera. Chọn phương án:"* | |

**Bước 3 có 2 lựa chọn:**
- **A. Giải trình bất khả kháng:** User nhập lý do (ví dụ: "Camera trước và sau đều hư, đang đi sửa"). Gửi lên server: `status: PENDING_REVIEW`, `flag_reason: "Chia sẻ thiết bị + Không có camera"`, `selfie_url: null`, `no_camera_reason: "..."`. Quản lý duyệt thủ công.
- **B. Chuyển sang Tablet Kiosk:** User đến tablet công ty, quét QR / nhập OTP như bình thường. Tablet không cần camera của điện thoại user.

**Không cho phép "Skip selfie không lý do".** Nếu không có camera và không chịu giải trình hoặc đến tablet → tính là vắng mặt / từ chối check-in.

### 4.5 Dashboard Quản lý — Review & Reject

#### Màn hình chính
- Badge đỏ: **"X bản ghi chờ duyệt"**
- Danh sách lọc theo `status = PENDING_REVIEW`

#### Mỗi dòng PENDING_REVIEW hiển thị:
- Tên nhân viên + ảnh đại diện + nickname
- Thời gian check-in
- Phương thức (GPS / QR / OTP)
- 🚨 `flag_reason` (semantic, ví dụ: *"Thiết bị này vừa được Nguyễn Văn B sử dụng để check-in cách đây 3 phút"*)
- 📸 Ảnh selfie (click xem to)
- 📡 **GPS log gợi ý** (optional): *"GPS log: user xuất hiện gần công ty lúc 9:38"*
- 📶 **WiFi IP log gợi ý** (optional): *"WiFi IP log: kết nối từ IP công ty lúc 9:41"* — chỉ là gợi ý, không dùng để tính phạt.
- 📹 Nút **"Xem CCTV"** — mở camera giám sát đúng khung giờ check-in
- ✅ Nút **"Duyệt"** → `status: VALID`
- ❌ Nút **"Từ chối"** → mở form nhập thông tin

#### Form Từ chối (Reject):
- **Nhập thời điểm thực tế có mặt** (optional): Quản lý xem CCTV, nhập giờ user thực sự đến công ty (ví dụ: "9:40").
- **Nhập số tiền phạt gian lận** (do hệ thống đề xuất theo Fraud Rule, quản lý có thể sửa).
- **Nhập lý do từ chối** (bắt buộc).
- **Nút "Từ chối"** → xử lý.

**CCTV Integration:** Nút "Xem CCTV" là deep link đến hệ thống camera công ty:
```
https://cctv.company.com/replay?camera=lobby_01
&start=2026-08-24T08:14:00
&end=2026-08-24T08:16:00
```
Nếu không có API camera, quản lý tự mở phần mềm camera thủ công theo giờ hiển thị.

### 4.6 Logic REJECT — Chi tiết theo thời điểm

**Bước 1: Xóa bản ghi PENDING_REVIEW**
- Khi REJECTED, bản ghi PENDING_REVIEW bị xóa (không phải update status).
- Mục đích: Giải phóng slot "1 lần check-in/ngày" để user có thể check-in lại (nếu còn trong điều kiện).

**Bước 2: Phân loại theo thời điểm**

| Tình huống | Xử lý |
|---|---|
| **REJECT lúc 9:34, còn trong giờ tablet (≤ tablet_end)** | Xóa PENDING_REVIEW. User có thể check-in lại 1 lần (qua tablet hoặc GPS). Nếu user chưa tới công ty, không nhập giờ có mặt. |
| **REJECT lúc 9:34, đã quá giờ tablet (> tablet_end)** | Xóa PENDING_REVIEW. Không cho check-in lại. Nếu manager nhập `actual_arrival_time` (ví dụ 9:40) → hệ thống tính phạt theo tier (9:40 = Tier 1) + phạt gian lận. Tạo record `MANUAL` với thời gian đó, `status: VALID` (để tính attendance). |
| **REJECT lúc 17:00 (hôm sau), user thực tế có mặt 9:40** | Xóa PENDING_REVIEW. Manager nhập "Có mặt lúc 9:40". Hệ thống tính phạt tier (9:40 = Tier 1) + phạt gian lận. Tạo record `MANUAL` với thời gian 9:40. |
| **REJECT lúc 17:00, user vắng mặt cả ngày** | Xóa PENDING_REVIEW. Không nhập `actual_arrival_time`. Nếu đã quá `auto_absent_at` → giữ AUTO_ABSENT (hoặc tạo nếu chưa có). Phạt gian lận + absent fine. |
| **REJECT, quản lý chưa rảnh đến auto_absent_at** | Cron job chạy, thấy user chưa có VALID check-in → tạo AUTO_ABSENT. PENDING_REVIEW vẫn nằm đó chờ quản lý. Sau này REJECT → quản lý xem CCTV, nhập giờ có mặt nếu có. |

**Tại sao xóa bản ghi thay vì update status:** Để giải phóng slot. Nếu chỉ update thành REJECTED, user không thể check-in lại dù còn trong giờ tablet. Việc xóa giúp user có cơ hội sửa sai (nếu thực sự có mặt tại công ty).

**Tại sao tạo record MANUAL khi manager nhập actual_arrival_time:** Để ghi nhận attendance. Nếu không tạo, user bị tính vắng mặt dù thực tế có đến. Record MANUAL dùng để tính phạt đi trễ và báo cáo chấm công.

### 4.7 Test Cases — Luồng Anomaly

| TC-ID | Mô tả | Steps | Expected Result |
|---|---|---|---|
| ANM-01 | Chia sẻ thiết bị | 1. User B check-in từ máy X<br>2. Logout, User A login trên cùng máy X<br>3. User A check-in trong 10 phút | `202 PENDING_REVIEW`, bắt buộc selfie, `flag_reason` ghi rõ |
| ANM-02 | Thiết bị lạ | 1. User thường check-in từ máy iPhone A<br>2. Hôm nay check-in từ Android B (fingerprint mới) | `202 PENDING_REVIEW` hoặc cảnh báo (tùy config) |
| ANM-03 | Đổi tài khoản nhanh | 1. User A check-in<br>2. Logout, User B login cùng máy<br>3. User B check-in trong 15 phút | `202 PENDING_REVIEW`, bắt buộc selfie |
| ANM-04 | Dịch chuyển tức thời | 1. User check-in ở Hà Nội lúc 08:00<br>2. Check-in ở TP.HCM lúc 08:15 | `202 PENDING_REVIEW`, bắt buộc selfie |
| ANM-05 | Selfie watermark | 1. Trigger anomaly<br>2. Chụp selfie<br>3. Kiểm tra ảnh upload | Ảnh phải có watermark thời gian + email user |
| ANM-06 | Camera trước hư → switch camera sau | 1. Trigger anomaly<br>2. Camera trước fail<br>3. PWA tự động switch | Mở camera sau, chụp được |
| ANM-07 | Cả 2 camera đều hư | 1. Trigger anomaly<br>2. Cả 2 camera fail | Hiện popup: Giải trình hoặc Đến Tablet |
| ANM-08 | Dashboard duyệt | 1. Quản lý mở `/admin/pending`<br>2. Xem ảnh + lý do + nút CCTV<br>3. Bấm Duyệt | Bản ghi chuyển `status: VALID` |
| ANM-09 | Dashboard từ chối + nhập giờ có mặt | 1. Quản lý bấm Từ chối, nhập "Có mặt lúc 9:40"<br>2. Hệ thống tính phạt | Tạo MANUAL record lúc 9:40, phạt Tier 1 + gian lận |
| ANM-10 | Dashboard từ chối, user vắng mặt | 1. Quản lý bấm Từ chối, không nhập giờ<br>2. Đã quá auto_absent_at | AUTO_ABSENT record. Phạt Fraud + Absent. |
| ANM-11 | REJECT còn trong giờ tablet | 1. REJECT lúc 9:34, tablet_end = 9:45:59 | Xóa PENDING_REVIEW, user có thể check-in lại |
| ANM-12 | REJECT quá giờ tablet | 1. REJECT lúc 9:50, tablet_end = 9:45:59 | Xóa PENDING_REVIEW, không cho check-in lại |
| ANM-13 | Manager chưa review đến auto_absent_at | 1. User PENDING_REVIEW từ 9:34<br>2. Đến auto_absent_at (10:05), manager chưa xử lý | Cron tạo AUTO_ABSENT. PENDING_REVIEW vẫn chờ. Sau này REJECT → manager xem CCTV, nhập giờ có mặt nếu có. |


---

## 5. Luồng 4: Late Penalty & Auto-Absent

### 5.1 Dynamic Tier — Phạt đi trễ

**Tại sao dynamic:** Công ty nhỏ, quy tắc có thể thay đổi theo mùa hoặc theo văn hóa. Cứng nhắc 2 tier không linh hoạt.

**Cách quản lý cấu hình:**
- `checkin_deadline`: Giờ hợp lệ tối đa (ví dụ: 09:35).
- Quản lý nhấn nút **"+ Thêm tier"** để thêm dòng:
  - `name`: Tên tier (ví dụ: "Muộn nhẹ", "Muộn nặng").
  - `delay_minutes`: Số phút sau `checkin_deadline` (ví dụ: 10 → tức 09:45).
  - `fine_amount`: Số tiền phạt (ví dụ: 10000).
- Có thể 0 tier (không phạt đi trễ).
- Có thể nhiều tier.

**Ví dụ:**
| Tier | checkin_deadline | delay_minutes | Thời điểm áp dụng | fine_amount |
|---|---|---|---|---|
| — | 09:35 | — | ≤ 09:35 | 0đ |
| Muộn nhẹ | 09:35 | 10 | 09:36 – 09:45 | 10.000đ |
| Muộn nặng | 09:35 | 30 | 09:46 – 10:05 | 20.000đ |

**Cách tính:**
```
actual_delay = check_in_time - checkin_deadline
Tìm tier có delay_minutes lớn nhất mà <= actual_delay
Áp dụng fine_amount của tier đó
```

**Ví dụ tính:**
- User check-in lúc 9:40. `checkin_deadline = 9:35`. `actual_delay = 5 phút`.
- Tier 1: `delay = 10`, `fine = 10k`. 5 <= 10 → áp dụng Tier 1: 10k.
- User check-in lúc 9:50. `actual_delay = 15 phút`.
- Tier 1: 15 > 10 → không đủ.
- Tier 2: `delay = 30`, `fine = 20k`. 15 <= 30 → áp dụng Tier 2: 20k.

### 5.2 Fraud Penalty — Dynamic Rule

**Tại sao dynamic:** Mức phạt gian lận có thể thay đổi theo quy định công ty.

**Cách quản lý cấu hình:**
- Quản lý nhấn **"+ Thêm quy tắc phạt"**:
  - `target`: Chọn "Người nhờ điểm danh (vắng mặt)" hoặc "Người điểm danh hộ (có mặt)".
  - `fine_amount`: Nhập số tiền (ví dụ: 100.000đ).
- Có thể nhiều rule, sửa, xóa.

**Đề xuất mặc định:**
- Người nhờ (vắng mặt): 100.000đ — phạt nặng hơn vì họ là người hưởng lợi chính.
- Người điểm danh hộ (có mặt): 50.000đ — đồng phạm nhưng đã có mặt tại công ty.

**Lý do phạt nặng người vắng mặt:** Triệt tiêu động cơ chính. Người có mặt sẽ nghĩ 2 lần trước khi đưa điện thoại cho người khác.

**Khi REJECT anomaly:**
- Hệ thống tự đề xuất số tiền phạt theo rule.
- Quản lý có thể sửa số tiền trước khi bấm REJECT.
- Phạt gian lận được ghi nhận riêng biệt với phạt đi trễ.

### 5.3 Auto-Absent

**Tại sao cần:** Nếu user chưa check-in đến giờ nhất định, hệ thống tự động đánh dấu vắng mặt để không phải chờ quản lý xử lý từng người.

**Cách xác định `auto_absent_at`:**
- **Ưu tiên B:** Nếu quản lý đã set `auto_absent_at` riêng (ví dụ: 12:00 trưa) → dùng giá trị này.
- **Fallback A:** Nếu chưa set → `auto_absent_at = checkin_deadline + max(delay_minutes của tất cả tier)` (ví dụ: 9:35 + 30 = 10:05).
- **Nếu không có tier nào:** Vẫn auto-absent nhưng không phạt tiền (vì chưa set tier). Hỗ trợ `delay_minutes = 0` nếu muốn phạt ngay sau deadline.

**Cron job:**
- Chạy mỗi phút (hoặc 5 phút).
- Query: `SELECT user_id FROM users WHERE active = true AND user_id NOT IN (SELECT user_id FROM checkins WHERE status IN ('VALID', 'PENDING_REVIEW', 'AUTO_ABSENT') AND DATE(created_at) = CURRENT_DATE)`.
- Với mỗi user tìm được, nếu `current_time > auto_absent_at`:
  - Tạo bản ghi: `status: AUTO_ABSENT`, `method: null`, `fine_amount: 0` (hoặc theo tier nếu có).
  - Gửi notification cho user.

**Lưu ý:** Nếu user đã có bản ghi `PENDING_REVIEW` (chưa duyệt), cron **không** tạo AUTO_ABSENT. Vì user đã "cố gắng" check-in, chỉ đang chờ quản lý xem xét. Nếu sau này REJECT và không nhập giờ có mặt → mới tính absent.

### 5.4 Test Cases — Luồng Penalty

| TC-ID | Mô tả | Steps | Expected Result |
|---|---|---|---|
| PEN-01 | Check-in đúng giờ | 1. Check-in lúc 9:30, deadline 9:35 | Không phạt. `fine_amount: 0` |
| PEN-02 | Check-in muộn Tier 1 | 1. Check-in lúc 9:40, deadline 9:35, Tier 1: delay=10, fine=10k | Phạt 10.000đ |
| PEN-03 | Check-in muộn Tier 2 | 1. Check-in lúc 9:50, deadline 9:35, Tier 2: delay=30, fine=20k | Phạt 20.000đ |
| PEN-04 | Không có tier | 1. Check-in lúc 9:50, không set tier nào | Không phạt tiền. Chỉ ghi nhận muộn. |
| PEN-05 | Auto-absent | 1. User không check-in cả ngày<br>2. Đến auto_absent_at | Tạo record AUTO_ABSENT. Phạt theo tier cao nhất (nếu có) hoặc 0đ. |
| PEN-06 | Auto-absent không tạo khi còn PENDING_REVIEW | 1. User có PENDING_REVIEW lúc 9:34<br>2. Đến auto_absent_at | Không tạo AUTO_ABSENT. Chờ quản lý review. |
| PEN-07 | Fraud penalty | 1. User A điểm danh hộ cho B<br>2. Quản lý REJECT | User B (vắng mặt) phạt 100k. User A (có mặt) phạt 50k. |
| PEN-08 | Manager sửa số tiền phạt | 1. Hệ thống đề xuất phạt gian lận 100k<br>2. Manager sửa thành 80k<br>3. Bấm REJECT | Ghi nhận phạt 80k |
| PEN-09 | REJECT + nhập giờ có mặt | 1. REJECT lúc 17:00, nhập "Có mặt lúc 9:40"<br>2. Tier 1: delay=10, fine=10k | Tạo MANUAL record lúc 9:40. Phạt Tier 1 (10k) + Fraud penalty. |
| PEN-10 | REJECT + vắng mặt | 1. REJECT, không nhập giờ<br>2. Đã quá auto_absent_at | AUTO_ABSENT record. Phạt Fraud + Absent. |

---

## 6. Auth & Profile (Phase 1)

### 6.1 Authentication
- **Email/Password:** Sign up, login, reset password, quên mật khẩu qua email.
- **Google OAuth:** Login with Google (ưu tiên, đơn giản nhất).
- **Không làm:** GitHub, LinkedIn (để dành Phase sau nếu cần).

### 6.2 Profile
- `full_name`: Tên thật (bắt buộc).
- `nickname`: Tên hiển thị (mặc định = full_name, có thể sửa).
- `avatar_url`: Ảnh đại diện.
- `title_id`: Danh hiệu hệ thống (ví dụ: "Gà con chăm chỉ", "Vua đi trễ", "Đại cổ đông quỹ tiền phạt").

### 6.3 Danh hiệu (Title)
- Lưu trong DB, seed sẵn các danh hiệu mặc định.
- Dùng để show trên bảng nộp phạt public (Phase sau).
- Quản lý không CRUD danh hiệu ở Phase 1 (hardcode/seed).

**Danh hiệu mặc định (seed):**
- Gà con chăm chỉ
- Vua đi trễ
- Đại cổ đông quỹ tiền phạt
- Thánh nghỉ phép
- Cáo già công sở

### 6.4 Roles (Phase 1)
- Chỉ 2 role: **Nhân viên** và **Quản lý**.
- 1 user = 1 role.
- Multi-role sẽ làm ở Phase 5.


---

## 7. Data Model

### 7.1 Bảng `users`
| Field | Type | Mô tả |
|---|---|---|
| `id` | SERIAL PK | |
| `email` | VARCHAR(255) | Unique |
| `password_hash` | VARCHAR(255) | Nullable nếu dùng OAuth |
| `google_id` | VARCHAR(255) | Nullable |
| `full_name` | VARCHAR(100) | |
| `nickname` | VARCHAR(100) | Mặc định = full_name |
| `avatar_url` | TEXT | |
| `title_id` | INT FK | Danh hiệu |
| `role` | VARCHAR(20) | `EMPLOYEE`, `MANAGER` |
| `is_active` | BOOLEAN | DEFAULT true |
| `created_at` | TIMESTAMP | DEFAULT NOW() |

### 7.2 Bảng `titles`
| Field | Type | Mô tả |
|---|---|---|
| `id` | SERIAL PK | |
| `name` | VARCHAR(100) | "Vua đi trễ" |
| `description` | TEXT | |

### 7.3 Bảng `office_locations`
| Field | Type | Mô tả |
|---|---|---|
| `id` | SERIAL PK | |
| `name` | VARCHAR(100) | Tên văn phòng |
| `latitude` | DECIMAL(10,8) | Tọa độ trung tâm |
| `longitude` | DECIMAL(11,8) | |
| `radius_meters` | INT | Bán kính cho phép (m) |
| `is_active` | BOOLEAN | DEFAULT true |

### 7.4 Bảng `checkins`
| Field | Type | Mô tả |
|---|---|---|
| `id` | SERIAL PK | |
| `user_id` | INT FK | Nhân viên |
| `method` | VARCHAR(20) | `GPS`, `TABLET_QR`, `TABLET_OTP`, `MANUAL` |
| `status` | VARCHAR(20) | `VALID`, `PENDING_REVIEW`, `REJECTED`, `AUTO_ABSENT` |
| `latitude` | DECIMAL(10,8) | Từ GPS (nếu có) |
| `longitude` | DECIMAL(11,8) | Từ GPS (nếu có) |
| `accuracy_meters` | DECIMAL(8,2) | Độ chính xác GPS |
| `distance_meters` | DECIMAL(8,2) | Server tính từ lat/lng |
| `tablet_id` | VARCHAR(50) | Nếu dùng tablet |
| `device_fingerprint` | VARCHAR(64) | Hash fingerprint thiết bị |
| `flag_reason` | TEXT | Lý do bất thường (semantic) |
| `selfie_url` | TEXT | URL ảnh selfie (nếu có) |
| `no_camera_reason` | TEXT | Lý do không có camera (nếu có) |
| `reviewed_by` | INT FK | Quản lý duyệt |
| `reviewed_at` | TIMESTAMP | Thời gian duyệt |
| `review_note` | TEXT | Ghi chú khi duyệt/từ chối |
| `actual_arrival_time` | TIME | Giờ thực tế có mặt (do manager nhập) |
| `created_at` | TIMESTAMP | DEFAULT NOW() |

### 7.5 Bảng `tablet_tokens`
| Field | Type | Mô tả |
|---|---|---|
| `id` | SERIAL PK | |
| `tablet_id` | VARCHAR(50) | ID tablet |
| `qr_token` | VARCHAR(64) | Token cho QR |
| `otp_code` | VARCHAR(6) | Mã số 6 chữ số |
| `used` | BOOLEAN | DEFAULT false |
| `expires_at` | TIMESTAMP | TTL 60 giây |
| `created_at` | TIMESTAMP | DEFAULT NOW() |

### 7.6 Bảng `late_tiers`
| Field | Type | Mô tả |
|---|---|---|
| `id` | SERIAL PK | |
| `name` | VARCHAR(100) | "Muộn nhẹ" |
| `delay_minutes` | INT | Số phút sau deadline |
| `fine_amount` | INT | VND |
| `is_active` | BOOLEAN | DEFAULT true |

### 7.7 Bảng `fraud_rules`
| Field | Type | Mô tả |
|---|---|---|
| `id` | SERIAL PK | |
| `target` | VARCHAR(50) | `FRAUD_REQUESTER` (người nhờ) / `FRAUD_ASSISTANT` (người hộ) |
| `fine_amount` | INT | VND |
| `is_active` | BOOLEAN | DEFAULT true |

### 7.8 Bảng `penalties`
| Field | Type | Mô tả |
|---|---|---|
| `id` | SERIAL PK | |
| `user_id` | INT FK | |
| `checkin_id` | INT FK | Liên kết với bản ghi check-in |
| `type` | VARCHAR(50) | `LATE`, `FRAUD`, `ABSENT` |
| `amount` | INT | VND |
| `reason` | TEXT | |
| `status` | VARCHAR(20) | `PENDING`, `PAID`, `WAIVED` |
| `created_at` | TIMESTAMP | DEFAULT NOW() |

### 7.9 Bảng `settings`
| Field | Type | Mô tả |
|---|---|---|
| `id` | SERIAL PK | |
| `key` | VARCHAR(100) | `checkin_deadline`, `auto_absent_at`, `tablet_start`, `tablet_end` |
| `value` | VARCHAR(255) | |
| `updated_by` | INT FK | |
| `updated_at` | TIMESTAMP | DEFAULT NOW() |

---

## 8. API Endpoints

| Method | Endpoint | Mô tả | Role |
|---|---|---|---|
| POST | `/api/auth/register` | Đăng ký email/password | Public |
| POST | `/api/auth/login` | Login email/password | Public |
| POST | `/api/auth/google` | Login Google OAuth | Public |
| POST | `/api/auth/forgot-password` | Quên mật khẩu | Public |
| POST | `/api/auth/reset-password` | Đặt lại mật khẩu | Public |
| GET | `/api/me` | Xem profile | Employee+ |
| PUT | `/api/me` | Cập nhật profile | Employee+ |
| GET | `/api/nonce` | Lấy nonce chống replay | Employee+ |
| POST | `/api/checkin` | Check-in GPS | Employee+ |
| POST | `/api/checkin-tablet` | Check-in bằng QR hoặc OTP | Employee+ |
| GET | `/api/tablet-token` | Tablet xin token mới | Tablet only |
| GET | `/api/me/today` | Xem trạng thái check-in hôm nay | Employee+ |
| GET | `/api/admin/pending` | Dashboard: danh sách chờ duyệt | Manager |
| POST | `/api/admin/review/:id` | Quản lý duyệt/từ chối | Manager |
| GET | `/api/admin/settings` | Xem cấu hình hệ thống | Manager |
| PUT | `/api/admin/settings` | Cập nhật cấu hình | Manager |
| GET | `/api/admin/tiers` | Xem danh sách late tier | Manager |
| POST | `/api/admin/tiers` | Thêm late tier | Manager |
| PUT | `/api/admin/tiers/:id` | Sửa late tier | Manager |
| DELETE | `/api/admin/tiers/:id` | Xóa late tier | Manager |
| GET | `/api/admin/fraud-rules` | Xem danh sách fraud rule | Manager |
| POST | `/api/admin/fraud-rules` | Thêm fraud rule | Manager |
| PUT | `/api/admin/fraud-rules/:id` | Sửa fraud rule | Manager |
| DELETE | `/api/admin/fraud-rules/:id` | Xóa fraud rule | Manager |
| POST | `/api/admin/tablet/override` | Bật/tắt tablet thủ công | Manager |

---

*Document owner: Tech Lead*  
*Reviewers: Product Manager, QA Lead, HR Manager*  
*Version History: v1.0 (Phase 1 — Core Check-in)*
