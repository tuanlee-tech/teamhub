# Quyết định Codebase — PWA Check-in GPS

> **Dự án:** PWA Check-in GPS + Thanh toán phạt (Sepay/VietQR) + Quản lý nghỉ phép + Kế toán quỹ  
> **Frontend:** React 18 + TypeScript + Vite (PWA)  
> **Backend:** Supabase (PostgreSQL, Realtime, Edge Functions, Auth, Storage)  
> **Ngày cập nhật:** 25/08/2026

---

## 1. Techstack Decision

### 1.1 Frontend: ReactJS + TypeScript + Vite

| Tiêu chí | Quyết định | Lý do |
|----------|-----------|-------|
| **Framework** | React 18 (không NextJS) | Không cần SEO (app internal). Dùng Vite để build nhanh, HMR nhanh, config PWA dễ dàng. |
| **Build tool** | Vite + `vite-plugin-pwa` | PWA config đơn giản (manifest, Service Worker generate tự động). Bundle nhỏ hơn Webpack. |
| **State** | Zustand + React Query (TanStack Query) | Zustand ~1KB, không boilerplate như Redux. React Query cache API, refetch, offline support tốt. |
| **Routing** | React Router v6 | File-based routing không cần thiết cho app ~15 màn hình. React Router đủ linh hoạt, lazy load dễ. |
| **UI** | Tailwind CSS + Headless UI / Radix | Không dùng component library nặng (MUI/ANTD). Tailwind utility-first, dễ custom, bundle nhỏ. Headless UI cho accessible component (modal, dropdown, dialog). |
| **Form** | React Hook Form + Zod | Performance tốt (không re-render nhiều). Zod validate schema TypeScript-safe. |
| **PWA** | `vite-plugin-pwa` (Workbox) | Tự generate Service Worker, precache, background sync. Không viết SW thủ công. |

**Tại sao KHÔNG Vanilla JS :**
- Dự án 5 Phase, ~15 màn hình, nhiều component tái sử dụng (table, form, modal, toast, calendar).
- Vanilla JS với ~15 màn hình + state phức tạp (realtime, offline sync, multi-role) dẫn đến spaghetti code, khó maintain.
- React giúp: component reusable, reactive state (không cần tự viết event emitter), lifecycle rõ ràng, DevTools mạnh.

**Tại sao KHÔNG NextJS:**
- App internal (PWA), không cần SEO, không cần SSR.
- NextJS App Router học curve cao, team nhỏ không cần tính năng phức tạp.
- Vite + React Router đủ nhẹ, build nhanh, deploy lên Vercel/Netlify free tier dễ dàng.

### 1.2 Backend: Supabase

| Tiêu chí | Quyết định | Lý do |
|----------|-----------|-------|
| **Database** | PostgreSQL 15+ | RLS, JSONB, VIEW, RPC, full-text search |
| **Realtime** | Supabase Realtime | `postgres_changes` + Broadcast. Cho payment, fund, leave, notification. |
| **Auth** | Supabase Auth (JWT) | Email/Password + Google OAuth. JWT chứa mảng `roles`. |
| **Edge Functions** | Deno/TypeScript | Webhook Sepay, cron daily summary, export report, push notification.|
| **Storage** | Supabase Storage | Ảnh selfie, hóa đơn rút quỹ, chứng từ nạp quỹ, avatar. CDN tự động. |
| **Free tier** | 500MB DB, 2GB Storage, 500k Realtime msgs | Đủ cho < 100 nhân viên.  |

### 1.3 External Services

| Dịch vụ | Mục đích | Ghi chú |
|---------|----------|---------|
| **Sepay** | Webhook nhận biến động số dư Vietinbank | Filter `SEVQR`, HMAC-SHA256. |
| **VietQR** | Sinh QR ảnh (`vietqr.app/img?...`) | Không cần API key. |
| **banks.json** | Dropdown ngân hàng | Từ `vietqr.app/banks.json`, cache local. |
| **FCM / OneSignal** | Push notification (Phase 5) | Free tier. Fallback: In-app + Email. |
| **SendGrid / Resend** | Email daily summary (08:00) | Free tier: 100 email/ngày. |
| **Vercel / Netlify** | Deploy frontend | Free tier, auto HTTPS, CDN. |

