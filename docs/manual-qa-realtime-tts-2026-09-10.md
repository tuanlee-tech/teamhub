# Manual QA Realtime/TTS 2026-09-10

## Mục Tiêu

Bạn tự mở browser để kiểm thử realtime UI/TTS. Vì webhook thanh toán chưa làm xong, các event payment/fine/allocation/fund được giả lập bằng SQL insert/update/delete trực tiếp trên database.

Kết quả QA sẽ quyết định có chuyển B04-B08 từ `REVIEW`/`HOLD_MANUAL_QA` sang `DONE_VERIFIED` hay không.

## Chuẩn Bị

- Chạy app local hoặc môi trường deploy đang trỏ đúng Supabase DB đã apply migration B01.
- Mở DevTools Console và Network cho ít nhất tab kiosk và tab đang test QR/payment.
- Đảm bảo browser cho phép audio/autoplay sau một click/tap trên kiosk nếu test TTS.
- Giữ fine tạm `FTMPV8YVR1` nếu còn cần test owner QR; cleanup sau QA.

## Tài Khoản Test

Manager:

```text
username: tuanlexor
password: Tuan1234!
```

Member test:

```text
email: thanh.ho@test.com
password: Test1234!
```

Non-owner member test:

```text
email: phuoc.nguyen@test.com
password: Test1234!
```

## Các Tab Cần Mở

Mở đồng thời các tab sau. Nếu cần nhiều session khác nhau, dùng profile browser/incognito riêng.

- Manager: `/late?tab=unpaid`
- Manager: `/late?tab=paid`
- Manager hoặc kiosk account: `/kiosk?tab=checkin`
- Manager hoặc kiosk account: `/kiosk?tab=late`
- Member owner: `/member`
- Member owner: `/fines?tab=unpaid`
- Member owner: `/fines?tab=history`
- Member owner: `/fines/FTMPV8YVR1` hoặc fine detail đang test

## Quy Tắc Quan Sát

- Không refresh thủ công sau khi SQL mutation, trừ khi checklist ghi rõ test reload/reconnect.
- Chờ tối đa 3 giây sau mỗi mutation để realtime tới client.
- Nếu UI không đổi, ghi lại Console logs và Network requests.
- Nếu TTS không đọc, kiểm tra local mute toggle, Settings enabled events và quiet hours trước khi ghi defect.
- Snapshot/reconnect được phép refresh dữ liệu nhưng không được phát lại TTS lịch sử.

## Checklist 1: QR Permission

### Manager mở QR fine người khác

1. Login manager `tuanlexor`.
2. Mở `/late?tab=unpaid`.
3. Tìm fine `FTEST01` hoặc fine unpaid của member khác.
4. Xác nhận thấy nút `Phóng lớn QR phiếu`.
5. Click nút QR.

Expected:

- Modal `QR thanh toán` mở.
- QR image load thành công.
- Network `/api/vietqr/<fineCode>?amount=<outstanding>` trả `302`, không phải `404`.

### Member thường không mở QR fine người khác

1. Login non-owner `phuoc.nguyen@test.com`.
2. Mở `/late?tab=unpaid`.
3. Tìm `FTEST01` hoặc fine của người khác.

Expected:

- Có thể thấy late row nếu RPC cho phép hiển thị danh sách trễ.
- Không thấy nút `Phóng lớn QR phiếu`.
- Gọi trực tiếp `/api/vietqr/FTEST01?amount=100000` trả `404`.

### Owner mở QR fine của chính mình

1. Login `thanh.ho@test.com`.
2. Mở `/fines/FTMPV8YVR1`.
3. Quan sát QR panel.

Expected:

- QR image load thành công.
- `/api/vietqr/FTMPV8YVR1?amount=100000` trả `302`.

## Checklist 2: Check-In Realtime

Thực hiện bằng QR/OTP/GPS thật nếu có thể. Nếu chỉ giả lập SQL, dùng insert/update tương ứng vào bảng `attendance_records`, `fines`, `check_in_attempts` để trigger Broadcast.

### Thành công đúng giờ

SQL giả lập. Đổi `v_username` nếu muốn test member khác.

