# Phase 2: Payment Setting, QR Generation & Supabase Realtime
## Part 1: Payment Setting, QR Generation & Supabase Realtime
> **Techstack:** Supabase (PostgreSQL, Realtime, Edge Functions, Auth, Storage)  
> **Ngân hàng:** Vietinbank (`ICB`) — cú pháp trigger Sepay: `SEVQR TKP<VA> <TX_ID> <FULL_NAME>`  
> **QR Provider:** VietQR (`https://vietqr.app/img?...`) — không cần API key

---

### 1. Data Model (Các bảng dùng trong Part 1)

#### 1.1 `payment_settings` (1 dòng duy nhất, hoặc 1 dòng / branch)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, default gen_random_uuid() | |
| `branch_code` | VARCHAR(10) | UNIQUE, nullable | `HN`, `HCM`, `DN` — null = default |
| `account_number` | VARCHAR(50) | NOT NULL | STK công ty |
| `bank_code` | VARCHAR(20) | NOT NULL | Mã ngân hàng (`ICB`, `VCB`, ...) |
| `account_holder` | VARCHAR(100) | NOT NULL | Tên chủ TK |
| `company_name` | VARCHAR(100) | NOT NULL | Tên công ty trên QR |
| `sepay_prefix` | VARCHAR(20) | NOT NULL | `SEVQR` |
| `va_code` | VARCHAR(10) | nullable | `HN`, `HCM` — dùng khi có nhiều chi nhánh |
| `qr_template` | VARCHAR(20) | DEFAULT 'compact' | `compact`, `qronly`, `standee` |
| `show_info` | BOOLEAN | DEFAULT true | Hiển thị thông tin TK trên QR |
| `is_active` | BOOLEAN | DEFAULT true | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |

**RLS:** Chỉ `manager` role mới được SELECT/UPDATE/INSERT.

> **Hint thay thế:** Nếu dùng Node.js/Express + MongoDB: lưu 1 document `PaymentConfig` trong collection `configs`. Nếu dùng Firebase: lưu 1 document trong Firestore collection `settings/payment`.

---

#### 1.2 `penalty_tickets` (đã có từ Phase 1, mở rộng thêm cột)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | |
| `user_id` | UUID | FK → users | |
| `transaction_id` | VARCHAR(20) | UNIQUE, NOT NULL | Mã hiển thị trên QR (vd: `A7B3C9D2`) |
| `amount` | BIGINT | NOT NULL | Đơn vị VNĐ (20000) |
| `status` | VARCHAR(20) | DEFAULT 'UNPAID' | `UNPAID` / `PAID` / `WAIVED` / `CASH_PAID` |
| `type` | VARCHAR(50) | NOT NULL | `LATE_CHECKIN`, `EARLY_LEAVE`, ... |
| `reason` | TEXT | nullable | Lý do phạt |
| `sepay_content` | TEXT | nullable | Nội dung CK thực tế từ webhook |
| `paid_at` | TIMESTAMPTZ | nullable | |
| `branch_code` | VARCHAR(10) | nullable | Chi nhánh (dùng để lọc) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

**RLS:** User chỉ xem được phiếu của mình. Manager xem tất cả.

---

#### 1.3 `users` (bổ sung cột)

| Column | Type | Description |
|--------|------|-------------|
| `full_name` | VARCHAR(100) | Dùng để sinh QR description (uppercase) |

---

### 2. Payment Setting (Admin Panel)

#### 2.1 Flow cấu hình

```
Manager mở Admin → Payment Setting
    ↓
Form hiển thị cấu hình hiện tại (hoặc trống nếu chưa có)
    ↓
Nhập: STK, chọn ngân hàng (dropdown từ banks.json), tên chủ TK, tên CTY
    ↓
Nhập: sepay_prefix (mặc định SEVQR), va_code (vd: HN)
    ↓
Nếu bank_code = 'ICB' (Vietinbank) và sepay_prefix để trống
    → Báo lỗi: "Vietinbank bắt buộc nhập prefix để trigger webhook"
    ↓
Lưu vào Supabase → bảng payment_settings
```

#### 2.2 Dropdown ngân hàng

- Tải `https://vietqr.app/banks.json` về 1 lần, cache vào Supabase Storage hoặc localStorage (refresh mỗi tuần).
- Hiển thị: `{name} ({shortName})` — value là `code` (vd: `ICB`).

> **Hint thay thế:** Nếu không dùng Supabase Storage: lưu `banks.json` vào thư mục `public/` của frontend, hoặc fetch trực tiếp từ vietqr.app mỗi khi mở form (có cache 1 ngày).

#### 2.3 Validation Rules

| Rule | Lỗi |
|------|-----|
| `account_number` rỗng / < 6 ký tự | "Số tài khoản không hợp lệ" |
| `bank_code` không có trong `banks.json` | "Ngân hàng không hợp lệ" |
| `bank_code = 'ICB'` và `sepay_prefix` rỗng | "Vietinbank yêu cầu nhập prefix" |
| `sepay_prefix` chứa khoảng trắng | "Prefix không được chứa khoảng trắng" |
| `va_code` chứa ký tự đặc biệt | "Mã VA chỉ chứa chữ cái và số" |

#### 2.4 API (Supabase)

```sql
-- Lấy cấu hình
SELECT * FROM payment_settings WHERE is_active = true LIMIT 1;

-- Cập nhật (manager only)
UPDATE payment_settings SET ... WHERE id = ...;
```

> **Hint thay thế:** Nếu dùng Node.js/Express: `GET /api/settings/payment`, `PUT /api/settings/payment` với middleware `requireRole('manager')`.

---

### 3. QR Generation (User Payment Flow)

#### 3.1 Flow tạo QR

```
User mở PWA → Tab "Phiếu phạt" → Chọn phiếu UNPAID
    ↓
Bấm "Thanh toán ngay"
    ↓
Backend tạo transaction_id ngẫu nhiên (8 ký tự: A-Z, 0-9)
    → Kiểm tra UNIQUE trên penalty_tickets.transaction_id
    ↓
Lấy payment_settings (STK, bank_code, prefix, va_code)
    ↓
Lấy full_name của user → uppercase, bỏ dấu (NGUYEN VAN A)
    ↓
Sinh description: SEVQR TKPHN A7B3C9D2 NGUYEN VAN A
    ↓
Sinh VietQR URL
    ↓
PWA hiển thị QR + thông tin chuyển khoản + nút "Đã chuyển khoản"
    ↓
PWA subscribe Supabase Realtime channel: penalty-{ticket_id}
```

#### 3.2 Công thức Description

```
{prefix} [TKP{va_code}] {transaction_id} {FULL_NAME_UPPERCASE}
```

| Thành phần | Ví dụ | Điều kiện |
|------------|-------|-----------|
| `{prefix}` | `SEVQR` | Bắt buộc với Vietinbank |
| `[TKP{va_code}]` | `TKPHN` | Chỉ có khi `va_code` không null. Có khoảng trắng trước. |
| `{transaction_id}` | `A7B3C9D2` | 8 ký tự, UNIQUE |
| `{FULL_NAME_UPPERCASE}` | `NGUYEN VAN A` | Bỏ dấu, uppercase |

**Ví dụ đầy đủ:**
- Có VA: `SEVQR TKPHN A7B3C9D2 NGUYEN VAN A`
- Không VA: `SEVQR A7B3C9D2 NGUYEN VAN A`

> **Lưu ý:** `transaction_id` được lưu vào `penalty_tickets.transaction_id` ngay khi tạo phiếu (Phase 1), hoặc sinh lúc user bấm "Thanh toán" nếu chưa có.

#### 3.3 Công thức VietQR URL

```
https://vietqr.app/img
  ?acc={account_number}
  &bank={bank_code}
  &amount={amount}
  &des={encoded_description}
  &template={qr_template}
  &showinfo={show_info}
  &download=false
  &fullacc=true
  &holder={encoded_account_holder}
  &store={encoded_company_name}
```

**Ví dụ URL đầy đủ:**
```
https://vietqr.app/img?acc=1010101010&bank=ICB&amount=20000&des=SEVQR%20TKPHN%20A7B3C9D2%20NGUYEN%20VAN%20A&template=compact&showinfo=true&download=false&fullacc=true&holder=CONG%20TY%20ABC&store=CONG%20TY%20ABC
```

**PWA render:**
```html
<img
  src="https://vietqr.app/img?acc=...&bank=..."
  alt="QR Thanh toán"
  onerror="this.style.display='none'; document.getElementById('fallback').style.display='block';"
/>
<div id="fallback" style="display:none;">
  <p>STK: {account_number}</p>
  <p>Ngân hàng: {bank_name}</p>
  <p>Số tiền: {amount}đ</p>
  <p>Nội dung: {description}</p>
</div>
```

#### 3.4 Supabase Realtime — PWA Subscribe

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://your-project.supabase.co',
  'anon-key'
);