### 1.4 Tóm tắt stack đầy đủ

```
Frontend:     React 18 + TypeScript + Vite + Tailwind CSS
              ├── State: Zustand + React Query
              ├── Routing: React Router v6
              ├── Form: React Hook Form + Zod
              ├── PWA: vite-plugin-pwa (Workbox)
              └── Icons: Lucide React (nhẹ, tree-shake)

Backend:      Supabase Platform
              ├── PostgreSQL 15+ (DB chính)
              ├── PostgREST (REST API auto)
              ├── Supabase Realtime (WebSocket)
              ├── Supabase Auth (JWT + OAuth)
              ├── Supabase Storage (S3 + CDN)
              └── Edge Functions (Deno/TypeScript)

External:     Sepay (Webhook) → VietQR (QR) → FCM/OneSignal (Push)
              → SendGrid/Resend (Email) → banks.json (Dropdown)

Deploy:       Frontend: Vercel/Netlify (Free)
              Backend: Supabase Cloud (Free tier)
              Domain: Vercel subdomain hoặc mua .xyz (~70k/năm)
```

---

## 2. Cấu trúc dự án (Project Structure)

### 2.1 Monorepo layout

```
teamhub/
├── 📁 supabase/                    # Supabase project
│   ├── 📁 migrations/              # SQL migrations (versioned)
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_penalty_system.sql
│   │   ├── 003_payment_fund.sql
│   │   ├── 004_leave_management.sql
│   │   ├── 005_accounting.sql
│   │   └── 006_advanced_polish.sql
│   ├── 📁 functions/               # Edge Functions (Deno)
│   │   ├── sepay-webhook/index.ts
│   │   ├── send-push/index.ts
│   │   ├── export-report/index.ts
│   │   ├── daily-summary/index.ts
│   │   ├── check-alerts/index.ts
│   │   └── _shared/               # Shared utilities
│   │       ├── supabase-client.ts
│   │       ├── hmac-verify.ts
│   │       └── response.ts
│   ├── 📁 seeds/                   # Seed data cho dev
│   │   └── seed.sql
│   └── config.toml                 # Supabase CLI config
│
├── 📁 src/                         # React PWA source
│   ├── 📁 main.tsx                 # Entry point + providers
│   ├── 📁 App.tsx                  # Root component + routing
│   ├── 📁 routes/                  # React Router routes
│   │   ├── index.tsx               # Route definitions + lazy load
│   │   ├── ProtectedRoute.tsx      # Auth + role guard
│   │   └── Layout.tsx              # Main layout (sidebar + header)
│   │
│   ├── 📁 pages/                   # Page components (1 page = 1 folder)
│   │   ├── Login/
│   │   │   ├── Login.tsx
│   │   │   └── Login.schema.ts     # Zod schema
│   │   ├── Checkin/
│   │   │   ├── Checkin.tsx
│   │   │   ├── useCheckin.ts       # Business logic hook
│   │   │   └── Checkin.test.tsx
│   │   ├── Penalty/
│   │   │   ├── PenaltyList.tsx
│   │   │   ├── PenaltyPayment.tsx  # QR + Realtime
│   │   │   └── PenaltyDetail.tsx
│   │   ├── Leave/
│   │   │   ├── LeaveRequest.tsx
│   │   │   ├── LeaveApproval.tsx
│   │   │   └── LeaveCalendar.tsx
│   │   ├── Fund/
│   │   │   ├── FundDashboard.tsx
│   │   │   ├── UnmatchedList.tsx
│   │   │   └── WithdrawRequest.tsx
│   │   ├── Admin/
│   │   │   ├── PaymentSetting.tsx
│   │   │   ├── AuditLog.tsx
│   │   │   └── UserRoles.tsx
│   │   └── Settings/
│   │       └── Settings.tsx
│   │
│   ├── 📁 components/              # Reusable UI components
│   │   ├── ui/                     # Primitive components (Button, Input, Card)
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Toast.tsx
│   │   │   ├── Modal.tsx
│   │   │   └── Table.tsx
│   │   ├── common/                 # Domain-agnostic composite
│   │   │   ├── DataTable.tsx       # Table + sort + filter + pagination
│   │   │   ├── DateRangePicker.tsx
│   │   │   ├── FileUpload.tsx
│   │   │   └── QRDisplay.tsx       # VietQR img + fallback
│   │   └── domain/                 # Domain-specific reusable
│   │       ├── PenaltyCard.tsx
│   │       ├── LeaveBadge.tsx
│   │       ├── FundToast.tsx
│   │       └── AuditDiff.tsx       # Old/New value diff view
│   │
│   ├── 📁 hooks/                   # Custom React hooks
│   │   ├── useAuth.ts              # Auth state + login/logout
│   │   ├── useSupabase.ts          # Supabase client singleton
│   │   ├── useRealtime.ts          # Subscribe postgres_changes
│   │   ├── usePenalty.ts           # CRUD + realtime penalty
│   │   ├── useLeave.ts             # CRUD leave requests
│   │   ├── useFund.ts              # Read-only fund + filter
│   │   ├── useAudit.ts             # Audit log query
│   │   ├── useOffline.ts           # Online/offline status + IndexedDB
│   │   └── useNotification.ts      # Push + in-app notification
│   │
│   ├── 📁 stores/                  # Zustand stores
│   │   ├── authStore.ts            # User, JWT, roles
│   │   ├── uiStore.ts              # Theme, sidebar, toast queue
│   │   └── notificationStore.ts    # Unread count, in-app noti list
│   │
│   ├── 📁 api/                     # API layer (React Query wrappers)
│   │   ├── supabase.ts             # Client init + interceptors
│   │   ├── auth.api.ts
│   │   ├── checkin.api.ts
│   │   ├── penalty.api.ts
│   │   ├── leave.api.ts
│   │   ├── fund.api.ts
│   │   ├── audit.api.ts
│   │   └── notification.api.ts
│   │
│   ├── 📁 lib/                     # Utilities + configs
│   │   ├── utils.ts                # cn() (clsx + tailwind-merge), formatters
│   │   ├── constants.ts            # App constants (radius, tiers, thresholds)
│   │   ├── validators.ts           # Zod schemas reusable
│   │   └── permissions.ts          # Role-based permission matrix
│   │
│   ├── 📁 types/                   # TypeScript types
│   │   ├── database.ts             # Generated từ Supabase
│   │   ├── api.ts                  # API request/response types
│   │   ├── enums.ts                # Union types: Status, Role, Source
│   │   └── index.ts                # Barrel export
│   │
│   ├── 📁 db/                      # IndexedDB (offline support)
│   │   ├── index.ts                # idb init
│   │   ├── checkins.store.ts
│   │   ├── sync-queue.store.ts
│   │   └── offline.types.ts
│   │
│   ├── 📁 workers/                 # Web Workers
│   │   └── sync.worker.ts          # Background sync
│   │
│   └── 📁 assets/                  # Static assets
│       ├── icons/
│       ├── images/
│       └── sounds/
│
├── 📁 public/
│   ├── manifest.json               # PWA manifest
│   ├── sw.js                       # Custom SW (nếu cần override)
│   ├── version.json                # App version check
│   └── banks.json                  # Cache ngân hàng (fallback)
│
├── 📁 docs/                        # Tài liệu (đã hoàn thành)
│   ├── phase1-core-checkin.md
│   ├── phase2-payment-fund.md
│   ├── phase3-leave-management.md
│   ├── phase4-accounting-fund.md
│   ├── phase5-advanced-polish.md
│   └── codebase-decision.md        # File này
│
├── index.html
├── vite.config.ts                  # Vite + PWA plugin config
├── tailwind.config.ts
├── tsconfig.json
├── .eslintrc.cjs
├── .prettierrc
├── .env.example
└── package.json
```