```sql
do $$
declare
  v_username text := 'thanh.ho';
  v_org_id uuid;
  v_user_id uuid;
  v_timezone text;
  v_work_date date;
  v_day_id uuid;
  v_roster_id uuid;
  v_record_id uuid;
begin
  select profiles.user_id into v_user_id
  from public.profiles
  where profiles.username = v_username;

  if v_user_id is null then
    raise exception 'Missing profile username=%', v_username;
  end if;

  select members.organization_id into v_org_id
  from public.organization_members members
  where members.user_id = v_user_id
    and members.status = 'active'
    and members.is_active = true
  limit 1;

  if v_org_id is null then
    raise exception 'Missing active membership username=%', v_username;
  end if;

  select coalesce(settings.timezone, 'Asia/Ho_Chi_Minh') into v_timezone
  from public.organization_settings settings
  where settings.organization_id = v_org_id;
  v_timezone := coalesce(v_timezone, 'Asia/Ho_Chi_Minh');
  v_work_date := (now() at time zone v_timezone)::date;

  insert into public.attendance_days (
    organization_id,
    work_date,
    timezone,
    session_start_at,
    session_end_at,
    valid_check_in_at,
    auto_late_at,
    status,
    roster_generated_at
  )
  values (
    v_org_id,
    v_work_date,
    v_timezone,
    ((v_work_date::text || ' 08:00:00')::timestamp at time zone v_timezone),
    ((v_work_date::text || ' 18:00:00')::timestamp at time zone v_timezone),
    ((v_work_date::text || ' 09:00:00')::timestamp at time zone v_timezone),
    ((v_work_date::text || ' 09:30:00')::timestamp at time zone v_timezone),
    'open',
    now()
  )
  on conflict (organization_id, work_date) do update
  set roster_generated_at = coalesce(public.attendance_days.roster_generated_at, excluded.roster_generated_at)
  returning id into v_day_id;

  insert into public.daily_roster (organization_id, attendance_day_id, user_id, is_required)
  values (v_org_id, v_day_id, v_user_id, true)
  on conflict (attendance_day_id, user_id) do update
  set is_required = true
  returning id into v_roster_id;

  insert into public.attendance_records (
    organization_id,
    attendance_day_id,
    roster_id,
    user_id,
    state,
    checked_in_at,
    marked_late_at,
    check_in_method,
    late_minutes,
    fine_amount_snapshot
  )
  values (
    v_org_id,
    v_day_id,
    v_roster_id,
    v_user_id,
    'on_time',
    now(),
    null,
    'qr',
    0,
    0
  )
  on conflict (attendance_day_id, user_id) do update
  set state = 'on_time',
      checked_in_at = excluded.checked_in_at,
      marked_late_at = null,
      check_in_method = 'qr',
      late_minutes = 0,
      fine_amount_snapshot = 0,
      updated_at = now()
  returning id into v_record_id;

  insert into public.check_in_attempts (
    organization_id,
    attendance_day_id,
    user_id,
    method,
    succeeded,
    rejection_reason,
    server_received_at
  )
  values (v_org_id, v_day_id, v_user_id, 'qr', true, null, now());

  raise notice 'Simulated on-time check-in username=%, work_date=%, record_id=%', v_username, v_work_date, v_record_id;
end $$;
```

Expected:

- Kiosk activity feed thêm lượt mới.
- Kiosk rotate QR/OTP một lần.
- `/member` của đúng user cập nhật checked-in state.
- `/late` không thêm row trễ nếu đúng giờ.
- TTS đọc nếu `on_time` enabled và không trong quiet hours.

### Thành công trễ

SQL giả lập check-in trễ và fine unpaid. Đổi `v_username` nếu muốn test member khác.

