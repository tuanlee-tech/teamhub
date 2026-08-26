# Phase 5: Advanced & Polish — Chi tiết

> **Techstack:** Supabase (PostgreSQL, Realtime, Edge Functions, Auth, RLS, Storage) + FCM/OneSignal (Push) + SendGrid/Resend (Email)  
> **Mục tiêu:** Hoàn thiện UX, bảo mật, performance, và các tính năng "nice to have" để app production-ready.

---

## 1. Notifications đầy đủ (3 kênh)

### 1.1 Kiến trúc 3 kênh

| Kênh | Dùng khi nào | Triển khai | Fallback |
|------|-------------|------------|----------|
| **Push Notification** | Real-time, app đóng/background | FCM (Firebase Cloud Messaging) hoặc OneSignal | Nếu user tắt push → chuyển in-app |
| **In-app Notification** | App đang mở | Supabase Realtime Broadcast + badge counter | Luôn có |
| **Email** | Tổng hợp hàng ngày / quan trọng | SendGrid / Resend / Supabase Edge Function gọi SMTP | Nếu push fail 3 lần / user không mở app 24h |

### 1.2 Bảng `notifications` (In-app + tracking)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users |
| `type` | VARCHAR(50) | `PENALTY_CREATED`, `PAYMENT_SUCCESS`, `LEAVE_APPROVED`, `WITHDRAW_APPROVED`, `DAILY_SUMMARY` |
| `title` | VARCHAR(200) | |
| `body` | TEXT | |
| `data` | JSONB | `{ ticket_id, amount, request_id }` để deep link |
| `channel` | VARCHAR(20) | `push` / `in_app` / `email` / `all` |
| `read` | BOOLEAN | DEFAULT false |
| `sent_at` | TIMESTAMPTZ | |
| `read_at` | TIMESTAMPTZ | nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |

### 1.3 Tình huống thông báo

| Sự kiện | User nhận | Manager nhận | Accountant nhận | Kênh |
|---------|-----------|--------------|-----------------|------|
| Tạo phiếu phạt | ✅ "Bạn bị phạt 20k" | ❌ | ❌ | Push + In-app |
| Thanh toán thành công | ✅ "Đã thanh toán P-xxx" | ✅ "+20k vào quỹ" | ✅ "+20k vào quỹ" | Push + In-app |
| Miễn phạt | ✅ "P-xxx đã được miễn" | ❌ | ❌ | Push + In-app |
| Đơn nghỉ được duyệt | ✅ "Đơn nghỉ đã được duyệt" | ❌ | ❌ | Push + In-app |
| Đơn nghỉ bị từ chối | ✅ "Đơn nghỉ bị từ chối: [lý do]" | ❌ | ❌ | Push + In-app |
| Unmatched mới | ❌ | ✅ "Có giao dịch chưa khớp" | ✅ "Có giao dịch chưa khớp" | Push + In-app |
| Yêu cầu rút quỹ | ❌ | ✅ "Có yêu cầu rút 2 triệu" | ❌ | Push + In-app |
| Yêu cầu rút được duyệt | ❌ | ❌ | ✅ "Yêu cầu rút đã được duyệt" | Push + In-app |
| Daily summary (08:00) | ✅ "Hôm nay bạn có 1 phiếu phạt" | ✅ "Hôm nay: +100k, 2 phiếu mới" | ✅ "Hôm nay: 1 unmatched" | Email + In-app |

### 1.4 Edge Function gửi Push (FCM)