### 2.2 Quy tắc thư mục (React-specific)

| Quy tắc | Giải thích |
|---------|------------|
| **1 page = 1 folder** | Mỗi page có component chính + hook + schema + test riêng. Không gộp nhiều page vào 1 file. |
| **Components phân cấp** | `ui/` (primitive) → `common/` (composite) → `domain/` (business). Không import ngược từ domain xuống page. |
| **Hooks tách biệt logic** | Business logic không để trong component. Tách thành custom hook (`usePenalty`, `useLeave`). |
| **API layer tập trung** | Mọi gọi Supabase nằm trong `api/*.api.ts`. Component chỉ dùng React Query hook. |
| **Types auto-generated** | `database.ts` từ `supabase gen types typescript`. Không viết tay type cho DB schema. |
| **Constants không magic number** | Mọi giá trị cứng (radius, threshold, timeout) để trong `constants.ts`. |

---

## 3. Naming Conventions

### 3.1 React / TypeScript

| Thực thể | Convention | Ví dụ |
|----------|------------|-------|
| **File/Folder** | `PascalCase` cho component, `kebab-case` cho util | `PenaltyList.tsx`, `use-auth.ts` |
| **Component** | `PascalCase` | `PenaltyCard`, `FundDashboard` |
| **Hook** | `use` + `PascalCase` | `usePenalty`, `useRealtime` |
| **Zustand store** | `camelCase` + `Store` | `authStore`, `uiStore` |
| **API function** | `camelCase` + domain | `fetchPenaltyList`, `createLeaveRequest` |
| **Type/Interface** | `PascalCase` | `PenaltyTicket`, `LeaveRequest` |
| **Enum/Union** | `PascalCase` | `PaymentStatus`, `UserRole` |
| **Constant** | `SCREAMING_SNAKE_CASE` | `CHECKIN_RADIUS`, `WITHDRAW_THRESHOLD` |
| **Boolean variable** | Prefix `is`, `has`, `can` | `isLoading`, `hasPermission`, `canWaive` |
| **Event handler** | `handle` + `EventName` | `handleSubmit`, `handleApprove` |
| **CSS class (Tailwind)** | Không custom class nếu Tailwind đủ | Dùng `cn()` utility để merge class |