```sql
do $$
declare
  v_username text := 'tuong.vi';
  v_amount_vnd bigint := 100000;
  v_org_id uuid;
  v_user_id uuid;
  v_timezone text;
  v_work_date date;
  v_day_id uuid;
  v_roster_id uuid;
  v_record_id uuid;
  v_fine_id uuid;
  v_fine_code text;
begin
  select profiles.user_id into v_user_id
  from public.profiles
  where profiles.username = v_username;

  if v_user_id is null then
    raise exception 'Missing profile username=%', v_username;
  end if;

  select members.organization_id into v_org_id
  from public.organization_members members
  where members.user_id = v_user_id
    and members.status = 'active'
    and members.is_active = true
  limit 1;

  if v_org_id is null then
    raise exception 'Missing active membership username=%', v_username;
  end if;

  select coalesce(settings.timezone, 'Asia/Ho_Chi_Minh') into v_timezone
  from public.organization_settings settings
  where settings.organization_id = v_org_id;
  v_timezone := coalesce(v_timezone, 'Asia/Ho_Chi_Minh');
  v_work_date := (now() at time zone v_timezone)::date;

  insert into public.attendance_days (
    organization_id,
    work_date,
    timezone,
    session_start_at,
    session_end_at,
    valid_check_in_at,
    auto_late_at,
    status,
    roster_generated_at
  )
  values (
    v_org_id,
    v_work_date,
    v_timezone,
    ((v_work_date::text || ' 08:00:00')::timestamp at time zone v_timezone),
    ((v_work_date::text || ' 18:00:00')::timestamp at time zone v_timezone),
    ((v_work_date::text || ' 09:00:00')::timestamp at time zone v_timezone),
    ((v_work_date::text || ' 09:30:00')::timestamp at time zone v_timezone),
    'open',
    now()
  )
  on conflict (organization_id, work_date) do update
  set roster_generated_at = coalesce(public.attendance_days.roster_generated_at, excluded.roster_generated_at)
  returning id into v_day_id;

  insert into public.daily_roster (organization_id, attendance_day_id, user_id, is_required)
  values (v_org_id, v_day_id, v_user_id, true)
  on conflict (attendance_day_id, user_id) do update
  set is_required = true
  returning id into v_roster_id;

  insert into public.attendance_records (
    organization_id,
    attendance_day_id,
    roster_id,
    user_id,
    state,
    checked_in_at,
    marked_late_at,
    check_in_method,
    late_minutes,
    fine_amount_snapshot
  )
  values (
    v_org_id,
    v_day_id,
    v_roster_id,
    v_user_id,
    'late',
    now(),
    now(),
    'otp',
    15,
    v_amount_vnd
  )
  on conflict (attendance_day_id, user_id) do update
  set state = 'late',
      checked_in_at = excluded.checked_in_at,
      marked_late_at = excluded.marked_late_at,
      check_in_method = 'otp',
      late_minutes = 15,
      fine_amount_snapshot = v_amount_vnd,
      updated_at = now()
  returning id into v_record_id;

  v_fine_code := 'FQA' || upper(substr(md5(v_user_id::text || v_record_id::text || clock_timestamp()::text), 1, 8));

  insert into public.fines (
    organization_id,
    attendance_record_id,
    user_id,
    code,
    amount_vnd,
    status,
    paid_at,
    waived_at,
    waiver_reason
  )
  values (
    v_org_id,
    v_record_id,
    v_user_id,
    v_fine_code,
    v_amount_vnd,
    'unpaid',
    null,
    null,
    null
  )
  on conflict (attendance_record_id) do update
  set amount_vnd = excluded.amount_vnd,
      status = 'unpaid',
      paid_at = null,
      waived_at = null,
      waived_by = null,
      waiver_reason = null,
      updated_at = now()
  returning id, code into v_fine_id, v_fine_code;

  insert into public.check_in_attempts (
    organization_id,
    attendance_day_id,
    user_id,
    method,
    succeeded,
    rejection_reason,
    server_received_at
  )
  values (v_org_id, v_day_id, v_user_id, 'otp', true, null, now());

  raise notice 'Simulated late check-in username=%, work_date=%, fine_code=%, fine_id=%', v_username, v_work_date, v_fine_code, v_fine_id;
end $$;
```

Expected:

- Kiosk feed thêm lượt mới.
- Kiosk late list reload đúng ngày.
- `/late?tab=unpaid` hiện row hoặc cập nhật row.
- `/fines?tab=unpaid` của owner hiện fine mới.
- `/member` owner cập nhật outstanding.
- TTS đọc thông báo trễ nếu `late` enabled.

### Thất bại

SQL giả lập attempt thất bại. Không tạo/update attendance record hay fine.

```sql
do $$
declare
  v_username text := 'phuoc.nguyen';
  v_org_id uuid;
  v_user_id uuid;
begin
  select profiles.user_id into v_user_id
  from public.profiles
  where profiles.username = v_username;

  if v_user_id is null then
    raise exception 'Missing profile username=%', v_username;
  end if;

  select members.organization_id into v_org_id
  from public.organization_members members
  where members.user_id = v_user_id
    and members.status = 'active'
    and members.is_active = true
  limit 1;

  if v_org_id is null then
    raise exception 'Missing active membership username=%', v_username;
  end if;

  insert into public.check_in_attempts (
    organization_id,
    attendance_day_id,
    user_id,
    method,
    succeeded,
    rejection_reason,
    server_received_at
  )
  values (
    v_org_id,
    null,
    v_user_id,
    'otp',
    false,
    'manual_qa_invalid_otp',
    now()
  );

  raise notice 'Simulated failed check-in username=%', v_username;
end $$;
```

Expected:

- Kiosk feed/toast hiển thị thất bại.
- Không rotate QR/OTP.
- Không TTS.
- `/member`, `/fines`, `/late` không refresh sai user/ngày.

## Checklist 3: Payment/Fine Realtime Bằng SQL

Chọn một fine unpaid đang mở ở modal/detail. Ưu tiên dùng fine tạm `FTMPV8YVR1` hoặc fine test khác.

### Fine chuyển paid

Giả lập SQL theo schema thực tế, ví dụ:

```sql
update public.fines
set status = 'paid',
    paid_at = now(),
    waived_at = null,
    waived_by = null,
    waiver_reason = null
where code = '<FINE_CODE>';
```

Expected:

- Fine detail đổi trạng thái ngay.
- Payment QR panel chuyển hết nợ hoặc không còn QR cũ.
- `/fines?tab=unpaid` mất item, `/fines?tab=history` có item.
- `/late?tab=unpaid` chuyển item sang paid tab hoặc badge `Đã trả`.
- Kiosk late list cập nhật.
- TTS kiosk đọc payment một lần nếu `payment` enabled.