```typescript
// supabase/functions/send-push/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const { user_id, title, body, data } = await req.json();

  // Lấy FCM token của user
  const { data: tokenRow } = await supabase
    .from('user_push_tokens')
    .select('fcm_token')
    .eq('user_id', user_id)
    .single();

  if (!tokenRow?.fcm_token) {
    // Không có token → gửi email fallback
    await sendEmailFallback(user_id, title, body);
    return Response.json({ success: false, fallback: 'email' });
  }

  // Gửi FCM
  const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Authorization': `key=${Deno.env.get('FCM_SERVER_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: tokenRow.fcm_token,
      notification: { title, body },
      data: { ...data, click_action: '/open' }
    })
  });

  if (!fcmRes.ok) {
    await sendEmailFallback(user_id, title, body);
  }

  // Lưu in-app notification
  await supabase.from('notifications').insert({
    user_id, type: data.type, title, body, data, channel: 'push', sent_at: new Date().toISOString()
  });

  return Response.json({ success: true });
});
```

### 1.5 PWA nhận Push (Service Worker)

```javascript
// service-worker.js
self.addEventListener('push', (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      data: data.data,
      actions: [
        { action: 'open', title: 'Mở app' },
        { action: 'dismiss', title: 'Bỏ qua' }
      ]
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'open') {
    const url = event.notification.data?.ticket_id 
      ? `/penalty/${event.notification.data.ticket_id}` 
      : '/';
    event.waitUntil(clients.openWindow(url));
  }
});
```

### 1.6 Email Daily Summary (Cron)

```sql
-- Edge Function chạy 08:00 hàng ngày
-- Query tổng hợp cho từng user rồi gửi email qua Resend API
```

> **Hint thay thế:** Nếu dùng Node.js: `web-push` library cho browser push, `nodemailer` cho email. Nếu dùng Firebase: FCM tích hợp sẵn, Cloud Functions trigger. Nếu dùng AWS: SNS cho push, SES cho email.

---

## 2. Offline Mode hoàn chỉnh

### 2.1 IndexedDB Schema (client-side)

```javascript
// db.js — dùng idb hoặc native IndexedDB
const DB_NAME = 'checkin-pwa-v1';
const DB_VERSION = 1;

const STORES = {
  checkins: { keyPath: 'id', autoIncrement: true },
  leave_requests: { keyPath: 'id' },
  penalty_tickets: { keyPath: 'id' },
  sync_queue: { keyPath: 'id', autoIncrement: true }
};

// Mỗi record có thêm: sync_status: 'pending' | 'synced' | 'failed'
```

### 2.2 Tính năng offline

| Tính năng | Offline behavior | Sync khi online |
|-----------|-----------------|-----------------|
| **Check-in GPS** | Lưu vào IndexedDB với timestamp, coords. Hiện "Đã lưu local, sẽ đồng bộ khi có mạng" | Background sync tự gửi lên server |
| **Tạo đơn nghỉ** | Lưu draft vào IndexedDB. Chưa submit được khi offline. | Khi online → tự submit nếu user đã bấm "Gửi" |
| **Xem phiếu phạt** | Cache danh sách UNPAID từ lần online cuối. Read-only. | Auto refresh khi online |
| **Thanh toán QR** | Không thể tạo QR mới (cần server sinh transaction_id). Hiện "Cần kết nối mạng" | — |
| **Xem quỹ** | Cache transaction gần nhất (50 record). Read-only. | Auto refresh |

### 2.3 Background Sync (Service Worker)

```javascript
// service-worker.js
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-checkins') {
    event.waitUntil(syncCheckins());
  }
  if (event.tag === 'sync-leave-requests') {
    event.waitUntil(syncLeaveRequests());
  }
});