### 3.2 Database (PostgreSQL)

| Thực thể | Convention | Ví dụ |
|----------|------------|-------|
| **Table** | `snake_case`, số nhiều | `penalty_tickets`, `leave_requests` |
| **Column** | `snake_case` | `user_id`, `created_at` |
| **PK** | `id`, UUID | `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` |
| **FK** | `<table>_id` | `ticket_id`, `approver_id` |
| **Index** | `idx_<table>_<columns>` | `idx_penalty_tickets_status` |
| **RPC** | `snake_case`, động từ đầu | `process_payment`, `approve_leave` |
| **View** | `<name>_view` | `fund_balance_total` |
| **Trigger** | `trg_<table>_<event>` | `trg_penalty_tickets_updated_at` |

### 3.3 Edge Functions (Deno)

| Thực thể | Convention | Ví dụ |
|----------|------------|-------|
| **Folder** | `kebab-case` | `sepay-webhook/`, `send-push/` |
| **Entry** | `index.ts` | Bắt buộc |
| **Env var** | `SCREAMING_SNAKE_CASE` | `SEPAY_WEBHOOK_SECRET` |
| **Response** | Luôn JSON, có `success` | `Response.json({ success: true, data })` |

---

## 4. Clean Code Rules

### 4.1 React Components

| Quy tắc | Giải thích | Ví dụ |
|---------|------------|-------|
| **Single Responsibility** | 1 component làm 1 việc. Tách UI và logic. | ❌ Component vừa fetch vừa render vừa validate → ✅ Tách `usePenalty` + `PenaltyList` |
| **Max 150 dòng/component** | Dài hơn → tách sub-component hoặc hook. | |
| **Props tối đa 5** | Nhiều hơn → dùng context hoặc compound component. | |
| **Không prop drilling > 2 level** | Dùng Zustand hoặc React Context. | |
| **useEffect chỉ cho side effect** | Không dùng useEffect để compute state. Dùng `useMemo`. | |
| **Key đúng khi render list** | Không dùng index làm key. Dùng `id` thực. | `{tickets.map(t => <PenaltyCard key={t.id} />)}` |

