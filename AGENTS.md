# AGENTS.md - Hướng dẫn tái sử dụng UI Atoms

## Hệ thống UI Atoms

Location: `src/components/ui/`

**Luôn import từ `@/components/ui` thay vì tự viết CSS inline.**

```tsx
import { PaperPanel, DisplayHeading, Stamp, FormInput, FormLabel, PrimaryButton, DividedList, DividedListItem, CurrencyText, HelpButton, useToast, useToastFeedback } from "@/components/ui";
```

## Các Atoms hiện có

### PaperPanel
Card container glassmorphism (border, blur, shadow).
```tsx
<PaperPanel className="p-6 sm:p-8">
  {/* content */}
</PaperPanel>
```

### DisplayHeading
Heading styled với font Archivo Narrow (Google Font, hỗ trợ tiếng Việt), uppercase.
```tsx
<DisplayHeading level={3} className="mt-1">Title</DisplayHeading>
{/* level: 1-4, mặc định 3 */}
```

### Stamp
Badge/pill cho status, labels.
```tsx
<Stamp variant="success">Đúng giờ</Stamp>
{/* variant: signal | muted | success | error | warning | info */}
```

### FormInput
Input chuẩn: h-12, rounded-xl, focus ring signal cam.
```tsx
<FormInput name="email" type="email" required placeholder="Email" />
```

### FormLabel
Label cho form fields.
```tsx
<FormLabel>
  Tên field
  <FormInput name="field" />
</FormLabel>
```

### PrimaryButton
Nút chính, tự hiện "Đang lưu..." khi pending.
```tsx
<PrimaryButton>Lưu</PrimaryButton>
{/* fullWidth: true (default), false */}
```

### SecondaryButton
Nút phụ với các variant màu.
```tsx
<SecondaryButton variant="destructive">Xóa</SecondaryButton>
{/* variant: neutral | destructive | positive */}
{/* fullWidth: true (default: false) */}
```

### Toast
Hiển thị thông báo success/error dạng snackbar native, nền đặc và không che khuất nội dung.
```tsx
const { success, error } = useToast();
success("Đã lưu thay đổi.");
error("Không thể lưu thay đổi.");

// Với server action trả về { error?, success? }:
useToastFeedback(state);
```

**Quy tắc bắt buộc cho feature mới:**
- Feedback thành công/thất bại từ thao tác người dùng phải dùng `useToast()` hoặc `useToastFeedback()`.
- Không thêm banner, `<p role="alert">`, state `message/feedback` hoặc component feedback inline mới cho success/error.
- Có thể giữ UI inline cho trạng thái hệ thống liên tục hoặc hướng dẫn cố định, ví dụ offline, loading camera và quyền thiết bị.
- Import Toast từ `@/components/ui`; không tự tạo hệ thống thông báo riêng.

### DividedList / DividedListItem
List với divider giữa các item.
```tsx
<DividedList>
  <DividedListItem>
    <span>Item 1</span>
  </DividedListItem>
  <DividedListItem>
    <span>Item 2</span>
  </DividedListItem>
</DividedList>
```

### CurrencyText
Hiển thị tiền tệ.
```tsx
<CurrencyText amount={10000} className="text-lg" />
{/* variant: "currency" (default) → 10.000₫ | "number" → 10.000 */}
```

### HelpButton
Nút mở product tour hoặc contextual help, có icon dấu hỏi trong vòng tròn.
```tsx
<HelpButton onClick={startTour} />
```

## Color Variables (Dark mode — force dark toàn app)
- `--paper`: #0d1117 (background tối)
- `--paper-deep`: #161b22 (surface đậm hơn)
- `--ink`: #f4f0e6 (text chính, giờ là màu sáng)
- `--ink-soft`: #a9b3b8 (text phụ)
- `--signal`: #f7931a (accent/CTA cam)
- `--signal-dark`: #c77415
- `--white`: #102a2c (surface tối — KHÔNG phải màu trắng thật nữa)
- `--line`: rgba(244,240,230,0.14) (border)

> ⚠️ Lưu ý: app force dark. `--ink` là chữ sáng, `--white` là bề mặt tối.
> Chữ trên nền `--signal` (cam) dùng `--white` (#102a2c) để tương phản.
> Khi thêm UI: `bg-[var(--white)]` cho surface, `text-[var(--ink)]` cho text,
> `bg-[var(--signal)] text-[var(--white)]` cho CTA cam.

## Layout Patterns

### ModuleShell (all authenticated pages)
```tsx
<ModuleShell eyebrow="Label" title="Title" description="Desc">
  {/* content */}
</ModuleShell>
```

### Form Pattern
```tsx
<form action={serverAction} className="paper-panel space-y-6 p-6 sm:p-8">
  <div>
    <p className="text-xs font-black tracking-[0.16em] text-[var(--signal)] uppercase">01 / Category</p>
    <h2 className="display-type mt-2 text-3xl">Title</h2>
  </div>
  <div className="grid gap-4 sm:grid-cols-2">
    <FormLabel>
      Label
      <FormInput name="field" />
    </FormLabel>
  </div>
  <PrimaryButton>Lưu</PrimaryButton>
</form>
```

## Utility Functions
Location: `src/lib/currency.ts`
```tsx
import { formatCurrencyInput, parseCurrencyInput, formatCurrencyDisplay, formatNumber } from "@/lib/currency";
```

## Database Seed & Reset

### Reset database
```bash
npm run db:reset
```
Hoặc chạy `supabase/seed-reset.sql` trên Supabase SQL Editor.

### Seed test members
```bash
# Cần set env vars
export NEXT_PUBLIC_SUPABASE_URL=your_url
export SUPABASE_SERVICE_ROLE_KEY=your_key

npm run db:seed
```

### Clear check-in data hôm nay (test đi test lại)
Xóa sạch dữ liệu check-in của ngày (fines, attendance_records, check_in_attempts,
daily_roster) để test lại từ đầu. Tính `work_date` theo timezone org (mặc định Asia/Ho_Chi_Minh).

> ⚠️ Mặc định là **dry-run** — chỉ cần thêm `clear` để xóa thật (không hoàn tác).

```bash
# Xem sẽ xóa gì (an toàn)
npm run db:clear-checkin

# Xóa thật dữ liệu check-in hôm nay
npm run db:clear-checkin -- clear

# Xóa theo ngày chỉ định
npm run db:clear-checkin -- clear 2026-09-09
```
Script: `supabase/clear-checkin.ts` (tự load `.env.local`, dùng service role key).

### Test accounts
| Email | Password | Display Name |
|---|---|---|
| phuoc.nguyen@test.com | Test1234! | Phước Nguyễn |
| thanh.ho@test.com | Test1234! | Thành Hồ |
| tuong.vi@test.com | Test1234! | Tường Vi |
| quoc.bao@test.com | Test1234! | Quốc Bảo |
| trung.truong@test.com | Test1234! | Trung Trương |
| vu.tran@test.com | Test1234! | Vũ Trần |
| duc.tri@test.com | Test1234! | Đức Trí |
| cuong.nguyen@test.com | Test1234! | Cường Nguyễn |
| duc.nguyen@test.com | Test1234! | Đức Nguyễn |