async function syncCheckins() {
  const db = await openDB(DB_NAME, DB_VERSION);
  const pending = await db.getAllFromIndex('checkins', 'sync_status', 'pending');

  for (const record of pending) {
    try {
      const res = await fetch('/rest/v1/checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${record.token}` },
        body: JSON.stringify(record.payload)
      });

      if (res.ok) {
        await db.put('checkins', { ...record, sync_status: 'synced' });
      } else if (res.status === 409) {
        // Conflict: server đã có check-in cùng thời điểm
        await db.put('checkins', { ...record, sync_status: 'conflict' });
      }
    } catch (e) {
      await db.put('checkins', { ...record, sync_status: 'failed', error: e.message });
    }
  }
}
```

### 2.4 Conflict Resolution

```javascript
// Khi sync gặp conflict
function showConflictDialog(localRecord, serverRecord) {
  // Hiện popup so sánh:
  // Local: Check-in lúc 09:05 (GPS: 10.771, 106.698)
  // Server: Check-in lúc 09:03 (GPS: 10.772, 106.699)
  // [Giữ local]  [Giữ server]  [Giữ cả hai]
}
```

> **Hint thay thế:** Nếu dùng Firebase: Firestore hỗ trợ offline persistence tự động (`enablePersistence()`), không cần tự viết IndexedDB. Nếu dùng Node.js: PWA vẫn dùng Service Worker + IndexedDB như trên, backend không cần thay đổi.

---

## 3. Export báo cáo

### 3.1 Định dạng & Thư viện

| Định dạng | Thư viện | Cách làm |
|-----------|----------|----------|
| **Excel (.xlsx)** | `sheetjs` (xlsx) | Client-side: fetch data → generate Blob → download |
| **PDF** | `jspdf` + `html2canvas` | Client-side: render HTML table → canvas → PDF |

### 3.2 Edge Function generate file (nếu data lớn)

```typescript
// supabase/functions/export-report/index.ts
import * as xlsx from 'https://esm.sh/xlsx@0.18.5';

Deno.serve(async (req) => {
  const { report_type, filters } = await req.json();

  // Query data
  const { data } = await supabase.rpc(`report_${report_type}`, filters);

  // Generate Excel
  const ws = xlsx.utils.json_to_sheet(data);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Report');
  const buf = xlsx.write(wb, { type: 'array', bookType: 'xlsx' });

  // Upload lên Storage
  const fileName = `reports/${report_type}_${Date.now()}.xlsx`;
  await supabase.storage.from('exports').upload(fileName, new Uint8Array(buf));

  // Trả signed URL
  const { data: { signedUrl } } = await supabase.storage.from('exports').createSignedUrl(fileName, 3600);

  return Response.json({ download_url: signedUrl });
});
```

> **Hint thay thế:** Nếu dùng Node.js: `exceljs` hoặc `pdfmake` để generate server-side. Nếu dùng Firebase: Cloud Function + `pdfkit` → upload lên Cloud Storage → trả signed URL.

---

## 4. HR Role tách biệt

### 4.1 Quyền HR

| Tính năng | Quyền HR |
|-----------|----------|
| Cấu hình quota nghỉ phép | ✅ Theo cấp bậc, theo năm |
| Cấu hình danh hiệu / chức danh | ✅ |
| Xem báo cáo chấm công toàn công ty | ✅ |
| Xem báo cáo nghỉ phép | ✅ |
| Duyệt đơn nghỉ | ✅ (cùng với Manager) |
| Miễn phạt | ❌ (chỉ Manager) |
| Rút quỹ | ❌ (chỉ Accountant + Manager) |
| Xử lý unmatched | ❌ (chỉ Accountant + Manager) |

### 4.2 UI theo role

```javascript
// PWA: render menu dựa trên roles từ JWT
const menuItems = [
  { label: 'Check-in', icon: 'gps', roles: ['staff', 'manager', 'hr', 'accountant'] },
  { label: 'Phiếu phạt', icon: 'ticket', roles: ['staff', 'manager'] },
  { label: 'Nghỉ phép', icon: 'calendar', roles: ['staff', 'manager', 'hr'] },
  { label: 'Duyệt nghỉ', icon: 'approve', roles: ['manager', 'hr'] },
  { label: 'Quỹ công ty', icon: 'fund', roles: ['manager', 'accountant'] },
  { label: 'Đối soát', icon: 'match', roles: ['accountant', 'manager'] },
  { label: 'Cấu hình quota', icon: 'settings', roles: ['hr', 'admin'] },
  { label: 'Audit log', icon: 'history', roles: ['manager', 'accountant', 'hr', 'admin'] },
  { label: 'Log monitor', icon: 'monitor', roles: ['admin'] }
];