### 4.2 Hooks

| Quy tắc | Giải thích |
|---------|------------|
| **Tên bắt đầu bằng `use`** | Bắt buộc theo React convention. |
| **Không gọi hook conditionally** | `if (condition) useHook()` → ❌. Luôn gọi ở top level. |
| **Hook tự cleanup** | `useEffect` return cleanup function (unsubscribe realtime, clear timeout). |
| **Không logic nặng trong useEffect** | Tách thành async function bên ngoài, gọi trong useEffect. |

### 4.3 TypeScript

| Quy tắc | Giải thích |
|---------|------------|
| **Strict mode bật** | `strict: true` trong tsconfig. Không dùng `any`. |
| **Dùng `unknown` thay `any`** | Khi type không xác định, ép kiểu sau khi check. |
| **Type inference khi rõ ràng** | Không cần annotate type khi TypeScript tự suy ra. |
| **Export type từ API layer** | Mọi response type định nghĩa ở `api/*.api.ts`. |

### 4.4 SQL / PostgreSQL — Giữ nguyên

| Quy tắc | Giải thích |
|---------|------------|
| Không `SELECT *` | Liệt kê cột cần. Tránh lấy thừa dữ liệu nhạy cảm. |
| **Parameterized query** | Supabase client tự động. Không nối string SQL. |
| **RLS mọi bảng** | Bảng nào cũng phải có Row-Level Security (RLS) policy. |
| **Soft delete / Append-only** | Không `DELETE` data quan trọng. Dùng `deleted_at` hoặc status. Audit log append-only. |
| **Atomic RPC (Remote Procedure Call) ** | Nhiều thao tác dữ liệu liên quan → RPC function với transaction, gom lại chạy trong một transaction (giao dịch) duy nhất. |

### 4.5 Error Handling

| Quy tắc | Giải thích | Pattern |
|---------|------------|---------|
| **Không bắt lỗi chung** | Không `catch (e) { console.log(e) }`. Xử lý cụ thể. | `catch (e) { if (e.code === 'P0001') { ... } }` |
| **Error boundary** | React Error Boundary cho mỗi route chính. | `<Route element={<ErrorBoundary><Page /></ErrorBoundary>} />` |
| **Consistent error format** | API trả `{ success: false, error: 'MESSAGE', code: 'CODE' }` | |
| **Không leak sensitive info** | Client thấy: "Payment failed". Server log: chi tiết. | |

### 4.6 Comments

| Quy tắc | Giải thích |
|---------|------------|
| **Không comment những gì code đã nói** | ❌ `// Tăng count` → `count++` đã rõ. |
| **Comment "tại sao"** | ✅ `// Sepay id=0 là test payload, skip HMAC để dev test` |
| **JSDoc cho public API/hook** | Mọi hook export, util export đều có JSDoc. |
| **TODO có issue number** | `// TODO(#42): Refactor khi có hơn 3 chi nhánh` |

---

## 5. Database Conventions

### 5.1 Migration workflow

```bash
# 1. Dev local
supabase start
supabase db reset
supabase migration new add_leave_table
# Sửa file migrations/007_add_leave_table.sql
supabase db push

# 2. Deploy production
supabase link --project-ref <ref>
supabase db push
```

### 5.2 Migration rules

| Quy tắc | Giải thích |
|---------|------------|
| **Không sửa migration đã apply** | Đã apply production → tạo migration mới để ALTER. |
| **Idempotent** | Chạy 2 lần không lỗi. Dùng `IF NOT EXISTS`, `CREATE OR REPLACE`. |
| **Không DROP data** | Không `DROP TABLE` có data. Dùng `ALTER` hoặc soft delete. |

### 5.3 RLS Policy template

```sql
-- Pattern cho mọi bảng
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- User xem của mình
CREATE POLICY "User view own data"
ON table_name FOR SELECT
USING (auth.uid() = user_id);

-- Manager xem team
CREATE POLICY "Manager view team"
ON table_name FOR SELECT
USING (auth.jwt() ->> 'role' = 'manager');

-- Multi-role check (Phase 5)
CREATE POLICY "Accountant or Manager"
ON table_name FOR SELECT
USING (auth.jwt() -> 'roles' ?| array['accountant', 'manager']);

-- Admin full access
CREATE POLICY "Admin full access"
ON table_name FOR ALL
USING (auth.jwt() -> 'roles' ? 'admin');
```

