# Realtime TTS Contract

> Batch B00 — Khóa ranh giới và API để các batch B01–B08 không tự suy diễn.

## 1. Broadcast Channel

Tất cả event dùng channel riêng tư:

```
organization:<organizationId>
```

Không tạo thêm channel cho TTS, kiosk hay sub-entity. Channel `kiosk:<orgId>` hiện có trong SQL (migration `202609090008`) sẽ được bỏ khi B01 chuẩn hóa — hiện không có subscriber TypeScript.

## 2. Event Envelope

Mỗi Broadcast payload **bắt buộc** có envelope:

```ts
type EventEnvelope = {
  event_id: string;        // UUID do trigger tạo, định danh thay đổi
  organization_id: string; // UUID tổ chức
  event_type: EventType;   // enum bên dưới
  entity_id: string;       // ID row gốc (attempt_id, fine_id, allocation_id, …)
  user_id: string | null;  // user bị ảnh hưởng (null cho fund/tts_settings)
  work_date: string | null;// YYYY-MM-DD theo timezone org (null cho fund/tts_settings)
  occurred_at: string;     // timestamptz server khi mutation xảy ra
};
```

Payload mở rộng (tùy event_type) nằm cùng cấp với envelope, không nested.

### 2.1 EventType enum

```ts
type EventType =
  // Invalidation (UI refresh)
  | "check-in-status"
  | "attendance-status"
  | "fine-status"
  | "fine-allocation-status"
  | "fund-status"
  | "tts-settings-status"
  // TTS announcement (chỉ dùng trong payload enables TTS mapping)
  | "on_time"
  | "late"
  | "payment";
```

- `check-in-status`, `attendance-status`, `fine-status`, `fine-allocation-status`, `fund-status`, `tts-settings-status` là **invalidation signals** — UI nhận rồi fetch snapshot từ server.
- `on_time`, `late`, `payment` là **TTS announcement types** — được map từ invalidation events ở layer consumer, không phát riêng một Broadcast.

### 2.2 event_id rules

- Trigger tạo UUID v4 cho mỗi lần mutation.
- Cùng một row update nhiều lần → nhiều event_id khác nhau.
- Client dùng `event_id` để dedup trong cùng một session (InMemory Set, TTL 5 phút).
- Không dùng `entity_id` thay `event_id` vì cùng một entity có nhiều mutation.

## 3. Event Types Chi Tiết

### 3.1 check-in-status

Trigger: `AFTER INSERT ON check_in_attempts`

```ts
type CheckInPayload = EventEnvelope & {
  event_type: "check-in-status";
  entity_id: string;  // attempt_id (string)
  user_id: string;
  work_date: string | null;
  attempt_id: number;
  display_name: string | null;
  method: "gps" | "qr" | "otp";
  succeeded: boolean;
  rejection_reason: string | null;
  server_received_at: string;
  // Bổ sung so với format cũ:
  attendance_state: "on_time" | "late" | null;  // null nếu failed
  late_minutes: number | null;
  fine_id: string | null;
  fine_code: string | null;
};
```

**Mapping TTS:** Nếu `succeeded = true`:
- `attendance_state = "on_time"` → announcement type `on_time`
- `attendance_state = "late"` → announcement type `late`
Nếu `succeeded = false` → **không TTS**, chỉ toast/feed.

### 3.2 attendance-status

Trigger: `AFTER INSERT OR UPDATE ON attendance_records` (B01 thêm mới)

```ts
type AttendancePayload = EventEnvelope & {
  event_type: "attendance-status";
  entity_id: string;  // attendance_record id
  user_id: string;
  work_date: string;
  attendance_state: "pending" | "on_time" | "late" | "excused";
  late_minutes: number | null;
  checked_in_at: string | null;
};
```

### 3.3 fine-status

Trigger: `AFTER INSERT OR UPDATE OF status, paid_at, waived_at ON fines` (hiện có, B01 chuẩn hóa)

```ts
type FinePayload = EventEnvelope & {
  event_type: "fine-status";
  entity_id: string;  // fine_id
  user_id: string;
  work_date: string | null;
  fine_id: string;
  fine_code: string;
  status: "unpaid" | "paid" | "waived";
  amount_vnd: number;
  updated_at: string;
};
```

**Mapping TTS:** Nếu `status` chuyển sang `paid` → announcement type `payment`. Nếu `waived` → **không TTS** (miễn không phải đã thanh toán).

### 3.4 fine-allocation-status

Trigger: `AFTER INSERT OR UPDATE OR DELETE ON fine_allocations` (B01 thêm mới)