// Filter theo user roles
const visibleMenu = menuItems.filter(item => 
  item.roles.some(r => userRoles.includes(r))
);
```

---

## 5. Multi-role: 1 user nhiều vai trò

### 5.1 JWT claims

```json
{
  "sub": "user-uuid",
  "roles": ["manager", "accountant"],
  "email": "a@company.com",
  "iat": 1724563200,
  "exp": 1724566800
}
```

### 5.2 RLS với multi-role

```sql
-- Kiểm tra user có bất kỳ role nào trong danh sách
CREATE POLICY "Accountant or Manager can view fund"
ON fund_transactions FOR SELECT
USING (auth.jwt() -> 'roles' ?| array['accountant', 'manager', 'admin']);

-- Kiểm tra user có role cụ thể
CREATE POLICY "Only HR can config quota"
ON leave_quotas FOR UPDATE
USING (auth.jwt() -> 'roles' ? 'hr');
```

### 5.3 Admin phân quyền

```
Admin Panel → Quản lý người dùng
    ↓
Danh sách user → Click user
    ↓
Checkbox roles: [ ] Staff  [x] Manager  [x] Accountant  [ ] HR  [ ] Admin
    ↓
Bấm "Lưu" → update bảng user_roles → trigger refresh JWT token
```

> **Hint thay thế:** Nếu dùng Node.js: bảng `user_roles` riêng, middleware `requireAnyRole(['manager', 'accountant'])`. Nếu dùng Firebase: custom claims `roles: ['manager', 'accountant']` trong JWT, cập nhật qua `admin.auth().setCustomUserClaims()`.

---

## 6. Dark Mode / Theme

### 6.1 CSS Variables

```css
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f8f9fa;
  --text-primary: #1a1a2e;
  --text-secondary: #6c757d;
  --accent: #4f46e5;
  --danger: #dc2626;
  --success: #16a34a;
  --warning: #f59e0b;
  --border: #e5e7eb;
}

[data-theme="dark"] {
  --bg-primary: #0f172a;
  --bg-secondary: #1e293b;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --accent: #818cf8;
  --danger: #ef4444;
  --success: #22c55e;
  --warning: #fbbf24;
  --border: #334155;
}
```

### 6.2 Toggle & Persist

```javascript
// PWA
const themeToggle = document.getElementById('theme-toggle');

// Load từ localStorage + Supabase
async function loadTheme() {
  const local = localStorage.getItem('theme');
  if (local) {
    document.documentElement.setAttribute('data-theme', local);
    return;
  }
  // Nếu chưa có local → lấy từ Supabase user_preferences
  const { data } = await supabase.from('user_preferences').select('theme').eq('user_id', userId).single();
  if (data?.theme) {
    document.documentElement.setAttribute('data-theme', data.theme);
    localStorage.setItem('theme', data.theme);
  }
}

// Toggle
themeToggle.addEventListener('click', async () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  await supabase.from('user_preferences').upsert({ user_id: userId, theme: next });
});
```

---

## 7. PWA Install & Update

### 7.1 Install Prompt

```javascript
// PWA: Hiện prompt cài đặt
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Hiện nút "Cài đặt app" sau lần truy cập thứ 2
  if (localStorage.getItem('visit_count') >= 2) {
    showInstallButton();
  }
});

async function installPWA() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    localStorage.setItem('pwa_installed', 'true');
  }
  deferredPrompt = null;
}
```

### 7.2 Update Flow

```javascript
// service-worker.js
const CACHE_NAME = 'checkin-v2';