### 5.4 RPC Function template 

```sql
CREATE OR REPLACE FUNCTION action_entity(
  p_entity_id UUID,
  p_actor_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_entity RECORD;
BEGIN
  -- 1. Validate input
  IF p_reason IS NOT NULL AND LENGTH(TRIM(p_reason)) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reason too short');
  END IF;

  -- 2. Lock row
  SELECT * INTO v_entity FROM table_name WHERE id = p_entity_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not found');
  END IF;

  -- 3. Check state
  IF v_entity.status != 'EXPECTED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid state');
  END IF;

  -- 4. Update
  UPDATE table_name SET status = 'NEW', updated_at = NOW() WHERE id = p_entity_id;

  -- 5. Audit log
  INSERT INTO audit_logs (...) VALUES (...);

  -- 6. Return
  RETURN jsonb_build_object('success', true);
END;
$$;
```

---

## 6. API Conventions

### 6.1 REST (PostgREST)

| Quy tắc | Giải thích |
|---------|------------|
| **Dùng RPC cho business logic** | Không để client UPDATE/INSERT trực tiếp bảng phức tạp. Gọi RPC để atomic + audit. |
| **Pagination mặc định** | `?limit=50&offset=0`. Không load > 100 record. |
| **Filter PostgREST syntax** | `?status=eq.UNPAID`, `?created_at=gte.2026-08-01`. |

### 6.2 React Query conventions

```typescript
// Query key phân cấp
const penaltyKeys = {
  all: ['penalty'] as const,
  lists: () => [...penaltyKeys.all, 'list'] as const,
  list: (filters: Filter) => [...penaltyKeys.lists(), filters] as const,
  details: () => [...penaltyKeys.all, 'detail'] as const,
  detail: (id: string) => [...penaltyKeys.details(), id] as const,
};

// Hook pattern
export function usePenaltyList(filters: Filter) {
  return useQuery({
    queryKey: penaltyKeys.list(filters),
    queryFn: () => fetchPenaltyList(filters),
    staleTime: 5 * 60 * 1000, // 5 phút
  });
}

// Mutation pattern
export function useWaivePenalty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: waivePenaltyApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: penaltyKeys.lists() });
    },
  });
}
```

### 6.3 Edge Function Response

```typescript
// Success
{ success: true, data: { ... } }

// Error
{ success: false, error: 'Human readable', code: 'ERROR_CODE' }

// Validation error
{ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', 
  details: { field: 'reason', message: 'Min 10 chars' } }
```

---

## 7. Git Workflow

### 7.1 Branching: GitHub Flow

```
main (production)
  ├── feature/phase-2-payment
  ├── feature/phase-3-leave
  ├── hotfix/hmac-verify-race
  └── refactor/quota-calculation
```

### 7.2 Commit message (Conventional Commits)

```
<type>(<scope>): <subject>

<body>

<footer>
```

| Type | Dùng khi | Ví dụ |
|------|----------|-------|
| `feat` | Tính năng mới | `feat(penalty): add cash payment flow` |
| `fix` | Sửa lỗi | `fix(webhook): dedup sepay_id race condition` |
| `refactor` | Cải tiến code | `refactor(quota): extract carry over logic` |
| `docs` | Tài liệu | `docs(api): update Phase 2 endpoints` |
| `test` | Thêm test | `test(leave): add quota boundary cases` |
| `chore` | Công việc lặt vặt | `chore(deps): update supabase-js` |
| `security` | Bảo mật | `security(auth): add rate limiting` |

### 7.3 PR Template

```markdown
## Mô tả
## Loại thay đổi
- [ ] Bug fix / [ ] Tính năng mới / [ ] Refactor / [ ] Docs
## Test
- [ ] Đã test local / [ ] Đã test Supabase local / [ ] Test case mới
## Checklist
- [ ] RLS policy đã cập nhật
- [ ] Migration mới đã chạy local
- [ ] Không magic number
- [ ] Error handling đầy đủ
- [ ] Audit log đã ghi (nếu cần)
```

