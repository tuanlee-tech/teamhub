insert into public.title_definitions (rank, key, title, min_rate, max_rate, include_min)
values
  (0, 'on_time_saint', '🥇 Thánh Đúng Giờ', 0, 0, true),
  (1, 'living_clock', '⏰ Kim Đồng Hồ Sống', 0, 5, false),
  (2, 'almost_late', '😌 Suýt Trễ Nhưng Vẫn Kịp', 5, 10, false),
  (3, 'morning_coffee', '☕ Team Cà Phê Sáng', 10, 20, false),
  (4, 'speeding_turtle', '🐢 Rùa Tăng Tốc', 20, 30, false),
  (5, 'morning_deadline', '🏃 Chạy Deadline Buổi Sáng', 30, 40, false),
  (6, 'snooze_ambassador', '😴 Đại Sứ Nút Snooze', 40, 50, false),
  (7, 'time_is_a_concept', '🕘 9h35 Là Khái Niệm', 50, 60, false),
  (8, 'fund_patron', '💸 Mạnh Thường Quân Của Quỹ', 60, 75, false),
  (9, 'team_atm', '🏦 ATM Của Team', 75, 90, false),
  (10, 'final_boss', '☠️ Final Boss 9h35', 90, null, false)
on conflict (rank) do update set
  key = excluded.key,
  title = excluded.title,
  min_rate = excluded.min_rate,
  max_rate = excluded.max_rate,
  include_min = excluded.include_min;

insert into public.message_packs (id, organization_id, kind, name, is_enabled)
values (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000001',
  'system',
  'Câu nói mặc định',
  true
)
on conflict (id) do update set is_enabled = true;

insert into public.message_templates (
  id,
  organization_id,
  pack_id,
  event_type,
  personality,
  template
)
values
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'late',
    'friendly',
    '{name} đã check-in, trễ {late_minutes} phút. Chúc bạn một ngày làm việc hiệu quả.'
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'late',
    'spicy',
    'Xin thông báo, {name} vừa cập bến sau {late_minutes} phút. Quỹ được tài trợ thêm {fine_amount} đồng.'
  ),
  (
    '00000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'late',
    'spicy',
    '{title} {name} đã hoàn thành hành trình hôm nay với thời gian trễ {late_minutes} phút.'
  ),
  (
    '00000000-0000-4000-8000-000000000204',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'payment',
    'friendly',
    '{name} đã đóng phạt thành công {fine_amount} đồng. Cảm ơn bạn.'
  ),
  (
    '00000000-0000-4000-8000-000000000205',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'payment',
    'spicy',
    'Ting ting, {name} vừa đóng {fine_amount} đồng. Xin chúc mừng quỹ và chia buồn cùng tài khoản của {name}.'
  ),
  (
    '00000000-0000-4000-8000-000000000206',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'on_time',
    'friendly',
    '{name} đã check-in đúng giờ. Chúc một ngày tốt lành.'
  ),
  (
    '00000000-0000-4000-8000-000000000207',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'achievement',
    'friendly',
    'Chúc mừng {name} vừa nhận danh hiệu {title}.'
  ),
  (
    '00000000-0000-4000-8000-000000000208',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'fund_balance',
    'friendly',
    'Số dư quỹ hiện tại là {fund_balance} đồng.'
  )
on conflict (id) do update set
  event_type = excluded.event_type,
  personality = excluded.personality,
  template = excluded.template,
  is_enabled = true;
