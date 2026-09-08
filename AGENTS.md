# AGENTS.md - Hướng dẫn tái sử dụng UI Atoms

## Hệ thống UI Atoms

Location: `src/components/ui/`

**Luôn import từ `@/components/ui` thay vì tự viết CSS inline.**

```tsx
import { PaperPanel, DisplayHeading, Stamp, FormInput, FormLabel, PrimaryButton, Feedback, DividedList, DividedListItem, CurrencyText, HelpButton } from "@/components/ui";
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
Heading styled với font Impact/Arial Narrow Bold, uppercase.
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
Input chuẩn: h-12, rounded-xl, focus ring signal-red.
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
```

### Feedback
Hiển thị lỗi/thành công từ server action.
```tsx
<Feedback error={state.error} success={state.success} />
```

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

## Color Variables
- `--paper`: #f4f0e6 (background)
- `--ink`: #102a2c (text chính)
- `--ink-soft`: #416064 (text phụ)
- `--signal`: #e14b32 (accent/CTA)
- `--line`: rgba(16,42,44,0.18) (border)

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
  <Feedback error={state.error} success={state.success} />
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