---

## 8. Testing Rules

### 8.1 Test pyramid

```
     /  E2E  \      ← 10%: Playwright (flow quan trọng)
    /   API   \     ← 30%: Supabase test / Postman
   /    Unit   \    ← 60%: Vitest (logic, hook, util)
```
### 8.2 Test conventions

| Quy tắc | Giải thích |
|---------|------------|
| **Test cạnh source** | `PenaltyList.tsx` → `PenaltyList.test.tsx` |
| **Tên rõ ràng** | `it('should create penalty when check-in is late')` |
| **Arrange-Act-Assert** | Chuẩn bị → Hành động → Kiểm tra |
| **Mock external** | Mock Supabase client, navigator.geolocation, fetch |
| **Test hook với `@testing-library/react`** | `renderHook(() => usePenalty())` |

### 8.3 E2E Demo Flow (Playwright)

```typescript
test('Demo: late check-in → penalty → payment → clear', async () => {
  await page.goto('/checkin');
  await page.click('#btn-checkin-gps');
  await page.waitForSelector('.penalty-created');

  await page.click('#nav-penalty');
  await expect(page.locator('.penalty-amount')).toHaveText('20,000đ');

  await page.click('#btn-pay');
  await expect(page.locator('.qr-image')).toBeVisible();

  await mockSepayWebhook({ transactionId: 'A7B3C9D2', amount: 20000 });
  await page.waitForSelector('.payment-success', { timeout: 10000 });
});
```

---

## 9. Security Rules

### 9.1 Checklist mọi commit

```
□ Không hardcode secret (env var)
□ Không log sensitive data (password, token, sepay secret)
□ RLS policy đã test (dùng user khác roles thử query)
□ Input validated (Zod schema, min/max length)
□ SQL injection: parameterized query
□ XSS: DOMPurify cho user input render HTML
□ HTTPS: mọi endpoint production HTTPS
□ CORS: chỉ cho phép domain công ty
□ Rate limit: API 100/phút, webhook 10/phút, auth 5/5phút
□ HMAC verify: raw body, constant-time compare, anti-replay
```

### 9.2 Env var template

```bash
# Frontend (Vite: prefix VITE_)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_APP_VERSION=1.0.0

# Backend (Edge Function env)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SEPAY_WEBHOOK_SECRET=your-sepay-secret
FCM_SERVER_KEY=your-fcm-key
RESEND_API_KEY=your-resend-key
```

### 9.3 Secret management

| Môi trường | Cách lưu |
|------------|----------|
| Local dev | `.env` (không commit, có `.env.example`) |
| Vercel | Project Environment Variables |
| Edge Function | `supabase secrets set KEY=VALUE` |
| CI/CD | GitHub Secrets |

---

## 10. Performance Rules

| Quy tắc | Cách làm | Target |
|---------|----------|--------|
| **FCP** | Lazy load route, code split | < 1.5s |
| **TTI** | Preload critical route | < 3s |
| **API p95** | Index đúng, pagination | < 200ms |
| **Bundle** | Tree shake, dynamic import | < 200KB gzipped |
| **Image** | WebP, lazy loading | |
| **Cache** | React Query cache, Service Worker | stale-while-revalidate |
| **Realtime** | Unsubscribe khi unmount | Tránh leak memory |

---

## 11. Code Review Checklist

```
□ Code đúng convention (React, TS, DB)
□ Không magic number / hardcode
□ Error handling đầy đủ, không silent catch
□ Không console.log (dùng logger)
□ TypeScript strict, không any
□ RLS policy đã cập nhật (nếu đổi DB)
□ Migration mới đã tạo
□ Audit log đã ghi (nếu action nhạy cảm)
□ Test đã viết / cập nhật
□ Không leak secret
□ Performance: không N+1, có pagination
□ React: key đúng, useEffect cleanup, không prop drilling
```

---

> **Tài liệu này là living document.** Cập nhật khi team đồng thuận. Mọi dev mới vào phải đọc trước khi code.
