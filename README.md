# TeamHub

**Smart Attendance, Automated Fines & Team Culture**

Nền tảng điểm danh Kiosk, tự động hóa phạt & quản lý quỹ đội ngũ cho nhóm 5 đến 30 thành viên.

**Repository:** <https://github.com/tuanlee-tech/team-hub>
**Package:** `@teamhub/app`

Đặc tả kỹ thuật và các quyết định đã chốt nằm tại [`documents/plan.md`](documents/plan.md).

## Trạng thái

Foundation hiện có:

- Next.js 16 App Router, React 19, TypeScript và Tailwind CSS 4.
- Giao diện responsive ban đầu cho member, manager và kiosk.
- Google OAuth, email/password, đăng nhập bằng username và pending approval.
- PWA manifest, service worker, offline fallback và Web Push handler.
- Supabase clients cho browser/server.
- Schema PostgreSQL đầy đủ theo domain, RLS, Storage policies và Realtime publication.
- Seed title/rank và message pack cơ bản.
- Unit test cho thời gian, tier phạt, geofence, nội dung chuyển khoản và title.
- GitHub Actions chạy lint, typecheck, test và production build.

Các màn hình điểm danh, cấu hình và kiosk hiện là scaffold. Auth đã kết nối Supabase Hosted; nghiệp vụ còn lại được nối với RPC/Edge Functions ở các milestone tiếp theo.

## Yêu cầu

- Node.js 24 trở lên.
- npm 11 trở lên.
- Docker nếu chạy Supabase local.
- Supabase CLI, có thể chạy qua `npx supabase`.

## Thiết lập local

1. Cài dependency bằng `npm install`.
2. Điền giá trị thật vào `.env.local`. Mẫu biến nằm trong `.env.example`.
3. Chạy Supabase bằng `npx supabase start`.
4. Cập nhật URL và publishable key local từ kết quả `npx supabase status`.
5. Áp migration và seed bằng `npx supabase db reset`.
6. Chạy ứng dụng bằng `npm run dev`.

Supabase local gửi email xác minh vào Mailpit tại URL được in bởi `npx supabase status`.

## Bootstrap manager đầu tiên

Sau khi tài khoản đầu tiên đăng ký và xác minh email, chạy câu lệnh sau trong Supabase SQL Editor với email thực tế:

```sql
update public.organization_members
set
  role = 'manager',
  status = 'active',
  approved_at = now()
where user_id = (
  select id from auth.users where email = 'manager@example.com'
);
```

## Cấu hình Auth Hosted

Trong Google Cloud Console, OAuth Web Client dùng:

```text
Authorized JavaScript origin: http://localhost:3000
Authorized redirect URI: https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

Trong Supabase `Authentication > URL Configuration` dùng:

```text
Site URL: http://localhost:3000
Redirect URL: http://localhost:3000/auth/callback
Redirect URL: http://localhost:3000/auth/continue
```

Email confirmation dùng PKCE. Thay link trong template `Confirm signup` bằng:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}">
  Xác nhận tài khoản
</a>
```

Google provider trong `supabase/config.toml` chỉ dành cho Supabase local. Provider Hosted được cấu hình độc lập trong Supabase Dashboard.

## Biến môi trường

Dùng prefix `TEAMHUB_` cho các biến đặc thù dự án:

| Biến | Mô tả |
|---|---|
| `NEXT_PUBLIC_TEAMHUB_URL` | URL gốc của ứng dụng |
| `TEAMHUB_SEPAY_SECRET` | HMAC secret cho SePay webhook |
| `TEAMHUB_VAPID_PRIVATE_KEY` | Private key cho Web Push |

## Scripts

| Lệnh | Mục đích |
|---|---|
| `npm run dev` | Chạy Next.js local |
| `npm run build` | Tạo production build |
| `npm run lint` | Kiểm tra ESLint |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm test` | Chạy Vitest một lần |
| `npm run test:watch` | Chạy Vitest watch mode |

## Cấu trúc

```text
src/app/                 Next.js routes và PWA metadata
src/components/          UI dùng chung
src/lib/domain/          Logic nghiệp vụ thuần TypeScript
src/lib/supabase/        Supabase browser/server clients
supabase/migrations/     Schema và RLS có version
supabase/functions/      Edge Functions và env mẫu
supabase/seed.sql        Title và TTS templates mặc định
documents/plan.md        Kế hoạch Release 1
```

## Bảo mật

- Không commit `.env.local`, service role key, SePay HMAC secret hoặc VAPID private key.
- Pending user không được đọc dữ liệu nhóm.
- Raw SePay payload, email đăng nhập và GPS audit không nằm trong dữ liệu công khai.
- Check-in, auto-late, đối soát và thay đổi trạng thái fine phải đi qua RPC hoặc Edge Function.
- Kiosk sử dụng phiên manager nên tablet cần screen pinning và tài khoản riêng khi đưa vào vận hành.