```ts
type FineAllocationPayload = EventEnvelope & {
  event_type: "fine-allocation-status";
  entity_id: string | null;  // allocation_id, null nếu DELETE theo B01 verified
  user_id: string | null;
  work_date: string | null;
  allocation_id: string | null;
  fine_id: string;
  fine_code: string | null;
  // Dữ liệu correlation cho invalidation khi allocation chuyển liên kết.
  // Với DELETE verified B01: fine_id vẫn có, old_* có thể null.
  old_fine_id: string | null;
  old_user_id: string | null;
  old_work_date: string | null;
  amount_vnd: number;
  fund_transaction_id: string | null;
  action: "insert" | "update" | "delete";
};
```

**Xử lý DELETE:** B01 verified producer phát `entity_id = null`, `allocation_id = null`, `action = "delete"` nhưng vẫn có `fine_id` và `amount_vnd`. Consumer không được dựa vào allocation ID để invalidation delete.

**Scope cũ/mới:** Khi allocation update (chuyển fine_id/user_id/work_date), producer gửi cả `old_*` và new values. Consumer invalidate cả scope cũ và mới.

### 3.5 fund-status

Trigger: `AFTER INSERT OR UPDATE OF reconciliation_status, voided_at ON fund_transactions` (hiện có, B01 chuẩn hóa)

```ts
type FundPayload = EventEnvelope & {
  event_type: "fund-status";
  entity_id: string;  // transaction_id
  user_id: null;      // fund transaction không thuộc user cụ thể
  work_date: null;    // không có work_date
  transaction_id: string;
  direction: "incoming" | "outgoing";
  amount_vnd: number;
  reconciliation_status: string;
  updated_at: string;
  voided_at: string | null;
  // Correlation — producer query và đính kèm:
  related_fine_ids: string[];   // các fine bị ảnh hưởng bởi transaction này
};
```

**Fund void:** Khi `voided_at` thay đổi từ null sang timestamp, `related_fine_ids` chứa các fine mà allocation liên kết với transaction đó. Consumer invalidate các fine trong danh sách. Không refresh toàn bộ member list.

### 3.6 tts-settings-status

Trigger: `AFTER INSERT OR UPDATE ON tts_settings` (B01 thêm mới)

```ts
type TtsSettingsPayload = EventEnvelope & {
  event_type: "tts-settings-status";
  entity_id: string;  // organization_id vì tts_settings PK là organization_id
  user_id: null;
  work_date: null;
  updated_at: string;
};
```

## 4. Hook API

### 4.1 useOrganizationRealtime

```ts
function useOrganizationRealtime(
  organizationId: string,
  handlers: {
    onCheckIn?: (event: CheckInPayload) => void;
    onAttendance?: (event: AttendancePayload) => void;
    onFine?: (event: FinePayload) => void;
    onFineAllocation?: (event: FineAllocationPayload) => void;
    onFund?: (event: FundPayload) => void;
    onTtsSettings?: (event: TtsSettingsPayload) => void;
  },
  options?: {
    /** Gọi khi subscribe thành công hoặc reconnect — consumer fetch snapshot */
    onSnapshotReady?: () => void;
  }
): void;
```

### 4.2 Reconnect callback

- Hook internal theo dõi `channel.subscribe()` status.
- Khi nhận `SUBSCRIBED` (kể cả sau reconnect), gọi `onSnapshotReady` nếu có.
- Consumer phải fetch lại snapshot khi `onSnapshotReady` fires để lấp khoảng trống giữa snapshot và subscription.
- Hook **không** phát lại event cũ — consumer tự xử lý bằng snapshot.

### 4.3 Coalescing / Dedup

- Hook maintain `Set<string>` (event_id, TTL 5 phút) cho dedup transport-level.
- Nếu event_id đã thấy → bỏ qua, không gọi handler.
- Dedup này **chỉ** bảo vệ chống cùng một event được deliver nhiều lần (SDK retry, reconnect).
- Dedup **announcement** (TTS không đọc trùng) thuộc responsibility của TTS engine (B03), không phải hook.

### 4.4 Lifecycle

- Mỗi component instance tạo một channel, cleanup khi unmount.
- Callback thay đổi không tạo channel mới (dùng refs).
- `onSnapshotReady` stabil bằng refs, không trigger re-subscribe.

## 5. TTS Engine API

### 5.1 Model Config

```ts
type TtsConfig = {
  personality: "friendly" | "teasing" | "spicy" | "extra_spicy" | "relentless";
  enabledEvents: TtsAnnouncementType[];
  cooldownSeconds: number;        // >= 0, default 5
  quietEnabled: boolean;
  quietStart: string;             // "HH:mm"
  quietEnd: string;               // "HH:mm", có thể <= start (qua đêm)
  locale: string;                 // "vi-VN"
  preferredVoice: string;         // voice name hoặc ""
  speechRate: number;             // 0.5–2, default 1
  speechPitch: number;            // 0–2, default 1
};

type TtsAnnouncementType = "on_time" | "late" | "payment" | "achievement" | "fund_balance";
```