### Fine chuyển waived

```sql
update public.fines
set status = 'waived',
    paid_at = null,
    waived_at = now(),
    waived_by = '<MANAGER_USER_ID>',
    waiver_reason = 'Manual QA'
where code = '<FINE_CODE>';
```

Expected:

- UI chuyển miễn/paid-off tùy màn.
- QR biến mất.
- Không đọc TTS payment.

## Checklist 4: Allocation/Fund Realtime Bằng SQL

Nếu fine vẫn unpaid, tạo fund transaction và allocation test.

```sql
insert into public.fund_transactions (
  organization_id,
  direction,
  source,
  amount_vnd,
  occurred_at,
  description,
  reconciliation_status,
  created_by
)
values (
  '<ORG_ID>',
  'incoming',
  'manual',
  50000,
  now(),
  'Manual QA allocation',
  'matched',
  '<MANAGER_USER_ID>'
)
returning id;
```

```sql
insert into public.fine_allocations (
  organization_id,
  fund_transaction_id,
  fine_id,
  amount_vnd,
  allocated_by
)
values (
  '<ORG_ID>',
  '<FUND_TRANSACTION_ID>',
  '<FINE_ID>',
  50000,
  '<MANAGER_USER_ID>'
)
returning id;
```

Expected:

- Outstanding giảm đúng trên `/member`, `/fines`, `/late`, fine detail và QR modal.
- QR image URL đổi theo amount mới.
- Nếu outstanding về 0, unpaid item chuyển sang paid/history logic theo contract.

### Delete allocation

```sql
delete from public.fine_allocations
where id = '<ALLOCATION_ID>';
```

Expected:

- Outstanding tăng lại đúng.
- Realtime vẫn hoạt động dù `entity_id`/`allocation_id` của delete event là null.

### Void fund

```sql
update public.fund_transactions
set voided_at = now(), voided_by = '<MANAGER_USER_ID>', void_reason = 'Manual QA void'
where id = '<FUND_TRANSACTION_ID>';
```

Expected:

- Allocation không còn được tính effective.
- Outstanding tăng lại đúng trên mọi màn.
- Không cần refresh thủ công.

## Checklist 5: TTS Settings Realtime

1. Mở kiosk và bật local audio toggle.
2. Vào `/manager/settings`, đổi từng cấu hình TTS.
3. Lưu Settings.
4. Tạo event check-in/fine kế tiếp.

Expected:

- Kiosk nhận `tts-settings-status` và dùng config mới cho event tiếp theo.
- Đổi `locale`, `preferred_voice`, `speech_rate`, `speech_pitch` ảnh hưởng câu test và event thật.
- Tắt event trong `enabled_events`: UI vẫn update nhưng không đọc.
- Bật quiet hours bao phủ giờ hiện tại: UI update nhưng không đọc.
- Mute local: không đọc nhưng feed/toast/reload vẫn chạy.
- Speech API thiếu/lỗi: không phá UI.

## Checklist 6: Reconnect Và Dedup

1. Mở kiosk/member/fines/late/detail.
2. Tắt mạng tab hoặc sleep browser nếu có thể.
3. Thực hiện SQL mutation khi tab đang offline.
4. Bật mạng lại hoặc reload tab.

Expected:

- Snapshot cập nhật trạng thái mới nhất.
- Không phát lại TTS lịch sử.
- Không duplicate feed/toast.
- QR/late/payment modal không giữ dữ liệu cũ.

## Mẫu Báo Lỗi

```text
Defect:
Route/tab:
User/session:
Fine code/user/date:
Steps:
Expected:
Actual:
Console logs:
Network logs:
SQL mutation đã chạy:
Related batch owner:
Severity:
```

Batch owner mapping:

- B01: database trigger/payload/topic.
- B02: hook subscribe/reconnect/dedup.
- B04: `/member` hoặc `/fines` list.
- B05: `/late` page/modal.
- B06: fine detail/payment QR/API.
- B07: kiosk/TTS/feed/QR rotation.

## Kết Luận QA Cần Ghi

Sau khi test, cập nhật `docs/qa-2026-09-10-realtime-tts.md` theo mẫu:

```text
Manual browser QA:
- QR permission/image: pass/fail
- Check-in realtime: pass/fail
- Payment/fine realtime: pass/fail
- Allocation/fund realtime: pass/fail
- TTS settings realtime: pass/fail
- Reconnect/dedup: pass/fail

Defects:
- ...

Release readiness:
- READY / NOT READY
```

Chỉ chuyển B04-B08 sang `DONE_VERIFIED` khi manual browser/database realtime pass hoặc các rủi ro còn lại được chấp nhận rõ ràng.