self.addEventListener('install', (e) => {
  self.skipWaiting(); // Kích hoạt SW mới ngay
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

// PWA: Lắng nghe update
navigator.serviceWorker.addEventListener('controllerchange', () => {
  showToast('🔄 Có phiên bản mới! Bấm để cập nhật', {
    action: 'reload',
    onAction: () => window.location.reload()
  });
});

// Kiểm tra version mỗi 5 phút
setInterval(async () => {
  const res = await fetch('/version.json?t=' + Date.now());
  const { version } = await res.json();
  if (version !== CURRENT_VERSION) {
    showUpdateToast();
  }
}, 300000);
```

### 7.3 Force Update

Nếu API thay đổi không tương thích (breaking change):
```javascript
// Khi app mở, kiểm tra API version
const { data: serverVersion } = await supabase.rpc('get_app_version');
if (serverVersion.min_client_version > CURRENT_VERSION) {
  // Chặn app, bắt buộc reload
  showModal('Phiên bản app đã cũ. Vui lòng cập nhật để tiếp tục.', {
    actions: [{ label: 'Cập nhật ngay', onClick: () => window.location.reload() }]
  });
}
```

---

## 8. Rate Limiting & Security Hardening

### 8.1 Rate Limit (Edge Function)

```typescript
// Middleware trong mỗi Edge Function
const RATE_LIMITS = {
  api: { max: 100, window: 60 },      // 100 req/phút / user
  webhook: { max: 10, window: 60 },   // 10 req/phút / IP
  auth: { max: 5, window: 300 },      // 5 lần đăng nhập sai / 5 phút
};

async function checkRateLimit(category: string, key: string) {
  const limit = RATE_LIMITS[category];
  const redisKey = `rate:${category}:${key}`;
  // Dùng Upstash Redis hoặc Supabase KV
  const current = await kv.get(redisKey) || 0;
  if (current >= limit.max) {
    return { allowed: false, retryAfter: limit.window };
  }
  await kv.set(redisKey, current + 1, { ex: limit.window });
  return { allowed: true };
}
```

> **Hint thay thế:** Nếu dùng Node.js: `express-rate-limit` middleware. Nếu dùng Firebase: không cần rate limit (Firebase tự scale), nhưng có thể dùng Cloud Armor (GCP) hoặc API Gateway. Nếu dùng AWS: API Gateway throttling + WAF.

### 8.2 Brute Force Protection

```sql
-- Bảng login_attempts
CREATE TABLE login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(100),
  ip_address INET,
  success BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Chỉ admin xem
CREATE POLICY "Admin view login attempts" ON login_attempts FOR SELECT
USING (auth.jwt() -> 'roles' ? 'admin');

-- Edge Function: sau 5 lần sai trong 15 phút → lock 15 phút
```

### 8.3 CORS & Input Sanitization

| Biện pháp | Triển khai |
|-----------|-----------|
| **CORS** | Supabase Edge Function: chỉ cho phép domain công ty (`https://checkin.company.com`) |
| **Input sanitize** | DOMPurify cho mọi user input trước khi render HTML |
| **SQL injection** | Không cần lo (Supabase RLS + parameterized query tự động) |
| **XSS** | Content-Security-Policy header: `default-src 'self'; script-src 'self'` |
| **HTTPS only** | Sepay webhook chỉ chấp nhận HTTPS. Supabase tự động HTTPS. |

---

## 9. Performance Optimization

### 9.1 Các biện pháp

| Biện pháp | Cách làm |
|-----------|----------|
| **CDN static assets** | Supabase Storage + CDN cho icon, font, ảnh |
| **Image lazy loading** | `loading="lazy"` cho avatar, hóa đơn, minh chứng |
| **Pagination** | Mọi danh sách: `LIMIT 50 OFFSET 0`. Không load > 100 record 1 lúc. |
| **Database index** | Review định kỳ: `EXPLAIN ANALYZE` cho query chậm. Thêm index nếu cần. |
| **Cache client-side** | `payment_settings`, `banks.json`, `user_profile` cache localStorage 1 tuần. |
| **Debounce search** | Search input: debounce 300ms trước khi gọi API. |
| **Virtual scroll** | Danh sách > 100 item: dùng virtual scroll (chỉ render item trong viewport). |

### 9.2 Database Index Review

```sql
-- Index đã có từ Phase 2 + 3 + 4
-- Thêm index cho Phase 5 queries:
CREATE INDEX idx_notifications_user_read ON notifications(user_id, read) WHERE read = false;
CREATE INDEX idx_login_attempts_email_time ON login_attempts(email, created_at);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_preferences_user ON user_preferences(user_id);
```

---

## 10. API Endpoints

| Method | Path | Mô tả | Auth |
|--------|------|-------|------|
| `POST` | `/functions/v1/send-push` | Gửi push notification | Server (Edge Function internal) |
| `POST` | `/functions/v1/export-report` | Generate Excel/PDF | Manager/Accountant/HR |
| `POST` | `/functions/v1/daily-summary` | Cron gửi email 08:00 | Server |
| `GET` | `/rest/v1/notifications` | Danh sách thông báo | User (own) |
| `PATCH` | `/rest/v1/notifications?id=eq.{id}` | Đánh dấu đã đọc | User (own) |
| `GET` | `/rest/v1/user_preferences` | Lấy preference (theme, language) | User (own) |
| `PATCH` | `/rest/v1/user_preferences` | Cập nhật preference | User (own) |
| `GET` | `/rest/v1/user_roles` | Danh sách roles của user | Admin |
| `POST` | `/rest/v1/user_roles` | Gán role cho user | Admin |
| `DELETE` | `/rest/v1/user_roles?id=eq.{id}` | Xóa role | Admin |
| `GET` | `/rest/v1/login_attempts` | Xem lịch sử đăng nhập | Admin |
| `GET` | `/version.json` | Kiểm tra version app | Public |

---

## 11. Test Case

| ID | Mô tả | Input | Expected |
|----|-------|-------|----------|
| **P5-01** | Push notification khi tạo phiếu | Server gửi push | User nhận notification trên điện thoại, bấm mở app đúng màn hình phiếu |
| **P5-02** | Email fallback khi push tắt | User tắt push, có sự kiện | Gửi email daily summary, không gửi push |
| **P5-03** | In-app badge counter | 3 thông báo chưa đọc | Badge hiển thị số 3 trên icon chuông |
| **P5-04** | Check-in offline | Mất mạng, bấm check-in | Lưu IndexedDB, hiện "Đã lưu local", mạng về tự sync |
| **P5-05** | Sync không duplicate | Check-in offline đã sync | Không tạo duplicate record trên server |
| **P5-06** | Conflict resolution | Local check-in 9:05, server có 9:03 | Hiện popup chọn giữ local hay server |
| **P5-07** | Export Excel báo cáo | Client generate | File .xlsx tải về đúng format, đủ cột, không lỗi font |
| **P5-08** | User có 2 roles [MANAGER, HR] | Login | JWT chứa `roles: ["manager", "hr"]`, UI hiện cả 2 menu |
| **P5-09** | Admin phân quyền | Admin gán role ACCOUNTANT cho user | User nhận JWT mới với role updated, UI refresh |
| **P5-10** | Dark mode toggle | Bấm toggle | UI chuyển ngay, reload vẫn giữ theme (localStorage + DB) |
| **P5-11** | PWA install prompt | Truy cập lần 2 | Hiện nút "Cài đặt app", bấm được, app xuất hiện trên home screen |
| **P5-12** | PWA update toast | Server có version mới | Hiện toast "Có phiên bản mới", bấm reload app lên version mới |
| **P5-13** | Force update | Server yêu cầu min_client_version > app hiện tại | Modal chặn app, bắt buộc reload |
| **P5-14** | Rate limit API | 101 request/phút | 429 Too Many Requests, header Retry-After |
| **P5-15** | Rate limit webhook | 11 request/phút từ cùng IP | 429 Too Many Requests |
| **P5-16** | Brute force | 5 lần đăng nhập sai | Account lock 15 phút, thông báo "Tài khoản tạm khóa" |
| **P5-17** | Input sanitize XSS | Nhập `<script>alert(1)</script>` vào lý do | DOMPurify escape, hiển thị text thuần, không chạy script |
| **P5-18** | HTTPS only | Gọi HTTP thay vì HTTPS | Tự động redirect HTTPS (Supabase/Cloudflare) |
| **P5-19** | Pagination | Danh sách 150 transaction | Chỉ load 50 record đầu, nút "Xem thêm" load tiếp |
| **P5-20** | Virtual scroll | Danh sách 500 nhân viên | Render mượt, không lag, chỉ render item trong viewport |

---

## 12. Tổng hợp kiến trúc 5 Phase

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PWA (User + Manager + Accountant + HR + Admin)  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Check-in │ │ Phiếu phạt│ │ Nghỉ phép│ │ Quỹ công │ │ Admin    │         │
│  │ (Phase 1)│ │ (Phase 2)│ │ (Phase 3)│ │ ty (P2-4)│ │ (P4-5)   │         │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
│       │            │            │            │            │                │
│       └────────────┴────────────┴────────────┴────────────┘                │
│                              │                                              │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │  Offline: IndexedDB + Service Worker + Background Sync      │           │
│  │  Theme: CSS Variables + Dark Mode + localStorage + DB       │           │
│  │  PWA: Install Prompt + Update Toast + Force Update          │           │
│  │  Performance: Lazy Load + Pagination + Virtual Scroll       │           │
│  └─────────────────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Supabase Platform                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ PostgreSQL   │  │ Edge Functions│  │ Auth + RLS   │  │ Realtime     │   │
│  │ (All tables) │  │ (Deno)       │  │ (JWT roles[])│  │ (Broadcast + │   │
│  │              │  │              │  │              │  │  Postgres)    │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                      │
│  │ Storage      │  │ Cron         │  │ RPC          │                      │
│  │ (CDN assets) │  │ (Daily email,│  │ (Atomic      │                      │
│  │              │  │  quota reset)│  │  business)   │                      │
│  └──────────────┘  └──────────────┘  └──────────────┘                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────────┐
│                           External Services                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Sepay    │ │ VietQR   │ │ FCM /    │ │ SendGrid/│ │ Upstash  │         │
│  │ (Webhook)│ │ (QR img) │ │ OneSignal│ │ Resend   │ │ Redis    │         │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Checklist hoàn thành toàn bộ 5 Phase

### Phase 1: Core Check-in ✅
- [ ] GPS Check-in + radius validation
- [ ] Tablet QR/OTP Check-in
- [ ] Anomaly Detection + Selfie
- [ ] Penalty Creation (Late + Fraud)
- [ ] 43 test case

### Phase 2: Payment & Fund ✅
- [ ] Payment Setting (Admin)
- [ ] VietQR + QR Generation
- [ ] Sepay Webhook (HMAC + Dedup)
- [ ] Quỹ Read-only + Filter + Export
- [ ] Manager: Miễn phạt + Thu tiền mặt
- [ ] Notifications (User + Manager)
- [ ] Logging & Observability (4 loại)
- [ ] 60 test case

### Phase 3: Leave Management ✅
- [ ] 6 loại đơn xin nghỉ
- [ ] Quota năm + tháng + carry over
- [ ] Workflow duyệt (Approve/Reject/Request Info)
- [ ] Tích hợp check-in (tránh penalty oan)
- [ ] Calendar view + Export
- [ ] Nhắc nhở & Thông báo
- [ ] 25 test case

### Phase 4: Accounting & Fund Management ✅
- [ ] Xử lý unmatched (Match/Refund/Ignore)
- [ ] Rút quỹ (threshold + 2 approver)
- [ ] Nạp quỹ (Manual Deposit)
- [ ] Báo cáo tài chính (5 loại)
- [ ] Multi-role: Accountant
- [ ] Hoàn tiền tracking
- [ ] 20 test case

### Phase 5: Advanced & Polish ✅
- [ ] Notifications 3 kênh (Push + In-app + Email)
- [ ] Offline mode + Background sync + Conflict resolution
- [ ] Export báo cáo (Excel + PDF)
- [ ] Multi-role: HR + 1 user nhiều vai
- [ ] Dark mode + Theme
- [ ] PWA Install + Update + Force update
- [ ] Rate limiting + Brute force + CORS + XSS
- [ ] Performance: CDN + Lazy load + Pagination + Virtual scroll
- [ ] 20 test case

---

> **TẤT CẢ 5 PHASE HOÀN THÀNH.**  
> Tổng cộng: **~168 test case** | Techstack: **Supabase** | Sẵn sàng triển khai.