### 5.2 Engine Interface

```ts
type TtsEngine = {
  /** Cập nhật config — event tiếp theo dùng config mới */
  updateConfig(config: TtsConfig, timezone: string): void;

  /** Enqueue một announcement — trả về ID để cancel nếu cần */
  enqueue(announcement: TtsAnnouncement): string | null;

  /** Dừng đọc hiện tại, xóa queue, không nhận event mới cho đến unmute */
  mute(): void;

  /** Bật lại sau mute */
  unmute(): void;

  /** Hủy toàn bộ khi unmount */
  destroy(): void;

  /** Dùng cho nút test loa — bypass quiet hours, cooldown, dedup */
  speakTest(text: string): void;
};

type TtsAnnouncement = {
  eventId: string;          // event_id từ Broadcast
  announcementType: TtsAnnouncementType;
  displayName: string | null;
  lateMinutes?: number;
  fineAmountVnd?: number;
  fineCode?: string;
  fundBalance?: number;
};
```

### 5.3 Queue Policy

| Thuộc tính | Giá trị |
|---|---|
| Tối đa queue | 5 messages |
| Cooldown giữa các câu | `config.cooldownSeconds` (default 5s) |
| TTL event | 60 giây — event older bị bỏ |
| Priority | `payment` > `late` > `on_time` > rest |
| Quiet hours | Không phát trong khung; event vẫn cập nhật UI |
| Quiet start = end | Nghĩa là 24h quiet (tắt tất cả) |
| Mute | Dừng câu đang đọc + xóa queue |
| Chaining | Không cắt câu trước vì event mới (trừ mute) |

### 5.4 Voice Selection

1. Tìm voice có `name === config.preferredVoice`.
2. Nếu không có, tìm voice có `lang` starts with `config.locale` (vi-VN).
3. Nếu không có, tìm voice `lang` starts with `vi`.
4. Nếu không có, dùng voice mặc định của browser.
5. Nếu `speechSynthesis` không tồn tại → engine vô hiệu hóa, không throw.

### 5.5 Test Speaker

`speakTest(text)` bypass:
- Quiet hours
- Cooldown
- Dedup
- Queue (phát ngay, cancel câu trước)

Dùng cùng config (voice, rate, pitch) đang active.

## 6. PaymentQrPanel Props

```ts
type PaymentQrPanelProps = {
  fineCode: string;
  originalVnd: number;
  allocatedVnd: number;
  outstandingVnd: number;
  status: "unpaid" | "paid" | "waived";
  memberName: string;
  bank: PaymentBank | null;
};
```

**Không đổi props.** Component hiện tại đã nhận đủ dữ liệu.

- Parent (fine detail, late modal, kiosk) **chịu trách nhiệm** fetch snapshot mới nhất và pass xuống.
- Panel **không** tự subscribe realtime hay gọi RPC.
- Khi allocation/fund thay đổi, parent refetch và re-render panel với props mới.
- Panel tự ẩn QR khi `status !== "unpaid" || outstandingVnd <= 0`.

## 7. Xử Lý User/Date Null

### 7.1 Fund event

- `user_id = null`, `work_date = null`
- Producer phải query `fine_allocations` JOIN `fund_transactions` để lấy `related_fine_ids`.
- Consumer invalidate các fine trong `related_fine_ids`, không refresh mọi member.
- Nếu `related_fine_ids` rỗng (fund không liên quan fine nào) → chỉ refresh fund balance UI nếu có.

### 7.2 Allocation DELETE

- Trigger phải capture `OLD.fine_id`, `OLD.user_id` trước khi xóa.
- Nếu B01 dùng AFTER DELETE không capture được OLD → chuyển sang BEFORE DELETE function hoặc RPC wrapper.
- Producer gửi `old_fine_id`, `old_user_id`, `old_work_date` trong payload.
- Consumer invalidate scope cũ (fine_id cũ) và scope mới (nếu allocation được tạo lại trong cùng transaction).

### 7.3 Record đổi scope (allocation update)

- Khi allocation chuyển từ `fine_A` sang `fine_B`:
  - `old_fine_id = fine_A`, `fine_id = fine_B`
  - Consumer invalidate cả `fine_A` và `fine_B`
- Khi allocation chuyển user/work_date:
  - Gửi cả `old_user_id`/`old_work_date` và values mới
  - Consumer invalidate cả scope cũ và mới