function subscribePaymentStatus(ticketId, onPaid) {
  const channel = supabase
    .channel(`penalty-${ticketId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'penalty_tickets',
        filter: `id=eq.${ticketId}`,
      },
      (payload) => {
        const newRow = payload.new;
        if (newRow.status === 'PAID') {
          onPaid(newRow);
          channel.unsubscribe();
        }
        if (newRow.status === 'WAIVED') {
          onWaived(newRow);
          channel.unsubscribe();
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Realtime: listening for ticket', ticketId);
      }
      if (status === 'CHANNEL_ERROR') {
        console.error('Realtime error, fallback to polling');
        startPolling(ticketId, onPaid); // fallback
      }
    });

  return channel;
}

// Cleanup khi user rời màn hình
function unsubscribe(channel) {
  channel.unsubscribe();
}
```

> **Hint thay thế Realtime:**
> - **Polling:** `setInterval(() => fetch(`/api/penalty-tickets/${ticketId}`), 5000)` — đơn giản nhất, tốn request.
> - **SSE:** `const es = new EventSource('/api/sse/penalty?ticket=' + ticketId)` — server giữ kết nối HTTP mở, ghi dòng `data: {...}` khi có update. Nhẹ hơn WebSocket.
> - **WebSocket (Socket.io):** `socket.emit('join', 'penalty-' + ticketId)` — server emit event khi DB update. Cần tự quản lý reconnect và room.

---

### 4. Fallback & Error Handling

#### 4.1 QR không load (vietqr.app lỗi / offline)

| Lỗi | Hành động |
|-----|-----------|
| `onerror` của `<img>` | Ẩn QR, hiện fallback text: STK + ngân hàng + số tiền + nội dung CK |
| User copy nội dung | Nút "Sao chép nội dung CK" — copy `description` vào clipboard |
| Không có internet | Hiện "Vui lòng kiểm tra kết nối mạng" + lưu phiếu vào localStorage để sync sau |

#### 4.2 Supabase Realtime disconnect

| Lỗi | Hành động |
|-----|-----------|
| `CHANNEL_ERROR` hoặc `CLOSED` | Tự động chuyển sang **Polling 5 giây** |
| PWA background / mất mạng | `visibilitychange` event → dừng realtime, resume khi active lại |
| Reconnect | `setTimeout(() => subscribePaymentStatus(ticketId, onPaid), 3000)` |

#### 4.3 Transaction ID trùng

```sql
-- Sinh transaction_id và kiểm tra UNIQUE
DO $$
DECLARE
  new_id VARCHAR(8);
  exists_check BOOLEAN;
BEGIN
  LOOP
    new_id := upper(substring(md5(random()::text), 1, 8));
    SELECT EXISTS(SELECT 1 FROM penalty_tickets WHERE transaction_id = new_id) INTO exists_check;
    EXIT WHEN NOT exists_check;
  END LOOP;
  -- new_id is unique
END $$;
```

> **Hint thay thế:** Nếu dùng MongoDB: `while (await db.penaltyTickets.findOne({ transactionId })) { regenerate() }`. Nếu dùng Firebase: `collection.where('transactionId', '==', id).get()` rồi kiểm tra empty.

---

### 5. Test Case (Part 1)

| ID | Mô tả | Input | Expected |
|----|-------|-------|----------|
| **P2-01** | Lưu Payment Setting hợp lệ | STK, bank=ICB, prefix=SEVQR | Lưu thành công |
| **P2-02** | Lưu Vietinbank thiếu prefix | bank=ICB, prefix='' | Lỗi: "Vietinbank yêu cầu nhập prefix" |
| **P2-03** | Lưu STK quá ngắn | account_number='123' | Lỗi validation |
| **P2-04** | Sinh QR đúng URL | amount=20000, tx_id=A7B3C9D2 | URL chứa đúng `acc`, `bank=ICB`, `amount=20000`, `des=SEVQR...` |
| **P2-05** | Sinh description có VA | va_code=HN | Description chứa `TKPHN` |
| **P2-06** | Sinh description không có VA | va_code=null | Description không chứa `TKP` |
| **P2-07** | Realtime nhận UPDATE PAID | Webhook update status=PAID | PWA nhận event, ẩn QR, hiện "Đã thanh toán" |
| **P2-08** | Realtime nhận UPDATE WAIVED | Manager waive phiếu | PWA nhận event, ẩn QR, hiện "Phiếu đã được miễn" |
| **P2-09** | QR load fail → fallback | vietqr.app 500 | Hiển thị text STK + nội dung |
| **P2-10** | Realtime disconnect → polling | Mất mạng 10 giây | Tự động chuyển polling 5s, khi mạng về lại reconnect Realtime |
| **P2-11** | Transaction ID trùng | Sinh ID đã tồn tại | Tự động sinh lại cho đến khi UNIQUE |
| **P2-12** | Copy nội dung CK | User bấm "Sao chép" | Clipboard chứa đúng description |

---

### 6. Tóm tắt kiến trúc Part 1

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   Manager   │────▶│  Payment Setting │────▶│  Supabase DB     │
│   (Admin)   │     │  (Form + Validate)│     │  payment_settings│
└─────────────┘     └─────────────────┘     └──────────────────┘
                                                     │
┌─────────────┐     ┌─────────────────┐            │
│     User    │────▶│  Màn hình QR     │◄───────────┘
│   (PWA)     │     │  - VietQR img    │
└──────┬──────┘     │  - Realtime sub  │
       │            └─────────────────┘
       │                     │
       │                     ▼
       │            ┌──────────────────┐
       │            │ Supabase Realtime │
       │            │  (DB → Client)    │
       │            └──────────────────┘
       │                     ▲
       │                     │
       └─────────────────────┘
         Webhook về (Part 2)
```

---

> **Part 2:** Webhook Sepay sẽ được xử lý bằng **Supabase Edge Function** (Deno). Edge Function verify HMAC → parse content → update `penalty_tickets` → Supabase Realtime tự động push về PWA. Không cần giữ WebSocket connection trong code custom.

## Phase 2 — Part 2: Sepay Webhook Integration

> **Techstack:** Supabase Edge Functions (Deno) + PostgreSQL RPC  
> **Bảo mật:** HMAC-SHA256 (khuyến nghị production)  
> **Ngân hàng:** Vietinbank (`ICB`) — prefix `SEVQR`, VA `TKP<CODE>`

---

### 1. Tổng quan Flow Webhook

```
User quét QR → chuyển khoản qua app ngân hàng
    ↓
Sepay nhận biến động số dư từ Vietinbank
    ↓
Sepay filter: nội dung bắt đầu bằng "SEVQR"
    ↓
Sepay POST đến Supabase Edge Function URL
    ↓
Edge Function: verify HMAC + anti-replay + dedup
    ↓
Parse content → tìm transaction_id → tìm phiếu phạt
    ↓
Kiểm tra số tiền (chỉ chấp nhận đúng số tiền — thiếu/thừa để Phase 4)
    ↓
Gọi PostgreSQL RPC: update penalty_tickets + insert fund_transactions (atomic)
    ↓
Supabase Realtime tự động push UPDATE về PWA
    ↓
Ghi log dedup + audit log
    ↓
Return {"success": true} cho Sepay
```

> **Hint thay thế:** Nếu dùng Node.js/Express: viết 1 route `POST /api/webhooks/sepay`, dùng `express.raw({type: 'application/json'})` để đọc raw body, sau đó verify HMAC bằng `crypto.createHmac('sha256', secret)`.

---

### 2. Cấu hình Sepay Dashboard

#### 2.1 Tạo Webhook

| Bước | Thao tác |
|------|----------|
| 1 | Đăng nhập Sepay → Webhooks → Tạo mới |
| 2 | **Tên webhook:** `PWA Check-in — Vietinbank` |
| 3 | **URL:** `https://<project>.supabase.co/functions/v1/sepay-webhook` |
| 4 | **Loại:** Chọn `Tiền vào` (chỉ nhận khi tiền vào TK) |
| 5 | **Bộ lọc nội dung:** `SEVQR` (chỉ gửi webhook khi nội dung CK chứa "SEVQR") |
| 6 | **Bảo mật:** Chọn `HMAC-SHA256` → copy **Secret Key** ngay (chỉ hiện 1 lần) |
| 7 | **Cảnh báo lỗi:** Nhập Telegram/Slack webhook để nhận cảnh báo khi endpoint trả lỗi |

#### 2.2 Lưu Secret Key

- Lưu vào **Supabase Vault** hoặc biến môi trường Edge Function (không hardcode trong code).
- Tên biến: `SEPAY_WEBHOOK_SECRET`

> **Hint thay thế:** Nếu dùng Node.js: lưu vào `.env` hoặc AWS Secrets Manager / Azure Key Vault. Nếu dùng Firebase: lưu vào Cloud Functions config hoặc Secret Manager.

---

### 3. Supabase Edge Function (Deno)

#### 3.1 File: `supabase/functions/sepay-webhook/index.ts`

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── 1. CONFIG ──
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SEPAY_SECRET = Deno.env.get('SEPAY_WEBHOOK_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (req) => {
  // ── 2. READ RAW BODY ──
  const body = await req.text();
  const signature = req.headers.get('x-sepay-signature') ?? '';
  const timestamp = Number(req.headers.get('x-sepay-timestamp') ?? 0);

  // ── 3. ANTI-REPLAY (±5 phút) ──
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - timestamp) > 300) {
    return Response.json({ success: false, error: 'Timestamp too old' }, { status: 401 });
  }

  // ── 4. HMAC-SHA256 VERIFY ──
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SEPAY_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`));
  const expected = 'sha256=' + Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time compare
  if (signature.length !== expected.length) {
    return Response.json({ success: false, error: 'Invalid signature length' }, { status: 401 });
  }
  let match = true;
  for (let i = 0; i < signature.length; i++) {
    if (signature.charCodeAt(i) !== expected.charCodeAt(i)) match = false;
  }
  if (!match) {
    return Response.json({ success: false, error: 'Invalid signature' }, { status: 401 });
  }

  // ── 5. PARSE PAYLOAD ──
  const data = JSON.parse(body);

  // Skip test payload (id = 0) — Sepay test send không cần verify
  if (data.id === 0) {
    return Response.json({ success: true, note: 'Test payload accepted' });
  }

  // ── 6. DEDUPLICATION ──
  const { data: existing } = await supabase
    .from('sepay_webhook_logs')
    .select('id')
    .eq('sepay_id', data.id)
    .single();

  if (existing) {
    // Đã xử lý → vẫn return success để Sepay không retry
    return Response.json({ success: true, note: 'Already processed' });
  }

  // ── 7. PARSE CONTENT → TÌM TRANSACTION ID ──
  const content = (data.content || '').trim();
  // Regex: SEVQR [TKPXX] XXXXXXXX [NAME]
  // Tách transaction_id (8 ký tự A-Z0-9) sau prefix và optional VA
  const match = content.match(/SEVQR(?:\s+TKP[A-Z0-9]+)?\s+([A-Z0-9]{8})/i);
  const transactionId = match?.[1]?.toUpperCase();

  if (!transactionId) {
    // Lưu unmatched để đối soát
    await supabase.from('unmatched_transactions').insert({
      sepay_id: data.id,
      content: content,
      amount: data.transferAmount,
      received_at: new Date().toISOString(),
      reason: 'NO_TRANSACTION_ID',
    });
    return Response.json({ success: true, note: 'No transaction ID found' });
  }

  // ── 8. TÌM PHIẾU PHẠT ──
  const { data: ticket } = await supabase
    .from('penalty_tickets')
    .select('*')
    .eq('transaction_id', transactionId)
    .eq('status', 'UNPAID')
    .single();

  if (!ticket) {
    await supabase.from('unmatched_transactions').insert({
      sepay_id: data.id,
      transaction_id: transactionId,
      content: content,
      amount: data.transferAmount,
      received_at: new Date().toISOString(),
      reason: 'TICKET_NOT_FOUND_OR_PAID',
    });
    return Response.json({ success: true, note: 'Ticket not found or already paid' });
  }

  // ── 9. KIỂM TRA SỐ TIỀN (Demo: chỉ chấp nhận đúng số tiền) ──
  if (data.transferAmount !== ticket.amount) {
    await supabase.from('unmatched_transactions').insert({
      sepay_id: data.id,
      ticket_id: ticket.id,
      transaction_id: transactionId,
      content: content,
      expected_amount: ticket.amount,
      received_amount: data.transferAmount,
      received_at: new Date().toISOString(),
      reason: 'AMOUNT_MISMATCH',
    });
    return Response.json({ success: true, note: 'Amount mismatch' });
  }

  // ── 10. GỌI RPC — ATOMIC UPDATE ──
  const { error: rpcError } = await supabase.rpc('process_payment', {
    p_ticket_id: ticket.id,
    p_sepay_id: data.id,
    p_sepay_content: content,
    p_amount: data.transferAmount,
    p_branch: data.subAccount || null,
    p_reference: data.referenceCode || null,
  });

  if (rpcError) {
    console.error('RPC error:', rpcError);
    return Response.json({ success: false, error: 'Internal error' }, { status: 500 });
  }

  // ── 11. GHI LOG DEDUP ──
  await supabase.from('sepay_webhook_logs').insert({
    sepay_id: data.id,
    ticket_id: ticket.id,
    payload: data,
    processed_at: new Date().toISOString(),
  });

  // ── 12. RETURN ──
  return Response.json({ success: true });
});
```

> **Hint thay thế (Node.js/Express):**
> ```javascript
> app.post('/api/webhooks/sepay', express.raw({type: 'application/json'}), async (req, res) => {
>   const body = req.body; // raw Buffer
>   const signature = req.headers['x-sepay-signature'];
>   const timestamp = Number(req.headers['x-sepay-timestamp']);
>   
>   // Anti-replay
>   if (Math.abs(Date.now()/1000 - timestamp) > 300) return res.status(401).json({success: false});
>   
>   // HMAC
>   const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex');
>   if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
>     return res.status(401).json({success: false});
>   }
>   
>   const data = JSON.parse(body);
>   // ... same logic
>   res.json({success: true});
> });
> ```

---

### 4. PostgreSQL RPC — Atomic Transaction

#### 4.1 Function: `process_payment`

```sql
CREATE OR REPLACE FUNCTION process_payment(
  p_ticket_id UUID,
  p_sepay_id VARCHAR(50),
  p_sepay_content TEXT,
  p_amount BIGINT,
  p_branch TEXT,
  p_reference TEXT
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1. Cập nhật phiếu phạt
  UPDATE penalty_tickets
  SET
    status = 'PAID',
    paid_at = NOW(),
    sepay_content = p_sepay_content,
    updated_at = NOW()
  WHERE id = p_ticket_id
    AND status = 'UNPAID'; -- idempotent: chỉ update nếu còn UNPAID

  -- 2. Tạo transaction quỹ (INCOME từ phạt)
  INSERT INTO fund_transactions (
    type,
    source,
    amount,
    ticket_id,
    branch,
    description,
    reference_code,
    created_at
  ) VALUES (
    'INCOME',
    'PENALTY',
    p_amount,
    p_ticket_id,
    p_branch,
    p_sepay_content,
    p_reference,
    NOW()
  );

  -- 3. Ghi audit log
  INSERT INTO audit_logs (
    actor_id,
    action,
    target_type,
    target_id,
    old_value,
    new_value,
    reason,
    created_at
  ) VALUES (
    NULL, -- system action
    'PENALTY_PAID',
    'PENALTY_TICKET',
    p_ticket_id,
    jsonb_build_object('status', 'UNPAID'),
    jsonb_build_object('status', 'PAID', 'sepay_id', p_sepay_id, 'amount', p_amount),
    'Auto-paid via Sepay webhook',
    NOW()
  );

END;
$$;
```

> **Tại sao dùng RPC:** Đảm bảo **atomic** — nếu lỗi giữa chừng (ví dụ quỹ insert fail) thì toàn bộ rollback, không để phiếu PAID mà quỹ không có record.

> **Hint thay thế:** Nếu dùng Node.js + PostgreSQL: dùng `pg` client với `BEGIN ... COMMIT` transaction. Nếu dùng MongoDB: dùng `withTransaction()` session. Nếu dùng Firebase: dùng `runTransaction()` trên Firestore.

---

### 5. Payload Sepay — 10 trường chính

| Trường | Type | Mô tả | Dùng trong logic |
|--------|------|-------|------------------|
| `id` | Number | ID giao dịch trên Sepay | Dedup key |
| `gateway` | String | Tên cổng (`VietinBank`) | Log |
| `transactionDate` | String | Thời gian giao dịch `yyyy-MM-dd HH:mm:ss` | Log |
| `accountNumber` | String | STK công ty nhận tiền | Verify |
| `subAccount` | String | Memo/VA (vd: `TKPHN`) | Xác định chi nhánh |
| `code` | String | Mã giao dịch ngân hàng | Log |
| `content` | String | Nội dung CK | **Parse transaction_id** |
| `transferType` | String | `in` / `out` | Chỉ xử lý `in` |
| `transferAmount` | Number | Số tiền chuyển | **So khớp với phiếu** |
| `accumulated` | Number | Số dư tích lũy | Log |
| `referenceCode` | String | Mã tham chiếu | Log |

**Lưu ý quan trọng:**
- Sepay **không gửi STK người chuyển** → không thể lưu, không cần lưu.
- `subAccount` chứa `TKP<VA>` nếu dùng memo-based VA.
- `id = 0` là test payload → skip HMAC verify.
- Luôn return `{"success": true}` dù đã từng nhận, để Sepay không retry.

---

### 6. Bảng phụ trợ

#### 6.1 `sepay_webhook_logs` (Dedup)

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `sepay_id` | VARCHAR(50) | UNIQUE, NOT NULL |
| `ticket_id` | UUID | FK → penalty_tickets |
| `payload` | JSONB | Lưu toàn bộ payload |
| `processed_at` | TIMESTAMPTZ | |

#### 6.2 `unmatched_transactions` (Đối soát)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `sepay_id` | VARCHAR(50) | |
| `ticket_id` | UUID | nullable |
| `transaction_id` | VARCHAR(20) | nullable |
| `content` | TEXT | |
| `amount` | BIGINT | |
| `expected_amount` | BIGINT | nullable (nếu amount mismatch) |
| `received_amount` | BIGINT | nullable |
| `reason` | VARCHAR(50) | `NO_TRANSACTION_ID` / `TICKET_NOT_FOUND` / `AMOUNT_MISMATCH` |
| `received_at` | TIMESTAMPTZ | |
| `resolved` | BOOLEAN | DEFAULT false |
| `resolved_at` | TIMESTAMPTZ | nullable |
| `resolved_by` | UUID | nullable |

> **Hint thay thế:** Nếu dùng MongoDB: 2 collection `sepayLogs` (unique index trên `sepayId`) và `unmatchedTxns`. Nếu dùng Firebase: 2 documents trong Firestore với `sepayId` làm document ID để tự động dedup (Firestore không cho phép duplicate ID trong 1 collection).

---

### 7. Lỗi thường gặp & Cách tránh

| Lỗi | Nguyên nhân | Cách fix |
|-----|-------------|----------|
| HMAC fail | Dùng `express.json()` trước → body bị parse mất raw | Dùng `express.raw()` hoặc đọc `req.text()` trước khi parse |
| HMAC fail | Thứ tự key JSON khác khi stringify lại | Dùng raw body string gốc, không `JSON.stringify` lại |
| HMAC fail | Unicode escape khác nhau | Dùng raw bytes từ request |
| Duplicate process | Không dedup → tạo 2 fund transaction | `UNIQUE(sepay_id)` hoặc `INSERT IGNORE` |
| Phiếu PAID 2 lần | Race condition 2 webhook cùng lúc | `UPDATE ... WHERE status = 'UNPAID'` trong RPC |
| Test payload bị reject | `id = 0` không có signature | Check `id === 0` và skip verify |

---

### 8. Test Case (Part 2)

| ID | Mô tả | Input | Expected |
|----|-------|-------|----------|
| **P2-13** | Webhook hợp lệ — PAID thành công | HMAC đúng, tx_id tồn tại, đúng số tiền | `{"success": true}`, phiếu PAID, quỹ +amount, audit log ghi |
| **P2-14** | HMAC sai | Signature không khớp | `{"success": false}`, status 401, không đụng DB |
| **P2-15** | Timestamp quá cũ | timestamp = now - 10 phút | `{"success": false}`, status 401 |
| **P2-16** | Duplicate webhook (dedup) | Gửi lại cùng sepay_id | `{"success": true}`, DB không thay đổi lần 2 |
| **P2-17** | Không tìm thấy transaction_id trong content | content = "CHUYEN TIEN" | Lưu unmatched, reason = `NO_TRANSACTION_ID` |
| **P2-18** | Transaction ID không tồn tại | tx_id = "ZZZZZZZZ" | Lưu unmatched, reason = `TICKET_NOT_FOUND` |
| **P2-19** | Phiếu đã PAID | Gửi webhook cho phiếu đã PAID | Lưu unmatched, reason = `TICKET_NOT_FOUND_OR_PAID` |
| **P2-20** | Số tiền không khớp | Phiếu 20k, chuyển 15k | Lưu unmatched, reason = `AMOUNT_MISMATCH` |
| **P2-21** | Test payload (id=0) | `{"id": 0, ...}` | `{"success": true}`, không verify HMAC |
| **P2-22** | Webhook tiền ra (`transferType: 'out'`) | Bị lọc bởi Sepay dashboard, nhưng nếu về | Bỏ qua, không xử lý (hoặc log rồi return success) |
| **P2-23** | Race condition — 2 webhook cùng lúc | 2 request đồng thời cho cùng phiếu | Chỉ 1 request thành công (nhờ `WHERE status = 'UNPAID'`), request 2 lưu unmatched |
| **P2-24** | Có VA code trong subAccount | `subAccount: "TKPHN"` | `fund_transactions.branch = "TKPHN"` |
| **P2-25** | Không có VA code | `subAccount: null` | `fund_transactions.branch = null` |

---

### 9. Tóm tắt kiến trúc Part 2

```
Sepay Dashboard
    │ (filter: "SEVQR", HTTPS, HMAC-SHA256)
    ▼
Supabase Edge Function (Deno)
    ├── 1. Read raw body
    ├── 2. Anti-replay (timestamp ±5min)
    ├── 3. HMAC-SHA256 verify
    ├── 4. Parse payload
    ├── 5. Dedup (sepay_id)
    ├── 6. Parse content → transaction_id
    ├── 7. Find ticket (UNPAID)
    ├── 8. Amount check (exact match)
    ├── 9. PostgreSQL RPC (atomic)
    │       ├── UPDATE penalty_tickets → PAID
    │       ├── INSERT fund_transactions
    │       └── INSERT audit_logs
    ├── 10. Insert sepay_webhook_logs
    └── 11. Return {"success": true}
                │
                ▼
        Supabase Realtime auto-push
                │
                ▼
              PWA (Part 1)
```

---

> **Part 3:** Quản lý phiếu phạt — danh sách theo ngày, miễn phạt (bắt buộc lý do), thu tiền mặt (checkbox + tạo quỹ), audit trail diff old/new value.

## Part 3: Quản lý phiếu phạt, Miễn phạt, Thu tiền mặt & Audit Trail

> **Techstack:** Supabase (PostgreSQL, Auth, RLS)  
> **Nguyên tắc:** Mọi thao tác ảnh hưởng tiền/dữ liệu → bắt buộc audit trail. Append-only, không xóa sửa.

---

### 1. Danh sách phiếu phạt (Manager View)

#### 1.1 Màn hình

```
Manager mở PWA → Tab "Quản lý" → "Phiếu phạt"
    ↓
Header: Tổng số phiếu hôm nay, Tổng tiền UNPAID, Tổng tiền đã thu
    ↓
Filter bar:
  - Ngày: Date picker (default hôm nay, có thể chọn range)
  - Trạng thái: Tất cả / UNPAID / PAID / WAIVED / CASH_PAID
  - Loại: Tất cả / LATE_CHECKIN / EARLY_LEAVE / ...
  - Nhân viên: Search tên / dropdown
  - Chi nhánh: Tất cả / HN / HCM / DN (dựa vào VA code)
    ↓
Table:
  | Mã | Nhân viên | Loại | Số tiền | Trạng thái | Lý do | Thời gian | Người thao tác | Action |
```

#### 1.2 Badge màu trạng thái

| Trạng thái | Màu | Ý nghĩa |
|------------|-----|---------|
| `UNPAID` | 🔴 Đỏ | Chưa thanh toán |
| `PAID` | 🟢 Xanh lá | Đã thanh toán qua Sepay |
| `CASH_PAID` | 🔵 Xanh dương | Đã thu tiền mặt |
| `WAIVED` | 🟡 Vàng | Đã miễn phạt |

#### 1.3 API (Supabase)

```sql
-- Query với filter động
SELECT 
  pt.*,
  u.full_name as user_name,
  u.email as user_email,
  al.actor_id as last_actor_id,
  au.full_name as last_actor_name
FROM penalty_tickets pt
JOIN users u ON pt.user_id = u.id
LEFT JOIN LATERAL (
  SELECT actor_id, created_at 
  FROM audit_logs 
  WHERE target_type = 'PENALTY_TICKET' AND target_id = pt.id
  ORDER BY created_at DESC 
  LIMIT 1
) al ON true
LEFT JOIN users au ON al.actor_id = au.id
WHERE 
  DATE(pt.created_at) BETWEEN '2026-08-25' AND '2026-08-25'
  AND pt.status = ANY(ARRAY['UNPAID', 'PAID']) -- filter status
  AND pt.type = 'LATE_CHECKIN' -- filter type
  AND pt.branch_code = 'HN' -- filter branch
  AND (u.full_name ILIKE '%nguyen%' OR u.email ILIKE '%nguyen%') -- search user
ORDER BY pt.created_at DESC
LIMIT 50 OFFSET 0;
```

> **Hint thay thế:** Nếu dùng Node.js/Express + MongoDB: dùng `aggregate` với `$match` (date range, status, type, branch, text search), `$lookup` join `users`, `$sort`, `$skip`, `$limit`. Nếu dùng Firebase: dùng compound query với `where`, `orderBy`, `limit` — lưu ý Firebase yêu cầu index cho mỗi combination `where` + `orderBy`.

#### 1.4 RLS Policy

```sql
-- Manager xem tất cả
CREATE POLICY "Manager can view all penalty tickets"
ON penalty_tickets FOR SELECT
USING (auth.jwt() ->> 'role' = 'manager');

-- User chỉ xem của mình
CREATE POLICY "User can view own penalty tickets"
ON penalty_tickets FOR SELECT
USING (auth.uid() = user_id);
```

---

### 2. Miễn phạt (Waive Penalty)

#### 2.1 Điều kiện

- Chỉ áp dụng phiếu `UNPAID`.
- Phiếu `PAID` / `CASH_PAID` → **không thể miễn**.
- Phiếu đã `WAIVED` → không thao tác gì thêm.

#### 2.2 Flow

```
Manager chọn phiếu UNPAID → Bấm "Miễn phạt"
    ↓
Popup bắt buộc:
  - Textarea "Lý do miễn phạt" (tối thiểu 10 ký tự)
  - Đếm ký tự realtime
  - Nút "Xác nhận" DISABLED nếu chưa đủ 10 ký tự
    ↓
Manager nhập lý do → Bấm xác nhận
    ↓
Gọi API → Backend:
  1. Kiểm tra phiếu còn UNPAID (race condition)
  2. UPDATE status = 'WAIVED', waived_at = NOW(), waived_reason = input
  3. INSERT audit_log: action = 'WAIVE_PENALTY', old_value = {status: 'UNPAID'}, new_value = {status: 'WAIVED', reason: input}
  4. Gửi thông báo cho user
    ↓
Supabase Realtime push UPDATE về PWA user
    ↓
Phiếu biến mất khỏi list UNPAID của user
```

#### 2.3 UI — Popup miễn phạt

```html
<dialog id="waiveModal">
  <h3>Miễn phạt phiếu P-xxx</h3>
  <p>Nhân viên: Nguyễn Văn A</p>
  <p>Số tiền: 20,000đ</p>

  <label>Lý do miễn phạt <span class="required">*</span></label>
  <textarea 
    id="waiveReason" 
    minlength="10" 
    placeholder="Ví dụ: Nhân viên đi công tác, có giấy xác nhận..."
  ></textarea>
  <span id="charCount">0 / tối thiểu 10 ký tự</span>

  <button id="confirmWaive" disabled>Xác nhận miễn phạt</button>
  <button id="cancelWaive">Hủy</button>
</dialog>

<script>
const textarea = document.getElementById('waiveReason');
const btn = document.getElementById('confirmWaive');
const count = document.getElementById('charCount');

textarea.addEventListener('input', () => {
  const len = textarea.value.trim().length;
  count.textContent = `${len} / tối thiểu 10 ký tự`;
  btn.disabled = len < 10;
});
</script>
```

#### 2.4 API (Supabase Edge Function hoặc RPC)

```sql
-- RPC: waive_penalty
CREATE OR REPLACE FUNCTION waive_penalty(
  p_ticket_id UUID,
  p_reason TEXT,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket RECORD;
  v_result JSONB;
BEGIN
  -- Lock row để tránh race condition
  SELECT * INTO v_ticket 
  FROM penalty_tickets 
  WHERE id = p_ticket_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ticket not found');
  END IF;

  IF v_ticket.status != 'UNPAID' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ticket is not UNPAID');
  END IF;

  IF LENGTH(TRIM(p_reason)) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reason must be at least 10 characters');
  END IF;

  -- Update ticket
  UPDATE penalty_tickets
  SET status = 'WAIVED', 
      waived_at = NOW(), 
      waived_reason = TRIM(p_reason),
      updated_at = NOW()
  WHERE id = p_ticket_id;

  -- Audit log
  INSERT INTO audit_logs (
    actor_id, action, target_type, target_id,
    old_value, new_value, reason, ip_address, created_at
  ) VALUES (
    p_actor_id,
    'WAIVE_PENALTY',
    'PENALTY_TICKET',
    p_ticket_id,
    jsonb_build_object('status', v_ticket.status),
    jsonb_build_object('status', 'WAIVED'),
    TRIM(p_reason),
    NULL, -- ip lấy từ request nếu có
    NOW()
  );

  -- Ghi system log
  INSERT INTO system_logs (level, category, message, user_id, created_at)
  VALUES ('INFO', 'PENALTY', 'Penalty waived: ' || p_ticket_id, p_actor_id, NOW());

  RETURN jsonb_build_object('success', true);
END;
$$;
```

> **Hint thay thế:** Nếu dùng Node.js + MongoDB: dùng `findOneAndUpdate` với `status: 'UNPAID'` làm filter (atomic), sau đó insert `auditLog` document. Nếu dùng Firebase: dùng `runTransaction` để đọc phiếu, kiểm tra `status`, update, ghi audit cùng lúc.

#### 2.5 Không tạo transaction quỹ

- Miễn phạt = **không có tiền vào** → không insert `fund_transactions`.
- Quỹ công ty không thay đổi.

---

### 3. Thu tiền mặt (Cash Payment)

#### 3.1 Flow

```
Manager chọn phiếu UNPAID → Bấm "Thu tiền mặt"
    ↓
Popup:
  - Hiển thị số tiền cần thu (20,000đ)
  - Checkbox "Đã nhận đủ tiền mặt" (bắt buộc tick)
  - Input "Người thu" (mặc định tên manager, có thể sửa)
  - Textarea "Ghi chú" (tùy chọn)
  - Nút "Xác nhận" DISABLED nếu chưa tick checkbox
    ↓
Manager tick + bấm xác nhận
    ↓
Gọi API → Backend:
  1. Kiểm tra phiếu còn UNPAID
  2. UPDATE status = 'CASH_PAID', paid_at = NOW()
  3. INSERT fund_transactions (source = 'PENALTY_CASH', type = 'INCOME')
  4. INSERT audit_log: action = 'CASH_PAYMENT'
  5. Gửi thông báo cho user
    ↓
Supabase Realtime push UPDATE về PWA user
    ↓
Phiếu chuyển sang trạng thái CASH_PAID
```

#### 3.2 UI — Popup thu tiền mặt

```html
<dialog id="cashModal">
  <h3>Thu tiền mặt — Phiếu P-xxx</h3>
  <p>Nhân viên: Nguyễn Văn A</p>
  <p class="amount">Số tiền: <strong>20,000đ</strong></p>

  <label>
    <input type="checkbox" id="cashConfirm" required>
    Đã nhận đủ tiền mặt <span class="required">*</span>
  </label>

  <label>Người thu</label>
  <input type="text" id="cashCollector" value="Nguyễn Văn B (Manager)" />

  <label>Ghi chú</label>
  <textarea id="cashNote" placeholder="Tùy chọn..."></textarea>

  <button id="confirmCash" disabled>Xác nhận đã thu</button>
  <button id="cancelCash">Hủy</button>
</dialog>

<script>
const checkbox = document.getElementById('cashConfirm');
const btn = document.getElementById('confirmCash');
checkbox.addEventListener('change', () => {
  btn.disabled = !checkbox.checked;
});
</script>
```

#### 3.3 API (RPC)

```sql
CREATE OR REPLACE FUNCTION cash_payment(
  p_ticket_id UUID,
  p_collector VARCHAR(100),
  p_note TEXT,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket RECORD;
BEGIN
  SELECT * INTO v_ticket 
  FROM penalty_tickets 
  WHERE id = p_ticket_id 
  FOR UPDATE;

  IF NOT FOUND OR v_ticket.status != 'UNPAID' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ticket not found or not UNPAID');
  END IF;

  -- Update ticket
  UPDATE penalty_tickets
  SET status = 'CASH_PAID', 
      paid_at = NOW(), 
      updated_at = NOW()
  WHERE id = p_ticket_id;

  -- Tạo transaction quỹ (có tiền vào)
  INSERT INTO fund_transactions (
    type, source, amount, ticket_id, branch, 
    description, collector_name, created_at
  ) VALUES (
    'INCOME',
    'PENALTY_CASH',
    v_ticket.amount,
    p_ticket_id,
    v_ticket.branch_code,
    COALESCE(p_note, 'Thu tiền mặt phiếu phạt'),
    p_collector,
    NOW()
  );

  -- Audit log
  INSERT INTO audit_logs (
    actor_id, action, target_type, target_id,
    old_value, new_value, reason, created_at
  ) VALUES (
    p_actor_id,
    'CASH_PAYMENT',
    'PENALTY_TICKET',
    p_ticket_id,
    jsonb_build_object('status', 'UNPAID'),
    jsonb_build_object('status', 'CASH_PAID', 'collector', p_collector, 'note', p_note),
    'Cash payment collected by ' || p_collector,
    NOW()
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
```

> **Hint thay thế:** Nếu dùng Node.js: wrap trong `BEGIN ... COMMIT` transaction. Nếu dùng Firebase: dùng `runTransaction` để update phiếu + tạo fund transaction document + audit log document cùng lúc.

---

### 4. Audit Trail

#### 4.1 Bảng `audit_logs`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | |
| `actor_id` | UUID | FK → users, nullable | NULL = system action (webhook) |
| `action` | VARCHAR(50) | NOT NULL | `WAIVE_PENALTY`, `CASH_PAYMENT`, `PENALTY_PAID`, `REJECT_CHECKIN`, ... |
| `target_type` | VARCHAR(50) | NOT NULL | `PENALTY_TICKET`, `CHECKIN`, `LEAVE_REQUEST`, `CONFIG` |
| `target_id` | UUID | NOT NULL | ID của entity bị tác động |
| `old_value` | JSONB | nullable | Trạng thái trước khi thay đổi |
| `new_value` | JSONB | nullable | Trạng thái sau khi thay đổi |
| `reason` | TEXT | nullable | Lý do nhập từ UI (bắt buộc với certain actions) |
| `ip_address` | INET | nullable | IP của actor |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

#### 4.2 Nguyên tắc

- **Append-only**: Không xóa, không sửa record audit.
- **Diff rõ ràng**: `old_value` và `new_value` là JSONB, lưu đầy đủ field thay đổi.
- **Mandatory reason**: 7 action bắt buộc nhập lý do từ UI:
  1. `WAIVE_PENALTY`
  2. `REJECT_CHECKIN`
  3. `OVERRIDE_CHECKIN`
  4. `REJECT_LEAVE`
  5. `CASH_PAYMENT`
  6. `CREATE_MANUAL_PENALTY`
  7. `UPDATE_CONFIG`
  8. `FUND_WITHDRAW`

#### 4.3 Màn hình xem Audit (Admin)

```
Tab "Audit Log"
    ↓
Filter: Action, Target type, Actor, Date range
    ↓
Table:
  | Thời gian | Actor | Action | Target | Thay đổi | Lý do |
    ↓
Click row → Popup chi tiết:
  - Old value (đỏ, gạch ngang)
  - New value (xanh)
  - Diff view (chỉ highlight field thay đổi)
  - Nút Export CSV
```

#### 4.4 API

```sql
-- Lấy audit log với filter
SELECT 
  al.*,
  actor.full_name as actor_name
FROM audit_logs al
LEFT JOIN users actor ON al.actor_id = actor.id
WHERE 
  al.action = 'WAIVE_PENALTY'
  AND al.target_type = 'PENALTY_TICKET'
  AND al.created_at BETWEEN '2026-08-01' AND '2026-08-31'
ORDER BY al.created_at DESC
LIMIT 100;

-- Lấy audit của 1 phiếu cụ thể
SELECT * FROM audit_logs 
WHERE target_type = 'PENALTY_TICKET' AND target_id = '<ticket_id>'
ORDER BY created_at DESC;
```

> **Hint thay thế:** Nếu dùng MongoDB: collection `auditLogs`, index compound trên `(targetType, targetId, createdAt)`. Nếu dùng Firebase: subcollection `entities/{id}/auditLogs` hoặc root collection `auditLogs` với query `where('targetId', '==', id)`.

---

### 5. Thông báo (Notification)

#### 5.1 Khi phiếu bị miễn

**User nhận:**
- In-app: *"Phiếu phạt P-xxx (20,000đ) đã được miễn. Lý do: [reason]"*
- Push (nếu bật): same message

#### 5.2 Khi phiếu được thu tiền mặt

**User nhận:**
- In-app: *"Phiếu phạt P-xxx (20,000đ) đã được thanh toán bằng tiền mặt. Người thu: [collector]"*

#### 5.3 Cách gửi (Supabase)

Dùng **Supabase Realtime Broadcast** (không cần qua DB):

```javascript
// Trong Edge Function / RPC, sau khi update xong:
await supabase.channel('notifications')
  .send({
    type: 'broadcast',
    event: 'penalty_update',
    payload: {
      user_id: ticket.user_id,
      ticket_id: ticket.id,
      status: 'WAIVED', // or 'CASH_PAID'
      message: 'Phiếu phạt P-xxx đã được miễn...',
      reason: reason
    }
  });

// PWA user subscribe:
supabase.channel('notifications')
  .on('broadcast', { event: 'penalty_update' }, (payload) => {
    if (payload.user_id === currentUserId) {
      showToast(payload.message);
      // Refresh list
    }
  })
  .subscribe();
```

> **Hint thay thế:** Nếu dùng Node.js + Socket.io: `io.to(`user_${userId}`).emit('penalty_update', {...})`. Nếu dùng Firebase: dùng Cloud Messaging (FCM) để gửi push, hoặc Firestore listener trên collection `notifications`.

---

### 6. Test Case (Part 3)

| ID | Mô tả | Input | Expected |
|----|-------|-------|----------|
| **P2-26** | Miễn phạt thành công | Phiếu UNPAID, lý do "Nhân viên đi công tác có giấy xác nhận" (25 ký tự) | `status = WAIVED`, audit log ghi diff, user nhận noti |
| **P2-27** | Miễn phạt thiếu lý do | Lý do "Đi công tác" (9 ký tự) | Block ở UI + API return lỗi "Reason must be at least 10 characters" |
| **P2-28** | Miễn phạt phiếu đã PAID | Phiếu status = PAID | API return lỗi "Ticket is not UNPAID", không thay đổi DB |
| **P2-29** | Miễn phạt phiếu đã CASH_PAID | Phiếu status = CASH_PAID | API return lỗi "Ticket is not UNPAID" |
| **P2-30** | Miễn phạt phiếu đã WAIVED | Phiếu status = WAIVED | API return lỗi "Ticket is not UNPAID" |
| **P2-31** | Thu tiền mặt thành công | Phiếu UNPAID, tick checkbox, collector = "Nguyễn Văn B" | `status = CASH_PAID`, `fund_transactions` +1 record (source=PENALTY_CASH), audit log ghi, user nhận noti |
| **P2-32** | Thu tiền mặt chưa tick checkbox | Chưa tick "Đã nhận đủ" | UI block nút submit, không gọi API |
| **P2-33** | Thu tiền mặt phiếu đã PAID | Phiếu status = PAID | API return lỗi, không thay đổi |
| **P2-34** | Xem audit log của phiếu | Query audit_logs where target_id = ticket_id | Trả về đầy đủ: WAIVE, CASH, PAYMENT events với old/new value |
| **P2-35** | Audit log diff chính xác | Waive 1 phiếu | old_value = {"status": "UNPAID"}, new_value = {"status": "WAIVED"} |
| **P2-36** | Filter danh sách theo ngày | Chọn 2026-08-25 | Chỉ hiển thị phiếu created_at trong ngày đó |
| **P2-37** | Filter theo trạng thái | Chọn UNPAID | Chỉ hiển thị phiếu UNPAID |
| **P2-38** | Filter theo chi nhánh | Chọn HN | Chỉ hiển thị phiếu branch_code = 'HN' |
| **P2-39** | Race condition — 2 manager cùng waive | Manager A và B cùng bấm miễn 1 phiếu | Chỉ 1 thành công (nhờ `FOR UPDATE` + `status = UNPAID`), cái còn lại lỗi |
| **P2-40** | Realtime push khi manager waive | Manager waive phiếu của User X | PWA User X nhận event ngay lập tức, phiếu chuyển WAIVED |

---

### 7. Tóm tắt kiến trúc Part 3

```
Manager (PWA Admin)
    │
    ├── Danh sách phiếu (filter ngày, status, branch, user)
    │       └── Supabase query + RLS
    │
    ├── Miễn phạt (WAIVED)
    │       ├── Popup: textarea + min 10 chars + disabled submit
    │       ├── RPC: waive_penalty()
    │       │       ├── FOR UPDATE (lock row)
    │       │       ├── UPDATE penalty_tickets → WAIVED
    │       │       ├── INSERT audit_logs (diff old/new)
    │       │       └── INSERT system_logs
    │       └── Realtime broadcast → User PWA
    │
    └── Thu tiền mặt (CASH_PAID)
            ├── Popup: checkbox "Đã nhận đủ" + collector + note
            ├── RPC: cash_payment()
            │       ├── FOR UPDATE
            │       ├── UPDATE penalty_tickets → CASH_PAID
            │       ├── INSERT fund_transactions (PENALTY_CASH)
            │       ├── INSERT audit_logs
            │       └── INSERT system_logs
            └── Realtime broadcast → User PWA

Audit Trail (Admin Panel)
    └── Query audit_logs: filter action, target, actor, date
        └── Diff view: old_value vs new_value (JSONB)
```

---

> **Part 4:** Quỹ công ty (Read-only) — balance hiện tại, transaction list + filter, không CRUD quỹ từ app. Thông báo biến động số dư real-time cho quản lý.


## Part 4: Quỹ công ty (Read-only) & Thông báo biến động số dư

> **Techstack:** Supabase (PostgreSQL, Realtime, RLS) 
> **Nguyên tắc:** Quỹ chỉ READ — không CRUD từ app. Balance tính từ `fund_transactions`. Thông báo real-time cho quản lý.

---

### 1. Data Model

#### 1.1 `fund_transactions` (đã tạo từ Part 2 & 3)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | |
| `type` | VARCHAR(20) | NOT NULL | `INCOME` / `EXPENSE` |
| `source` | VARCHAR(50) | NOT NULL | `PENALTY` (Sepay) / `PENALTY_CASH` (tiền mặt) / `MANUAL` / `WITHDRAW` |
| `amount` | BIGINT | NOT NULL | Đơn vị VNĐ, luôn dương |
| `ticket_id` | UUID | FK → penalty_tickets, nullable | Liên kết phiếu phạt |
| `branch` | VARCHAR(10) | nullable | `HN`, `HCM`, `DN` — từ `subAccount` hoặc `branch_code` |
| `description` | TEXT | nullable | Nội dung CK hoặc ghi chú |
| `reference_code` | VARCHAR(100) | nullable | Mã tham chiếu Sepay |
| `collector_name` | VARCHAR(100) | nullable | Người thu tiền mặt |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

> **Lưu ý:** Không có cột `balance` trong bảng này. Balance được tính runtime bằng `SUM(CASE WHEN type='INCOME' THEN amount ELSE -amount END)`.

#### 1.2 `fund_balance_view` (Materialized View hoặc computed)

```sql
-- View để tính balance theo branch
CREATE OR REPLACE VIEW fund_balance_by_branch AS
SELECT 
  COALESCE(branch, 'ALL') as branch,
  SUM(CASE WHEN type = 'INCOME' THEN amount ELSE -amount END) as balance,
  COUNT(*) as total_transactions,
  SUM(CASE WHEN type = 'INCOME' THEN 1 ELSE 0 END) as income_count,
  SUM(CASE WHEN type = 'EXPENSE' THEN 1 ELSE 0 END) as expense_count
FROM fund_transactions
GROUP BY branch;

-- Tổng toàn bộ quỹ
CREATE OR REPLACE VIEW fund_balance_total AS
SELECT 
  SUM(CASE WHEN type = 'INCOME' THEN amount ELSE -amount END) as total_balance,
  COUNT(*) as total_transactions
FROM fund_transactions;
```

> **Hint thay thế:** Nếu dùng MongoDB: dùng `aggregate` với `$group` và `$sum` ( `$cond` ). Nếu dùng Firebase: không có view, tính client-side hoặc dùng Cloud Function để cập nhật 1 document `fundSummary` mỗi khi có transaction mới (denormalized).

---

### 2. Quỹ công ty — Màn hình Read-only

#### 2.1 Tổng quan (Dashboard card)

```
┌─────────────────────────────────────────┐
│  💰 Quỹ công ty                         │
│                                         │
│  Tổng số dư:        2,450,000đ          │
│  Tổng giao dịch:    124                 │
│  Thu nhập:          2,500,000đ (120)    │
│  Chi tiêu:          50,000đ (4)         │
│                                         │
│  [Xem chi tiết]  [Export CSV]           │
└─────────────────────────────────────────┘
```

#### 2.2 Danh sách giao dịch

```
Filter bar:
  - Ngày: Date range picker
  - Loại: Tất cả / INCOME / EXPENSE
  - Nguồn: Tất cả / PENALTY / PENALTY_CASH / MANUAL / WITHDRAW
  - Chi nhánh: Tất cả / HN / HCM / DN
  - Tìm kiếm: Mô tả, reference code

Table:
  | Thời gian | Loại | Nguồn | Số tiền | Chi nhánh | Mô tả | Liên kết |

  Ví dụ:
  | 25/08 09:15 | INCOME | PENALTY | +20,000đ | HN | SEVQR TKPHN A7B3C9D2... | P-xxx |
  | 25/08 08:30 | INCOME | PENALTY_CASH | +20,000đ | — | Thu tiền mặt phiếu phạt | P-yyy |
```

#### 2.3 API (Supabase)

```sql
-- Lấy tổng balance
SELECT * FROM fund_balance_total;

-- Lấy balance theo chi nhánh
SELECT * FROM fund_balance_by_branch;

-- Lấy danh sách transaction với filter
SELECT 
  ft.*,
  pt.transaction_id as penalty_code,
  u.full_name as user_name
FROM fund_transactions ft
LEFT JOIN penalty_tickets pt ON ft.ticket_id = pt.id
LEFT JOIN users u ON pt.user_id = u.id
WHERE 
  ft.created_at BETWEEN '2026-08-01' AND '2026-08-31'
  AND ft.type = 'INCOME'
  AND ft.source = 'PENALTY'
  AND ft.branch = 'HN'
  AND (ft.description ILIKE '%SEVQR%' OR ft.reference_code ILIKE '%...%')
ORDER BY ft.created_at DESC
LIMIT 50 OFFSET 0;
```

#### 2.4 RLS Policy

```sql
-- Chỉ manager và admin được xem quỹ
CREATE POLICY "Manager can view fund transactions"
ON fund_transactions FOR SELECT
USING (auth.jwt() ->> 'role' IN ('manager', 'admin'));

-- User thường KHÔNG được xem
CREATE POLICY "User cannot view fund"
ON fund_transactions FOR SELECT
USING (false);
```

> **Hint thay thế:** Nếu dùng Node.js/Express: middleware `requireRole(['manager', 'admin'])` trước khi query. Nếu dùng Firebase: dùng Firestore security rules `allow read: if request.auth.token.role in ['manager', 'admin']`.

---

### 3. Thông báo biến động số dư (Manager Real-time)

#### 3.1 Khi nào gửi?

| Sự kiện | Thông báo |
|---------|-----------|
| Webhook Sepay thành công | "+20,000đ vào quỹ — Nguyễn Văn A thanh toán phiếu P-xxx" |
| Thu tiền mặt thành công | "+20,000đ vào quỹ — Nguyễn Văn A thu tiền mặt phiếu P-xxx" |
| (Sau này Phase 4) Chi tiêu quỹ | "-50,000đ từ quỹ — Mua văn phòng phẩm" |

#### 3.2 Cách gửi — Supabase Realtime Broadcast

```javascript
// Trong Edge Function (sau khi process_payment hoặc cash_payment thành công)
await supabase.channel('fund-notifications')
  .send({
    type: 'broadcast',
    event: 'fund_income',
    payload: {
      amount: 20000,
      type: 'INCOME',
      source: 'PENALTY', // or 'PENALTY_CASH'
      user_name: 'Nguyễn Văn A',
      ticket_code: 'P-xxx',
      branch: 'HN',
      new_balance: 2450000, // tính từ view
      timestamp: new Date().toISOString()
    }
  });

// Manager PWA subscribe:
const fundChannel = supabase.channel('fund-notifications')
  .on('broadcast', { event: 'fund_income' }, (payload) => {
    // Hiển thị toast
    showToast({
      type: 'success',
      title: `+${formatMoney(payload.amount)}đ vào quỹ`,
      message: `${payload.user_name} — ${payload.ticket_code}`,
      duration: 5000
    });

    // Tự động refresh dashboard
    refreshFundDashboard();

    // Play sound (nếu bật)
    if (settings.soundEnabled) playNotificationSound();
  })
  .subscribe();
```

#### 3.3 UI — Toast notification

```css
.toast-fund {
  position: fixed;
  top: 20px;
  right: 20px;
  background: #10b981; /* xanh lá */
  color: white;
  padding: 16px 20px;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.15);
  animation: slideIn 0.3s ease;
  z-index: 9999;
}

.toast-fund .amount {
  font-size: 18px;
  font-weight: 700;
}

.toast-fund .detail {
  font-size: 14px;
  opacity: 0.9;
  margin-top: 4px;
}
```

```html
<div class="toast-fund" id="fundToast">
  <div class="amount">+20,000đ vào quỹ</div>
  <div class="detail">Nguyễn Văn A — P-xxx (HN)</div>
  <div class="time">09:15:32</div>
</div>
```

#### 3.4 Dashboard auto-refresh

Khi nhận broadcast event:

```javascript
function refreshFundDashboard() {
  // Re-query balance
  const { data: balance } = await supabase
    .from('fund_balance_total')
    .select('*')
    .single();

  // Re-query recent transactions
  const { data: recent } = await supabase
    .from('fund_transactions')
    .select('*, penalty_tickets(transaction_id), users(full_name)')
    .order('created_at', { ascending: false })
    .limit(10);

  // Update UI
  updateBalanceCard(balance);
  updateTransactionTable(recent);
}
```

> **Hint thay thế:** Nếu dùng Node.js + Socket.io: `io.to('room_managers').emit('fund_income', {...})`. Nếu dùng Firebase: dùng FCM topic `managers` để push, hoặc Firestore listener trên `fundNotifications` collection.

---

### 4. Export & Đối soát

#### 4.1 Export CSV

```javascript
// PWA: fetch data rồi generate CSV client-side
function exportFundCSV(transactions) {
  const headers = ['Thời gian', 'Loại', 'Nguồn', 'Số tiền', 'Chi nhánh', 'Mô tả', 'Người liên quan'];
  const rows = transactions.map(t => [
    formatDate(t.created_at),
    t.type,
    t.source,
    t.amount,
    t.branch || '-',
    t.description,
    t.penalty_tickets?.users?.full_name || '-'
  ]);

  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  downloadBlob(csv, `fund-export-${today()}.csv`, 'text/csv');
}
```

#### 4.2 Đối soát với Sepay

Manager có thể so sánh:
- `fund_transactions` (app) vs `sepay_webhook_logs` (raw payload)
- `unmatched_transactions` để xem các giao dịch lạc

```sql
-- Đối soát: tìm webhook chưa khớp với fund_transactions
SELECT 
  swl.sepay_id,
  swl.payload->>'content' as content,
  swl.payload->>'transferAmount' as amount,
  swl.processed_at
FROM sepay_webhook_logs swl
LEFT JOIN fund_transactions ft ON ft.reference_code = swl.payload->>'referenceCode'
WHERE ft.id IS NULL
  AND swl.processed_at > '2026-08-01';
```

---

### 5. Test Case (Part 4)

| ID | Mô tả | Input | Expected |
|----|-------|-------|----------|
| **P2-41** | Xem tổng số dư quỹ | Query `fund_balance_total` | Trả về đúng `SUM(income) - SUM(expense)` |
| **P2-42** | Xem balance theo chi nhánh | Query `fund_balance_by_branch` | HN: +500k, HCM: +300k, Tổng: +800k |
| **P2-43** | Filter transaction theo ngày | Chọn 25/08 | Chỉ hiển thị giao dịch ngày 25/08 |
| **P2-44** | Filter transaction theo nguồn | Chọn `PENALTY_CASH` | Chỉ hiển thị thu tiền mặt |
| **P2-45** | User thường xem quỹ | User role = 'staff' query `fund_transactions` | RLS block, trả về empty / 403 |
| **P2-46** | Manager xem quỹ | User role = 'manager' | Trả về đầy đủ data |
| **P2-47** | Realtime toast khi webhook về | Sepay webhook PAID 20k | Manager PWA hiện toast "+20,000đ vào quỹ" trong 100ms |
| **P2-48** | Realtime toast khi cash payment | Manager thu tiền mặt 20k | Manager PWA hiện toast "+20,000đ vào quỹ" |
| **P2-49** | Dashboard auto-refresh | Nhận broadcast event | Balance card + transaction table tự động cập nhật |
| **P2-50** | Export CSV | 50 transactions | File CSV tải về đúng format, đủ cột |
| **P2-51** | Đối soát unmatched | Query `sepay_webhook_logs` left join `fund_transactions` | Liệt kê webhook chưa khớp |
| **P2-52** | Transaction liên kết phiếu | Click row trong quỹ | Navigate đến chi tiết phiếu phạt P-xxx |

---

### 6. Tóm tắt kiến trúc Part 4

```
┌─────────────────────────────────────────────┐
│           Quỹ công ty (Read-only)            │
├─────────────────────────────────────────────┤
│                                             │
│  Dashboard:                                 │
│    ├─ fund_balance_total (VIEW)             │
│    └─ fund_balance_by_branch (VIEW)         │
│                                             │
│  Transaction List:                          │
│    ├─ fund_transactions (bảng chính)        │
│    ├─ Filter: date, type, source, branch    │
│    ├─ Search: description, reference        │
│    └─ JOIN penalty_tickets + users          │
│                                             │
│  Real-time Notifications:                   │
│    ├─ Supabase Broadcast channel            │
│    │   'fund-notifications'                 │
│    ├─ Event: 'fund_income'                  │
│    └─ Manager PWA: toast + auto-refresh     │
│                                             │
│  Export: CSV client-side                    │
│  Đối soát: unmatched_transactions           │
│                                             │
└─────────────────────────────────────────────┘
```

---

> **Part 5:** Logging & Observability toàn app — System Log, Audit Log, Business Timeline, Client Log, Log Monitor Dashboard. Data Model tổng hợp + API Endpoints + Test Case tổng hợp Phase 2.

## Part 5: Logging & Observability + Data Model tổng hợp + API Endpoints

> **Techstack:** Supabase (PostgreSQL, Edge Functions, Realtime, RLS, Storage) 
> **Nguyên tắc:** Mọi thao tác có ảnh hưởng đến tiền, dữ liệu nhân viên, hoặc cấu hình → để lại dấu vết. Travel time: 6 tháng sau vẫn biết "Ai làm gì, lúc nào, tại sao, từ đâu".

---

### 1. Hệ thống Logging — 4 loại

#### 1.1 System Log (Auto — Technical)

**Mục đích:** Theo dõi kỹ thuật, trace bug, monitor health.

**Tự động ghi khi:**
- Mọi API request (method, path, status, duration, user_id, ip)
- Background job chạy / fail
- Webhook nhận / xử lý / lỗi
- GPS response từ device
- Database error / timeout

**Bảng `system_logs`:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `level` | VARCHAR(10) | `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL` |
| `category` | VARCHAR(50) | `API`, `WEBHOOK`, `GPS`, `SYNC`, `DB`, `AUTH` |
| `message` | TEXT | Nội dung lỗi / thông tin |
| `metadata` | JSONB | Request path, status, duration, stack trace, payload snippet |
| `user_id` | UUID | nullable |
| `ip_address` | INET | nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |

**Ví dụ record:**
```json
{
  "level": "ERROR",
  "category": "WEBHOOK",
  "message": "Sepay webhook HMAC verification failed",
  "metadata": {
    "path": "/functions/v1/sepay-webhook",
    "signature": "sha256=abc...",
    "timestamp": 1724550000,
    "body_length": 342
  },
  "ip_address": "203.0.113.45",
  "created_at": "2026-08-25T09:15:32+07:00"
}
```

> **Hint thay thế:** Nếu dùng Node.js: dùng thư viện `winston` hoặc `pino` ghi ra file/stdout, hoặc gửi lên Sentry / Datadog / Logtail. Nếu dùng Firebase: dùng Cloud Logging (tích hợp sẵn với Cloud Functions).

---

#### 1.2 Audit Log (Auto + Mandatory Reason)

**Đã định nghĩa ở Part 3.** Tóm tắt lại:

**8 action bắt buộc nhập lý do từ UI:**
1. `WAIVE_PENALTY` — Miễn phạt
2. `REJECT_CHECKIN` — Từ chối check-in
3. `OVERRIDE_CHECKIN` — Ghi đè check-in
4. `REJECT_LEAVE` — Từ chối đơn nghỉ phép
5. `CASH_PAYMENT` — Thu tiền mặt
6. `CREATE_MANUAL_PENALTY` — Tạo phiếu phạt thủ công
7. `UPDATE_CONFIG` — Cập nhật cấu hình hệ thống
8. `FUND_WITHDRAW` — Rút tiền từ quỹ (Phase 4)

**UI bắt buộc:**
```
Textarea "Lý do *" (min 10 ký tự)
  ↓
Nút "Xác nhận" DISABLED nếu chưa đủ
  ↓
Gọi API → nếu thiếu lý do → 400 Bad Request
```

---

#### 1.3 Business Event Log / Travel Time (Timeline)

**Mục đích:** Vẽ dòng thời gian của mỗi entity. Biết chính xác user đã trải qua những bước nào.

**Bảng `event_timelines`:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `entity_type` | VARCHAR(50) | `CHECKIN`, `PENALTY_TICKET`, `LEAVE_REQUEST` |
| `entity_id` | UUID | ID của entity |
| `event` | VARCHAR(50) | Tên sự kiện |
| `actor_id` | UUID | nullable — NULL = system |
| `metadata` | JSONB | Context thêm (GPS coords, device info, v.v.) |
| `created_at` | TIMESTAMPTZ | |

**Ví dụ timeline 1 phiếu phạt:**

| Thời gian | Entity | Event | Actor | Metadata |
|-----------|--------|-------|-------|----------|
| 09:00:05 | CHECKIN | `APP_OPENED` | User#123 | `{app_version: "1.2.0"}` |
| 09:00:08 | CHECKIN | `GPS_ATTEMPT` | User#123 | `{lat: 21.0285, lng: 105.8542, accuracy: 12}` |
| 09:00:10 | CHECKIN | `GPS_OUT_OF_RANGE` | User#123 | `{distance: 850, office_radius: 500}` |
| 09:00:15 | CHECKIN | `TABLET_QR_SCANNED` | User#123 | `{tablet_id: "TBL-HN-01"}` |
| 09:00:18 | CHECKIN | `VALIDATED` | System | `{method: "TABLET"}` |
| 09:00:20 | PENALTY | `PENALTY_CREATED` | System | `{type: "LATE_CHECKIN", amount: 20000}` |
| 09:05:30 | PENALTY | `PAYMENT_QR_GENERATED` | User#123 | `{tx_id: "A7B3C9D2"}` |
| 09:06:15 | PENALTY | `SEPAY_WEBHOOK_RECEIVED` | System | `{sepay_id: 123456, amount: 20000}` |
| 09:06:16 | PENALTY | `PENALTY_PAID` | System | `{method: "SEPAY"}` |

**Insert tự động:**
- Trong Edge Function / RPC, sau mỗi bước quan trọng:
```sql
INSERT INTO event_timelines (entity_type, entity_id, event, actor_id, metadata)
VALUES ('PENALTY_TICKET', p_ticket_id, 'PAYMENT_QR_GENERATED', p_user_id, jsonb_build_object('tx_id', p_tx_id));
```

> **Hint thay thế:** Nếu dùng MongoDB: collection `eventTimelines`, index `(entityType, entityId, createdAt)`. Nếu dùng Firebase: subcollection `entities/{id}/timeline` hoặc root collection với query. Nếu dùng event-driven (Kafka/RabbitMQ): publish event `penalty.qr_generated` và consumer ghi vào DB.

---

#### 1.4 Client Log (PWA Errors)

**Mục đích:** Biết lỗi xảy ra ở client (browser) để debug.

**Bảng `client_logs`:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | |
| `category` | VARCHAR(50) | `GPS`, `CAMERA`, `NETWORK`, `SYNC`, `UI`, `CRASH` |
| `event` | VARCHAR(50) | `timeout`, `denied`, `failed`, `error`, `slow` |
| `message` | TEXT | Chi tiết lỗi |
| `metadata` | JSONB | `{url, userAgent, screenSize, errorStack}` |
| `created_at` | TIMESTAMPTZ | |

**PWA gửi lỗi về server:**

```javascript
// 1. window.onerror — bắt mọi unhandled error
window.onerror = (msg, url, line, col, error) => {
  logClientEvent('CRASH', 'error', msg, { url, line, col, stack: error?.stack });
};

// 2. Bắt unhandled promise rejection
window.addEventListener('unhandledrejection', (e) => {
  logClientEvent('CRASH', 'unhandled_promise', e.reason, {});
});

// 3. Log sự kiện cụ thể
function logClientEvent(category, event, message, extra = {}) {
  fetch('/rest/v1/client_logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      category,
      event,
      message,
      metadata: {
        url: location.href,
        userAgent: navigator.userAgent,
        ...extra
      }
    }),
    keepalive: true // gửi ngay cả khi tab đóng
  }).catch(() => {}); // silent fail
}

// Ví dụ sử dụng:
// GPS timeout
logClientEvent('GPS', 'timeout', 'GPS lấy vị trí quá 10 giây', { timeout: 10000 });

// Camera denied
logClientEvent('CAMERA', 'denied', 'User từ chối quyền camera', {});

// Sync failed
logClientEvent('SYNC', 'failed', 'Không thể đồng bộ check-in khi offline', { retry_count: 3 });
```

> **Hint thay thế:** Nếu dùng Node.js: endpoint `POST /api/client-logs` nhận và lưu. Nếu dùng Sentry: `Sentry.captureException()` / `Sentry.captureMessage()` — không cần tự viết bảng. Nếu dùng Firebase: `firebase.analytics().logEvent('client_error', {...})`.

---

### 2. Log Monitor Dashboard

#### 2.1 System Health (Real-time)

```
┌─────────────────────────────────────────────────────┐
│  🖥️ System Health (last 1 hour)                     │
│                                                     │
│  Requests/min:     45        │████████████░░░░░░░░│ │
│  Error rate:       0.5%      │██░░░░░░░░░░░░░░░░░░│ ✅ │
│  P95 latency:      180ms     │████████░░░░░░░░░░░░│ │
│  Webhook success:  100%      │████████████████████│ ✅ │
│  GPS errors:       2         │██░░░░░░░░░░░░░░░░░░│ ✅ │
│                                                     │
│  [🔴 Alert] Webhook failed 3x liên tiếp!          │
└─────────────────────────────────────────────────────┘
```

**Tính toán từ `system_logs`:**

```sql
-- Request/min (last 1h)
SELECT 
  DATE_TRUNC('minute', created_at) as minute,
  COUNT(*) as req_count
FROM system_logs
WHERE category = 'API' AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY minute
ORDER BY minute DESC;

-- Error rate (last 1h)
SELECT 
  COUNT(*) FILTER (WHERE level IN ('ERROR', 'FATAL')) * 100.0 / COUNT(*) as error_rate
FROM system_logs
WHERE created_at > NOW() - INTERVAL '1 hour';

-- P95 latency
SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY (metadata->>'duration')::int)
FROM system_logs
WHERE category = 'API' AND created_at > NOW() - INTERVAL '1 hour';
```

#### 2.2 Log Viewer

```
Filter: Level [All ▼] | Category [All ▼] | User [Search] | Date range
─────────────────────────────────────────────────────────────
| Time     | Level | Category | Message              | User  |
| 09:15:32 | ERROR | WEBHOOK  | HMAC verify failed   | —     |
| 09:14:10 | WARN  | GPS      | Accuracy > 100m      | #123  |
| 09:12:05 | INFO  | API      | GET /penalty-tickets | #456  |
─────────────────────────────────────────────────────────────
[Real-time tail ▶] [Pause ⏸] [Export JSON]
```

**Real-time tail:** Dùng Supabase Realtime subscribe `system_logs` INSERT:

```javascript
supabase.channel('system-logs')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_logs' }, (payload) => {
    appendLogRow(payload.new);
  })
  .subscribe();
```

#### 2.3 Error Alert Rules

| Điều kiện | Hành động | Kênh |
|-----------|-----------|------|
| Error rate > 1% trong 5 phút | Gửi alert | Telegram / Slack webhook |
| Webhook fail 3x liên tiếp | Gửi alert + email admin | Email + Telegram |
| GPS error > 20% trong 1 giờ | Gửi warning | Telegram |
| API P95 latency > 2 giây | Gửi warning | Slack |
| `FATAL` log xuất hiện | Gửi alert ngay lập tức | Telegram + Phone call (nếu có) |

**Cách triển khai:**
- Supabase Edge Function chạy cron (hoặc dùng Supabase Cron extension) mỗi 5 phút query `system_logs`.
- Nếu vượt ngưỡng → gọi Telegram Bot API / Slack webhook.

```javascript
// Edge Function cron job (chạy mỗi 5 phút)
const { data: stats } = await supabase.rpc('check_alert_rules');
for (const alert of stats) {
  if (alert.triggered) {
    await fetch(TELEGRAM_WEBHOOK_URL, {
      method: 'POST',
      body: JSON.stringify({
        text: `🚨 ${alert.rule}: ${alert.message}\nTime: ${alert.window}`
      })
    });
  }
}
```

> **Hint thay thế:** Nếu dùng Node.js: dùng `node-cron` hoặc `bull` queue. Nếu dùng AWS: CloudWatch Alarms + SNS. Nếu dùng Firebase: Cloud Scheduler + Cloud Functions. Nếu dùng Sentry: cấu hình alert rules trực tiếp trên dashboard Sentry.

---

### 3. Data Model tổng hợp Phase 2

#### 3.1 Sơ đồ quan hệ (ERD tóm tắt)

```
users
  ├── id (PK)
  ├── full_name
  ├── email
  ├── role (staff/manager/admin)
  └── ...

payment_settings (1 row / branch)
  ├── id (PK)
  ├── branch_code (UNIQUE)
  ├── account_number
  ├── bank_code
  ├── account_holder
  ├── company_name
  ├── sepay_prefix
  ├── va_code
  └── ...

penalty_tickets
  ├── id (PK)
  ├── user_id (FK → users)
  ├── transaction_id (UNIQUE)
  ├── amount
  ├── status (UNPAID/PAID/WAIVED/CASH_PAID)
  ├── type
  ├── reason
  ├── sepay_content
  ├── paid_at
  ├── waived_at
  ├── waived_reason
  ├── branch_code
  └── ...

fund_transactions
  ├── id (PK)
  ├── type (INCOME/EXPENSE)
  ├── source (PENALTY/PENALTY_CASH/MANUAL/WITHDRAW)
  ├── amount
  ├── ticket_id (FK → penalty_tickets, nullable)
  ├── branch
  ├── description
  ├── reference_code
  ├── collector_name
  └── ...

sepay_webhook_logs
  ├── id (PK)
  ├── sepay_id (UNIQUE)
  ├── ticket_id (FK → penalty_tickets)
  ├── payload (JSONB)
  └── ...

unmatched_transactions
  ├── id (PK)
  ├── sepay_id
  ├── ticket_id (nullable)
  ├── transaction_id (nullable)
  ├── amount
  ├── expected_amount (nullable)
  ├── received_amount (nullable)
  ├── reason
  ├── resolved
  └── ...

audit_logs
  ├── id (PK)
  ├── actor_id (FK → users, nullable)
  ├── action
  ├── target_type
  ├── target_id
  ├── old_value (JSONB)
  ├── new_value (JSONB)
  ├── reason
  ├── ip_address
  └── ...

event_timelines
  ├── id (PK)
  ├── entity_type
  ├── entity_id
  ├── event
  ├── actor_id (FK → users, nullable)
  ├── metadata (JSONB)
  └── ...

system_logs
  ├── id (PK)
  ├── level
  ├── category
  ├── message
  ├── metadata (JSONB)
  ├── user_id (FK → users, nullable)
  ├── ip_address
  └── ...

client_logs
  ├── id (PK)
  ├── user_id (FK → users)
  ├── category
  ├── event
  ├── message
  ├── metadata (JSONB)
  └── ...
```

#### 3.2 Index quan trọng

```sql
-- Performance
CREATE INDEX idx_penalty_tickets_status ON penalty_tickets(status);
CREATE INDEX idx_penalty_tickets_user_id ON penalty_tickets(user_id);
CREATE INDEX idx_penalty_tickets_created_at ON penalty_tickets(created_at);
CREATE INDEX idx_penalty_tickets_branch ON penalty_tickets(branch_code);
CREATE INDEX idx_fund_transactions_created_at ON fund_transactions(created_at);
CREATE INDEX idx_fund_transactions_source ON fund_transactions(source);
CREATE INDEX idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_system_logs_level ON system_logs(level);
CREATE INDEX idx_system_logs_category ON system_logs(category);
CREATE INDEX idx_event_timelines_entity ON event_timelines(entity_type, entity_id);
CREATE INDEX idx_sepay_webhook_logs_sepay_id ON sepay_webhook_logs(sepay_id);

-- Unique
CREATE UNIQUE INDEX idx_penalty_tickets_tx_id ON penalty_tickets(transaction_id);
```

> **Hint thay thế:** Nếu dùng MongoDB: `createIndex()` với compound index. Nếu dùng Firebase: tự động index trên field dùng trong `where` + `orderBy` (cần tạo composite index trên console nếu query phức tạp).

---

### 4. API Endpoints tổng hợp Phase 2

#### 4.1 REST (qua Supabase PostgREST)

| Method | Path | Mô tả | Auth |
|--------|------|-------|------|
| `GET` | `/rest/v1/payment_settings` | Lấy cấu hình thanh toán | Manager |
| `POST` | `/rest/v1/payment_settings` | Tạo cấu hình mới | Manager |
| `PATCH` | `/rest/v1/payment_settings?id=eq.{id}` | Cập nhật cấu hình | Manager |
| `GET` | `/rest/v1/penalty_tickets` | Danh sách phiếu (filter: status, user_id, date, branch) | Manager / Owner |
| `GET` | `/rest/v1/penalty_tickets?id=eq.{id}` | Chi tiết 1 phiếu | Manager / Owner |
| `POST` | `/rest/v1/rpc/waive_penalty` | Miễn phạt | Manager |
| `POST` | `/rest/v1/rpc/cash_payment` | Thu tiền mặt | Manager |
| `GET` | `/rest/v1/fund_transactions` | Danh sách giao dịch quỹ | Manager |
| `GET` | `/rest/v1/fund_balance_total` | Tổng số dư quỹ | Manager |
| `GET` | `/rest/v1/fund_balance_by_branch` | Số dư theo chi nhánh | Manager |
| `GET` | `/rest/v1/audit_logs` | Audit trail (filter: action, target, actor, date) | Manager / Admin |
| `GET` | `/rest/v1/system_logs` | System logs | Admin |
| `GET` | `/rest/v1/event_timelines` | Timeline (filter: entity_type, entity_id) | Manager |
| `GET` | `/rest/v1/client_logs` | Client logs | Admin |
| `GET` | `/rest/v1/sepay_webhook_logs` | Logs webhook đã xử lý | Admin |
| `GET` | `/rest/v1/unmatched_transactions` | Giao dịch chưa khớp | Manager |

#### 4.2 Edge Functions

| Method | Path | Mô tả |
|--------|------|-------|
| `POST` | `/functions/v1/sepay-webhook` | Nhận webhook từ Sepay |
| `POST` | `/functions/v1/client-logs` | Nhận log từ PWA (bypass RLS) |
| `POST` | `/functions/v1/check-alerts` | Cron job kiểm tra alert rules |

#### 4.3 Realtime Channels

| Channel | Event | Người subscribe | Mô tả |
|---------|-------|-----------------|-------|
| `penalty-{ticket_id}` | `postgres_changes` (UPDATE) | User (chủ phiếu) | Theo dõi trạng thái phiếu |
| `fund-notifications` | `broadcast` (fund_income) | Manager | Thông báo tiền vào quỹ |
| `notifications` | `broadcast` (penalty_update) | User | Thông báo phiếu bị waive/cash |
| `system-logs` | `postgres_changes` (INSERT) | Admin | Real-time tail log |

---

### 5. Test Case tổng hợp Phase 2

#### 5.1 Bảng tổng hợp toàn bộ 52 test case

| ID | Part | Mô tả | Loại |
|----|------|-------|------|
| P2-01 | 1 | Lưu Payment Setting hợp lệ | Positive |
| P2-02 | 1 | Lưu Vietinbank thiếu prefix | Negative |
| P2-03 | 1 | Lưu STK quá ngắn | Negative |
| P2-04 | 1 | Sinh QR đúng URL | Positive |
| P2-05 | 1 | Sinh description có VA | Positive |
| P2-06 | 1 | Sinh description không có VA | Positive |
| P2-07 | 1 | Realtime nhận UPDATE PAID | Positive |
| P2-08 | 1 | Realtime nhận UPDATE WAIVED | Positive |
| P2-09 | 1 | QR load fail → fallback | Edge |
| P2-10 | 1 | Realtime disconnect → polling | Edge |
| P2-11 | 1 | Transaction ID trùng | Edge |
| P2-12 | 1 | Copy nội dung CK | Positive |
| P2-13 | 2 | Webhook hợp lệ — PAID thành công | Positive |
| P2-14 | 2 | HMAC sai | Security |
| P2-15 | 2 | Timestamp quá cũ | Security |
| P2-16 | 2 | Duplicate webhook (dedup) | Edge |
| P2-17 | 2 | Không tìm thấy transaction_id | Edge |
| P2-18 | 2 | Transaction ID không tồn tại | Negative |
| P2-19 | 2 | Phiếu đã PAID | Negative |
| P2-20 | 2 | Số tiền không khớp | Negative |
| P2-21 | 2 | Test payload (id=0) | Edge |
| P2-22 | 2 | Webhook tiền ra | Edge |
| P2-23 | 2 | Race condition 2 webhook | Edge |
| P2-24 | 2 | Có VA code trong subAccount | Positive |
| P2-25 | 2 | Không có VA code | Positive |
| P2-26 | 3 | Miễn phạt thành công | Positive |
| P2-27 | 3 | Miễn phạt thiếu lý do | Negative |
| P2-28 | 3 | Miễn phạt phiếu đã PAID | Negative |
| P2-29 | 3 | Miễn phạt phiếu đã CASH_PAID | Negative |
| P2-30 | 3 | Miễn phạt phiếu đã WAIVED | Negative |
| P2-31 | 3 | Thu tiền mặt thành công | Positive |
| P2-32 | 3 | Thu tiền mặt chưa tick checkbox | Negative |
| P2-33 | 3 | Thu tiền mặt phiếu đã PAID | Negative |
| P2-34 | 3 | Xem audit log của phiếu | Positive |
| P2-35 | 3 | Audit log diff chính xác | Positive |
| P2-36 | 3 | Filter danh sách theo ngày | Positive |
| P2-37 | 3 | Filter theo trạng thái | Positive |
| P2-38 | 3 | Filter theo chi nhánh | Positive |
| P2-39 | 3 | Race condition 2 manager cùng waive | Edge |
| P2-40 | 3 | Realtime push khi manager waive | Positive |
| P2-41 | 4 | Xem tổng số dư quỹ | Positive |
| P2-42 | 4 | Xem balance theo chi nhánh | Positive |
| P2-43 | 4 | Filter transaction theo ngày | Positive |
| P2-44 | 4 | Filter transaction theo nguồn | Positive |
| P2-45 | 4 | User thường xem quỹ | Security |
| P2-46 | 4 | Manager xem quỹ | Positive |
| P2-47 | 4 | Realtime toast khi webhook về | Positive |
| P2-48 | 4 | Realtime toast khi cash payment | Positive |
| P2-49 | 4 | Dashboard auto-refresh | Positive |
| P2-50 | 4 | Export CSV | Positive |
| P2-51 | 4 | Đối soát unmatched | Positive |
| P2-52 | 4 | Transaction liên kết phiếu | Positive |
| P2-53 | 5 | System log ghi API request | Positive |
| P2-54 | 5 | System log ghi webhook error | Positive |
| P2-55 | 5 | Client log GPS timeout | Positive |
| P2-56 | 5 | Client log camera denied | Positive |
| P2-57 | 5 | Event timeline đầy đủ sequence | Positive |
| P2-58 | 5 | Audit log append-only (không xóa) | Security |
| P2-59 | 5 | Alert khi error rate > 1% | Positive |
| P2-60 | 5 | Log monitor real-time tail | Positive |

---

### 6. Tóm tắt kiến trúc toàn Phase 2

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              PWA (User + Manager)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │ Check-in    │  │ Phiếu phạt  │  │ QR Payment  │  │ Admin Panel │   │
│  │ (Phase 1)   │  │ (List/View) │  │ (VietQR)    │  │ (Settings)  │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
│         │                │                │                │            │
│         └────────────────┴────────────────┴────────────────┘            │
│                              │                                          │
│                    Supabase Realtime (channels)                         │
│                    ├─ penalty-{id}  (user subscribe)                   │
│                    ├─ fund-notifications  (manager subscribe)          │
│                    ├─ notifications  (user subscribe)                  │
│                    └─ system-logs  (admin subscribe)                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                           Supabase Platform                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ PostgreSQL DB   │  │ Edge Functions  │  │ Auth + RLS              │  │
│  │ (All tables)    │  │ (Deno)          │  │ (JWT roles)             │  │
│  │                 │  │                 │  │                         │  │
│  │ • users         │  │ • sepay-webhook │  │ • staff: own data       │  │
│  │ • penalty_tickets│  │ • client-logs   │  │ • manager: all read     │  │
│  │ • payment_settings│ │ • check-alerts  │  │ • admin: full access    │  │
│  │ • fund_transactions│ │                │  │                         │  │
│  │ • audit_logs    │  │                 │  │                         │  │
│  │ • system_logs   │  │                 │  │                         │  │
│  │ • event_timelines│ │                 │  │                         │  │
│  │ • client_logs   │  │                 │  │                         │  │
│  │ • sepay_webhook_logs│               │  │                         │  │
│  │ • unmatched_transactions│           │  │                         │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
│                                    │                                    │
│                           ┌────────┴────────┐                          │
│                           │  RPC Functions   │                          │
│                           │  • process_payment│                         │
│                           │  • waive_penalty  │                         │
│                           │  • cash_payment   │                         │
│                           │  • check_alert_rules│                       │
│                           └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                           External Services                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │ Sepay       │  │ VietQR      │  │ Telegram/   │  │ banks.json  │   │
│  │ (Webhook)   │  │ (QR Image)  │  │ Slack       │  │ (Dropdown)  │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 7. Checklist hoàn thành Phase 2

- [ ] **Payment Setting** — Form admin, validate Vietinbank prefix, dropdown banks.json
- [ ] **QR Generation** — VietQR URL, description động, fallback text
- [ ] **Supabase Realtime** — PWA subscribe `penalty-{id}`, auto-update UI
- [ ] **Sepay Webhook** — Edge Function, HMAC-SHA256, anti-replay, dedup
- [ ] **Business Logic** — Parse content, tìm phiếu, kiểm tra số tiền, atomic RPC
- [ ] **Quỹ công ty** — Read-only, VIEW balance, transaction list + filter
- [ ] **Miễn phạt** — Bắt buộc lý do, audit log, không tạo quỹ
- [ ] **Thu tiền mặt** — Checkbox xác nhận, tạo quỹ `PENALTY_CASH`, audit log
- [ ] **Thông báo** — Real-time toast cho manager (fund), user (penalty update)
- [ ] **Audit Trail** — Append-only, diff JSONB, 8 mandatory reason actions
- [ ] **System Log** — Auto log API, webhook, GPS, DB
- [ ] **Client Log** — PWA gửi lỗi về server
- [ ] **Event Timeline** — Travel time cho mỗi entity
- [ ] **Log Monitor** — Health dashboard, real-time tail, alert rules
- [ ] **Test** — 60 test case đầy đủ

---

> **Phase 2 HOÀN THÀNH.** 