## 8. Dedup Policies

### 8.1 Dedup UI (hook level)

- Dùng `event_id` trong `Set<string>` với TTL 5 phút.
- Nếu event đã thấy → không gọi handler.
- Protection: cùng một Broadcast deliver nhiều lần do SDK reconnect/retry.

### 8.2 Dedup TTS (engine level)

- Dùng riêng `Set<string>` cho TTS, TTL 5 phút.
- Một `event_id` chỉ phát TTS một lần.
- Tách biệt với UI dedup: cùng event_id có thể cần invalidate UI + phát TTS.

### 8.3 Dedup Announcement (nhiều Broadcast cùng nghiệp vụ)

- Một payment có thể tạo 3 Broadcast: `fine-status`, `fund-status`, `fine-allocation-status`.
- Chỉ phát TTS `payment` một lần cho cùng một `fine_id` trong 60 giây.
- TTS engine track `fine_id + announcementType` với TTL 60s.

## 9. Snapshot Reconnect

- Khi mở trang/reconnect: consumer fetch snapshot từ server (RPC/page data).
- **Không** phát lại TTS/toast từ snapshot history.
- Snapshot chỉ dùng để render state hiện tại, không enqueue vào TTS queue.
- Event cũ (trước khi subscribe) không được xếp lại vào queue.
- Feed có thể merge snapshot và live events bằng `attempt_id` (check-in) hoặc `fine_id` (fines).

## 10. Quiet Hours

- `quietStart` và `quietEnd` là `"HH:mm"` theo timezone tổ chức.
- Nếu `quietStart <= quietEnd`: quiet trong khoảng [start, end].
- Nếu `quietStart > quietEnd`: quiet qua đêm, từ start đến midnight + midnight đến end.
- Nếu `quietStart === quietEnd`: 24h quiet (tắt tất cả).
- Quiet check tại thời điểm **phát**, không lúc enqueue.
- Event bị skip trong quiet vẫn cập nhật UI.
- `quietEnabled = false` → không quiet bất kỳ lúc nào.

## 11. Scope Hôm Nay (Ranh Giới)

### Có trong scope B00–B08

- ✅ Event envelope thống nhất 6 loại
- ✅ Hook handlers + reconnect callback
- ✅ TTS engine interface, queue, cooldown, quiet hours
- ✅ PaymentQrPanel props (giữ nguyên)
- ✅ Dedup UI, dedup TTS, announcement dedup
- ✅ Snapshot reconnect không phát lịch sử
- ✅ User/date null, allocation scope change, fund void
- ✅ TTS test speaker API

### Không trong scope hôm nay

- ❌ Multi-kiosk primary speaker (B09)
- ❌ Message template pool / server queue (B11)
- ❌ Achievement/fund balance announcements (B10)
- ❌ QR/OTP hardening (B12)
- ❌ `announcement_events` table consumer
- ❌ `tts_pool_states` rotation logic
- ❌ Template rendering với personality (fallback message cố định trong code)

## 12. Quiet Hours — Sửa Đonte Tài Liệu Nguồn

Tài liệu `ke-hoach-realtime-dong-bo-toan-app.md` dòng 389 ghi:

> "Không đọc event ngoài quiet hours"

Đây là lỗi diễn đạt. Đúng phải là: **"Không đọc event trong quiet hours"**. Event ngoài quiet hours vẫn đọc bình thường.

## 13. Effective Outstanding

Công thức outstanding **duy nhất** across all screens:

```
outstandingVnd = originalVnd - allocatedVnd
allocatedVnd = SUM(fine_allocations.amount_vnd) WHERE fine_id = X
```

- Server pages, late RPC, QR endpoint đều dùng công thức này.
- Client **không tự tính** outstanding từ payload — chỉ dùng snapshot server.
- Nếu công thức hiện tại đang không nhất quán → B01/B06 sửa trong scope migration/RPC.

## 14. Rollout Plan

1. **B01** thêm migration mới cho `attendance-status`, `fine-allocation-status`, `tts-settings-status` + chuẩn hóa 3 event hiện có.
2. **B02** mở rộng hook handlers, giữ backward-compatible — old consumers vẫn hoạt động vì event_name mới.
3. **B03** tạo TTS engine module mới, không đụng kiosk component.
4. **B04–B07** migration逐步 theo contract, mỗi batch tự test phần mình.
5. Không cần feature flag — event mới chỉ phát khi migration chạy, old clients ignore event không subscribe.

---

> **Trạng thái contract:** REVIEW — chờ user duyệt trước khi B01/B02/B03 bắt đầu.
