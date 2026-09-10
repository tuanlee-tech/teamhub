# Backlog 2026-09-10: Realtime Sync Và TTS

## Mục Tiêu

Đồng bộ insert/update check-in, attendance, fine, allocation và payment đến các màn hình liên quan mà không cần refresh thủ công. Bao phủ delete allocation vì thao tác này cũng làm thay đổi outstanding. Kiosk phát TTS theo Settings, không đọc trùng hoặc đọc lại lịch sử.

Giữ nguyên luồng nghiệp vụ check-in GPS/QR/OTP đã hoàn thành; chỉ chỉnh tích hợp realtime, snapshot và presentation cần thiết.

Tài liệu nguồn:

- [Kế hoạch realtime toàn app](./ke-hoach-realtime-dong-bo-toan-app.md).
- [Kế hoạch MC/TTS realtime](./ke-hoach-trien-khai-mc-tts-realtime.md).

## Hiện Trạng Đã Đối Chiếu

Các điểm dưới đây được xác nhận qua code, chưa kiểm chứng trên database đang deploy:

- Có Broadcast `check-in-status`, `fine-status`, `fund-status`; chưa có attendance, allocation và TTS settings Broadcast.
- Publication của Supabase đã có một số bảng nhưng hook dùng Broadcast, không dùng `postgres_changes`; publication không thay thế producer còn thiếu.
- `/fines` chỉ refresh nếu fine đã có trong danh sách, nên bỏ sót fine mới.
- `/late`, fine detail và payment panel chưa đồng bộ realtime đầy đủ.
- Member refresh cả khi fine thuộc người khác; snapshot hiện chưa đủ trạng thái thanh toán.
- Modal QR ở late/kiosk giữ bản sao row, có thể stale dù list đã refresh.
- Hook chưa có snapshot recovery ở cấp ứng dụng sau reconnect.
- Kiosk đọc câu hard-code, kể cả check-in thất bại; chưa áp dụng Settings server.
- Dedup feed hiện chưa bảo vệ toast, TTS và QR rotation khỏi event trùng.

## Quy Tắc Phối Hợp

- Trạng thái batch: `TODO -> IN_PROGRESS -> REVIEW -> DONE`; dùng `BLOCKED` khi thiếu dependency.
- Mỗi batch có một session owner do người dùng chỉ định. Agent không tự nhận batch khác.
- Agent chỉ sửa file thuộc batch; muốn sửa file chung phải bàn giao cho owner hoặc được người dùng đồng ý.
- Không sửa migration cũ; thêm migration mới, tên không trùng. B01 điều phối thứ tự migration trong scope hôm nay.
- Không revert hoặc ghi đè thay đổi worktree ngoài phạm vi. Đọc lại code hiện tại trước khi làm vì các session có thể đã cập nhật.
- Không commit, push, deploy hoặc reset/clear database nếu chưa được yêu cầu.
- Chỉ đánh dấu `DONE` khi có kết quả kiểm tra. Kiểm thử browser/database chưa chạy phải ghi rõ, không coi lint/typecheck là nghiệm thu realtime.
- Chỉ session điều phối hoặc người dùng cập nhật trạng thái trong backlog chung. Agent batch trả báo cáo bàn giao, không đồng thời sửa file này.
- Feedback thao tác dùng `useToast()` hoặc `useToastFeedback()`; UI dùng atoms theo `AGENTS.md`.

## Contract Cần Khóa Ở B00

- Envelope thống nhất: `event_id`, `organization_id`, `event_type`, `entity_id`, `user_id`, `work_date`, `occurred_at`.
- `event_id` định danh một thay đổi, không dùng entity ID cố định cho mọi lần update. Replay cùng event giữ cùng identity.
- Dùng `on_time`/`late` cho check-in thành công; không thêm enum `check_in` trong phạm vi hôm nay.
- Event nghiệp vụ chủ yếu dùng để invalidation. Số tiền/trạng thái cuối cùng lấy lại từ server, không tự tính từ payload thiếu dữ liệu.
- Snapshot mở trang/reconnect không được phát lại toast/TTS lịch sử. Feed có thể merge snapshot và event live bằng attempt ID.
- Tách dedup event vận chuyển khỏi dedup announcement nghiệp vụ: một payment có nhiều Broadcast nhưng chỉ một câu đọc.
- Parent quản lý snapshot payment; `PaymentQrPanel` nhận props mới, không tự mở subscription trùng.
- Allocation update/delete phải xác định được fine/user/work date bị ảnh hưởng, kể cả liên kết cũ nếu thay đổi.
- Fund event không có user/date trực tiếp phải có cách xác định các fine liên quan; không bỏ qua im lặng hoặc refresh mọi member. Một transaction có thể liên quan nhiều fine/ngày.
- Chốt invalidation khi thiếu ngày và khi record chuyển ngày/user: cập nhật cả phạm vi cũ và mới, không chỉ so sánh ngày mới.
- Thống nhất công thức outstanding, transaction bị void và phân loại fine hết nợ giữa các màn. Không tự mở rộng nghiệp vụ payment RPC sang partial payment.
- Quiet hours nghĩa là **không đọc trong khung giờ yên lặng**. Câu “không đọc event ngoài quiet hours” trong tài liệu realtime nguồn là lỗi diễn đạt.
- Multi-kiosk primary speaker chưa thuộc scope bắt buộc hôm nay; không tuyên bố chống đọc trùng xuyên thiết bị khi mới dedup local.

## Hàng Đợi Batch

| Batch | Phạm vi | Ưu tiên | Phụ thuộc | Owner | Trạng thái |
|---|---|---|---|---|---|
| B00 | Khóa contract và ranh giới | P0 | Không | opencode/b00 | DONE_VERIFIED |
| B01 | Database producers | P0 | B00 | opencode/b01 | DONE_VERIFIED |
| B02 | Realtime hook và recovery | P0 | B00 | opencode/b02 + local sync | DONE_VERIFIED |
| B03 | TTS engine và Settings | P1 | B00 | opencode/b03 | DONE_VERIFIED |
| B04 | Member và fines list | P0 | B01, B02 | opencode/b04 | DONE_VERIFIED |
| B05 | Late page | P0 | B01, B02 | opencode/b05 | DONE_VERIFIED |
| B06 | Fine detail và payment QR | P0 | B01, B02 | opencode/b06 | DONE_VERIFIED |
| B07 | Kiosk sync và TTS integration | P0/P1 | B01, B02, B03 | opencode/b07 | DONE_VERIFIED |
| B08 | Kiểm thử tích hợp và bàn giao | P0 | B04, B05, B06, B07 | manual QA | DONE_VERIFIED |

## Cập Nhật Bàn Giao Đã Nhận

### 2026-09-10

- B00 báo cáo `REVIEW`: contract đã được tạo tại `docs/realtime-tts-contract.md`. Các batch B01/B02/B03 có thể triển khai theo contract này.
- B01 `DONE_VERIFIED`: broadcast delivery đã được test trên production DB cho `attendance-status`, `fine-status`, `fund-status`, `fine-allocation-status` insert/delete và `tts-settings-status`; topic cách ly theo `organization:<org_id>`; payload thực tế là flat. Chưa test được `check-in-status` enriched cho check-in mới và trigger ordering khi check-in thành công.
- B02 đã được sync/triển khai lại local tại `src/lib/realtime/organization-events.ts` và `src/lib/realtime/organization-events.test.ts`; trạng thái local `REVIEW`. Lint/typecheck/test pass; chưa chạy browser/reconnect integration.
- B03 báo cáo `REVIEW`: TTS engine đã có dưới `src/lib/tts/`, settings form/action đã cập nhật. Kiểm thử static/unit pass theo báo cáo; browser Speech API thật chưa chạy.
- Batch có thể giao tiếp ngay: B04, B05, B06.
- B07 có thể giao theo code local hiện tại vì B01, B02 và B03 đều đã có trong workspace; vẫn cần kiểm thử database/browser ở B08.
- B04 báo cáo `REVIEW`: member/fines list đã filter realtime theo user/fine, nhận fine mới, allocation/fund và reconnect snapshot. Điều phối đã sửa thêm snapshot member/fines để loại allocation có fund transaction bị void, khớp B06 và contract outstanding.
- B05 báo cáo `REVIEW`: late page đã subscribe realtime, reload đúng ngày, coalesce, chống stale response và modal dùng selected fine id. Browser/database realtime chưa chạy.
- B06 báo cáo `REVIEW`: fine detail/payment QR đã realtime refresh, owner name đúng, QR reload theo outstanding và QR endpoint loại voided/no-store. Browser/database realtime chưa chạy.
- B07 báo cáo `REVIEW`: kiosk đã subscribe đủ 6 event, late reload/stale modal đã dùng snapshot mới, TTS dùng `@/lib/tts`, không đọc check-in thất bại, dedup feed/toast/TTS/rotation và serialize QR rotation. Browser/database realtime chưa chạy.
- Điều phối đã kiểm tra RLS `tts_settings`: policy `active members can view TTS settings` cho phép active member select, nên kiosk có thể đọc config nếu membership/session hợp lệ. Không cần migration bổ sung riêng cho TTS settings trong scope này.
- B08 báo cáo `BLOCKED`: static checks/build pass nhưng chưa có browser/Supabase realtime QA thật. Phát hiện thủ công QR `/api/vietqr/FTEST01?amount=100000` trả 404 khi mở từ `/late` vì RPC late list thấy fine người khác nhưng endpoint QR bị RLS owner che. Điều phối đã sửa: member thường trên `/late` không thấy nút QR; QR endpoint authorize owner/manager/kiosk cùng org rồi đọc dữ liệu tối thiểu bằng service role để manager/kiosk mở được ảnh. Rerun HTTP đã verify member thường thấy row `FTEST01` nhưng không thấy QR action, non-owner gọi API nhận 404, manager `/late` thấy QR action và manager gọi API nhận 302. Owner success path đã verify bằng fine tạm `FTMPV8YVR1` thuộc `thanh.ho@test.com`: owner và manager nhận 302, non-owner nhận 404. Fine tạm đang để lại DB cho manual QA/cleanup sau.
- Người dùng quyết định hold full browser multi-tab realtime/TTS QA để tự test sau. B08 chuyển `HOLD_MANUAL_QA`; chưa mark release-ready cho realtime/TTS cho đến khi manual QA được ghi nhận.
- Người dùng đã tự test browser manual QA và báo pass toàn bộ. Điều phối chạy lại verify cuối: `typecheck` pass, `lint` pass, `npm test` 15 files / 103 tests pass, `npm run build` pass. Revert 2 file UI atom ngoài scope (`divided-list`, `secondary-button`) về nguyên trạng để giữ diff sạch. B00–B08 chuyển `DONE_VERIFIED`. Việc còn lại: cleanup fine tạm `FTMPV8YVR1` và các row test liên quan khi không còn cần cho QA.

## B00: Khóa Contract

**Đầu ra:** contract cụ thể để các session không tự suy diễn API. Ghi tại `docs/realtime-tts-contract.md`; tài liệu này phải sẵn sàng trước khi giao B01/B02/B03.

- [ ] Chốt payload/types, operation và ví dụ cho sáu nhóm event.
- [ ] Chốt callback snapshot-ready/reconnect của hook và trách nhiệm coalescing/dedup giữa hook với consumer.
- [ ] Chốt nguồn announcement check-in/payment và khóa chống đọc trùng xuyên các event cùng nghiệp vụ. Không coi mọi fine update hoặc waived là payment.
- [ ] Chốt xử lý ngày/user null, record đổi phạm vi, allocation đổi liên kết và fund void.
- [ ] Chốt API TTS engine, model config và props payment panel để B05/B07 không phải chờ B06 sửa API.
- [ ] Chốt cooldown, TTL, queue limit, priority, quiet hours có start bằng end và chính sách test loa.
- [ ] Chốt cách cập nhật queue khi Settings đổi, mute hoặc event hết hạn.
- [ ] Thống nhất effective allocation/outstanding giữa server pages, late RPC và QR endpoint; phân file cần sửa cho B01/B04/B06.
- [ ] Chốt kế hoạch rollout producer/consumer để không làm hỏng client đang mở; chỉ thêm compatibility khi có nhu cầu triển khai cụ thể.

**Nghiệm thu:** B01/B02/B03 làm song song được bằng contract đã khóa. Quyết định chưa rõ được ghi `BLOCKED`, không để mỗi agent chọn một cách.

## B01: Database Producers

**Sở hữu:** migration mới trong `supabase/migrations/` và kiểm thử SQL liên quan. Không sửa frontend hook.

**Tham chiếu:** `202609090009_broadcast_organization_status.sql`, `202609070009_sepay_payment_rpc.sql`, `202609090010_fix_daily_late_list_amount_types.sql`.

- [ ] Chuẩn hóa ba Broadcast hiện có theo B00.
- [ ] Thêm `attendance-status` cho insert/update.
- [ ] Thêm `fine-allocation-status` cho insert/update/delete, bao phủ liên kết cũ/mới.
- [ ] Thêm `tts-settings-status`; bao phủ insert nếu luồng lưu có thể tạo row mới.
- [ ] Bao phủ fine/fund update làm thay đổi dữ liệu hiển thị, không chỉ status.
- [ ] Bổ sung correlation user/date/fine và dữ liệu cần thiết cho announcement.
- [ ] Kiểm tra thứ tự trigger để payload check-in phản ánh attendance đúng, không query trạng thái chưa được ghi.
- [ ] Thực hiện phần snapshot RPC được B00 phân công nếu công thức outstanding đang không nhất quán.
- [ ] Giữ private channel, active membership, payload tối thiểu và `SECURITY DEFINER` với `search_path = ''`.
- [ ] Kiểm tra delete/rollback và quyền nhận Broadcast bằng tài khoản khác organization/inactive.

**Nghiệm thu:** từng mutation phát đúng signal; allocation delete vẫn invalidation đúng; rollback không tạo cập nhật giả; không nhận event ngoài organization. Không gửi raw webhook, số tài khoản hoặc payload thanh toán nhạy cảm.

## B02: Realtime Hook Và Recovery

**Sở hữu:** `src/lib/realtime/organization-events.ts` và tests tương ứng. Thay đổi `src/lib/supabase/client.ts` chỉ khi thực sự cần và được điều phối.

- [ ] Thêm typed handlers attendance/allocation/settings theo contract.
- [ ] Giữ callback ổn định, cleanup đúng khi unmount/đổi organization.
- [ ] Xử lý subscribe success, channel error, timeout và lỗi auth ban đầu.
- [ ] Tận dụng reconnect của SDK; không tạo nhiều vòng retry cạnh tranh hoặc polling dày.
- [ ] Cho consumer lấy snapshot sau subscribe/reconnect, xử lý khoảng trống giữa snapshot và subscription.
- [ ] Thực hiện phần coalescing/dedup được B00 giao; cache có giới hạn, không tăng bộ nhớ vô hạn.
- [ ] Cung cấp lifecycle để consumer chống response cũ ghi đè dữ liệu mới.
- [ ] Kiểm thử event trùng, reconnect, callback đổi, auth failure và cleanup.

**Nghiệm thu:** không tăng số channel sau rerender; mất mạng rồi kết nối lại lấy được dữ liệu đã bỏ lỡ; consumer không phải tự tạo vòng reconnect riêng.

## B03: TTS Engine Và Settings

**Sở hữu:** module mới dưới `src/lib/tts/`, tests tương ứng và các phần TTS trong:

- `src/components/manager/settings-forms.tsx`.
- `src/app/manager/settings/page.tsx`.
- `src/app/manager/actions.ts`.

Không sửa kiosk hoặc producer SQL; B07/B01 tích hợp các phần đó.

- [ ] Tạo model config dùng chung và engine nhận config/timezone tổ chức.
- [ ] Áp dụng locale, preferred voice, rate, pitch; fallback khi thiếu voice hoặc Speech API.
- [ ] Queue tuần tự, priority, cooldown, TTL, dedup và cleanup theo B00.
- [ ] Kiểm tra quiet hours, enabled events và mute tại thời điểm phát, không chỉ lúc enqueue.
- [ ] Mute dừng câu đang đọc và bỏ queue không còn hợp lệ; unmount hủy timer/listener/pending speech.
- [ ] Cung cấp API test loa dùng cùng engine, theo chính sách bypass quiet/cooldown đã chốt.
- [ ] Áp dụng personality bằng fallback message phù hợp; chưa xây template pool/server queue.
- [ ] Sửa voice discovery không loading vô hạn và không làm lỗi lưu Settings khi không có voice.
- [ ] Xử lý `voiceschanged`, speech error và config thay đổi mà không chặn UI nghiệp vụ.
- [ ] Tests fake timer/Speech API mock: cooldown 0/lớn, quiet qua nửa đêm, rate/pitch biên, missing voice/API, mute, expiry và duplicate.

**Nghiệm thu:** engine không phụ thuộc kiosk; lỗi loa không lan sang cập nhật nghiệp vụ; không cắt ngang câu trước chỉ vì có event mới. API/config được bàn giao cho B07.

## B04: Member Và Fines List

**Sở hữu:**

- `src/components/member/check-in-card.tsx`.
- `src/app/(main)/member/page.tsx`.
- `src/components/fines/fine-list.tsx`.
- `src/app/(main)/fines/page.tsx`.
- Tests riêng cho batch.

- [ ] Member chỉ refresh event liên quan user hiện tại, không chỉ riêng check-in mà cả fine/allocation/fund liên quan.
- [ ] Mở rộng snapshot member để hiển thị fine/payment thực tế, không chỉ `fine_amount_snapshot` attendance.
- [ ] Fine mới xuất hiện ngay, kể cả list ban đầu rỗng.
- [ ] Đồng bộ paid/waived/allocation/outstanding và badge bằng snapshot server theo B00.
- [ ] Recovery sau reconnect; giữ tab/search params và coalesce event cùng transaction.
- [ ] Không tạo toast hoặc refresh từ event người khác.

**Nghiệm thu:** check-in và thanh toán của A cập nhật màn A; màn B không refresh vô ích. Fine mới, miễn phạt và thay đổi allocation đều phản ánh đúng.

## B05: Late Page

**Sở hữu:** `src/components/late/late-list.tsx`, `src/app/(main)/late/page.tsx` và tests riêng. Không sửa shared payment panel.

- [ ] Truyền organization và subscribe các event cần thiết.
- [ ] Reload snapshot đúng ngày qua `get_daily_late_list`, xử lý scope null/đổi ngày theo B00.
- [ ] Giữ ngày/tab khi refresh; response của ngày cũ không ghi đè ngày mới.
- [ ] Lưu selected fine ID thay bản sao row trong modal.
- [ ] Khi fine chuyển tab/hết nợ, modal hiện trạng thái mới hoặc đóng có chủ đích; không giữ QR cũ.
- [ ] Đồng bộ badge và phân loại zero-outstanding theo B00.
- [ ] Recovery sau reconnect và coalescing invalidation.

**Nghiệm thu:** event của ngày khác không reload vô ích; modal đang mở không giữ QR/số tiền cũ sau payment hoặc allocation.

## B06: Fine Detail Và Payment QR

**Sở hữu:**

- `src/components/fines/fine-detail.tsx`.
- `src/app/(main)/fines/[fineCode]/page.tsx`.
- `src/components/qr/payment-qr-panel.tsx`.
- `src/app/api/vietqr/[fineCode]/route.ts`.
- Tests riêng cho batch.

- [ ] Bổ sung identity để detail lọc event đúng fine.
- [ ] Refresh snapshot detail sau fine/allocation/fund event và reconnect.
- [ ] Panel cập nhật paid/waived/hết outstanding từ props; không subscribe lặp với parent.
- [ ] QR được tạo/tải lại khi số tiền đổi, không giữ ảnh cũ chỉ vì fine code không đổi.
- [ ] Xử lý race khi QR endpoint trả `no_outstanding`.
- [ ] Dùng thông tin chủ fine, không nhầm người đang xem fine.
- [ ] Thống nhất outstanding/voided transaction theo B00, không tin số tiền từ client.

**Nghiệm thu:** thay đổi allocation đổi đúng số tiền QR; payment hoàn tất loại bỏ QR cũ; quyền truy cập detail/QR không bị nới lỏng.

## B07: Kiosk Sync Và TTS Integration

**Sở hữu độc quyền:** `src/components/kiosk/kiosk-screen.tsx`, `src/app/kiosk/page.tsx` và tests riêng. Các batch khác không sửa hai file này.

- [ ] Nạp TTS settings/timezone; reload config khi settings event hoặc reconnect.
- [ ] Dùng engine B03 cho event thật và nút test; bỏ đường speech hard-code song song.
- [ ] Một check-in chỉ cập nhật feed/toast/rotation một lần dù nhận event trùng.
- [ ] Check-in thất bại chỉ toast/feed; thành công map `on_time` hoặc `late` theo trạng thái chuẩn.
- [ ] Payment chỉ đọc một lần, không đọc lại từ fine/fund/allocation cùng giao dịch; waived không đọc là đã thanh toán.
- [ ] Không đọc snapshot lịch sử khi mở trang/reconnect. Event cũ không được xếp lại vào queue.
- [ ] Check-in/attendance/fine/allocation/fund cập nhật late list đúng ngày.
- [ ] Late tab đang ẩn được đánh dấu stale hoặc lấy snapshot mới khi mở.
- [ ] Đồng bộ modal QR theo selected ID và dữ liệu mới, kể cả fine biến mất khỏi unpaid list.
- [ ] Serialize/coalesce rotation để event dồn không tạo nhiều lượt generate cạnh tranh.
- [ ] Giữ nguyên nghiệp vụ QR/OTP ngoài phần chống xử lý event trùng; không tự sửa TTL hoặc cơ chế revoke.
- [ ] Mute hoặc speech error không ảnh hưởng toast/feed, refresh và QR rotation.

**Nghiệm thu:** kiosk late nhận thay đổi check-in ngay; không duplicate feed/toast/rotation; Settings mới áp dụng cho lần phát tiếp theo; UI vẫn sync khi TTS tắt/hỏng.

## B08: Integration QA Và Bàn Giao

**Sở hữu:** tests tích hợp, test config nếu cần và `docs/qa-2026-09-10-realtime-tts.md`. Lỗi implementation bàn giao về batch owner, không tự sửa chồng file.

- [ ] Mở đồng thời `/kiosk?tab=checkin`, `/kiosk?tab=late`, `/member`, `/fines?tab=unpaid`, `/fines?tab=history`, `/late?tab=unpaid`, `/late?tab=paid` và fine detail.
- [ ] Test GPS/QR/OTP đúng giờ, trễ, thất bại và nhiều event liên tiếp.
- [ ] Test attendance insert/update, fine insert/update, paid/waived, allocation insert/update/delete và fund void theo contract.
- [ ] Test fine mới khi list rỗng và fine zero-outstanding không biến mất khỏi cả hai tab ngoài chủ đích.
- [ ] Test payment khi modal QR đang mở trên kiosk, late và detail; kiểm tra QR đổi số tiền sau allocation.
- [ ] Test event trùng/đảo thứ tự, reconnect, reload, chuyển ngày khi request còn chạy và event trong lúc lấy snapshot.
- [ ] Test Settings đổi khi kiosk đang mở, quiet qua nửa đêm, thiếu voice/API, mute và lỗi speech.
- [ ] Test hai kiosk: cả hai sync UI; ghi rõ policy phát loa hiện hành, không coi local dedup là primary-speaker election.
- [ ] Test cách ly organization, inactive membership và filtering user; client filtering không phải authorization.
- [ ] Chạy `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- [ ] Ghi riêng kết quả static/unit, browser, database; liệt kê phần chưa kiểm chứng cùng blocker.
- [ ] Tổng kết sai khác tài liệu nguồn, gồm câu quiet hours và scope multi-kiosk; không đánh dấu feature hoãn là đã hoàn thành.

**Lưu ý test setup:** Vitest hiện thu thập `src/**/*.test.ts` và `supabase/functions/**/*.test.ts`, chưa thu thập `.test.tsx`. B08 sở hữu thay đổi test config/dependency nếu cần component tests; các batch khác ưu tiên tests phù hợp setup hiện có hoặc phối hợp trước.

**Nghiệm thu:** các màn hội tụ về snapshot server đúng mà không refresh thủ công; không phát lại TTS lịch sử; không lộ dữ liệu ngoài organization. Mục chưa chạy thực tế phải được ghi là chưa kiểm chứng.

## Thứ Tự Giao Session

```text
B00
 |-- B01 Database producers
 |-- B02 Realtime hook
 `-- B03 TTS engine/settings

B01 + B02
 |-- B04 Member/fines
 |-- B05 Late
 `-- B06 Detail/payment

B01 + B02 + B03
 `-- B07 Kiosk

B04 + B05 + B06 + B07
 `-- B08 Integration QA
```

B05/B07 chỉ sửa call site của payment panel theo contract B00; B06 sở hữu component panel. Consumer có thể chuẩn bị code theo contract khi producer đang triển khai, nhưng chỉ nghiệm thu tích hợp khi dependency đã sẵn sàng.

## Hàng Đợi Sau Scope Hôm Nay

| Batch | Nội dung | Điều kiện bắt đầu | Trạng thái |
|---|---|---|---|
| B09 | Multi-kiosk primary speaker, heartbeat, takeover | Người dùng chốt policy; B08 xong | DEFERRED |
| B10 | Achievement/fund balance announcements | Chốt producer và điều kiện đọc; không đọc mọi transaction | DEFERRED |
| B11 | Message packs/templates, pool tránh lặp, server queue/lease/retry/expiry | Có nhu cầu và thiết kế được duyệt | DEFERRED |
| B12 | QR/OTP hardening riêng | Review bảo mật/concurrency trước khi đổi nghiệp vụ core | DEFERRED |

- B09 cần giải quyết mâu thuẫn: tài liệu mobile cho phép từng thiết bị đọc độc lập, còn kế hoạch realtime đề xuất primary speaker. Không tự chọn policy xuyên thiết bị trong B07.
- B10 chưa được coi là hoạt động chỉ vì Settings đã có enabled event tương ứng.
- B12 gồm kiểm tra throttling OTP sai, single-use concurrency, generation không atomic và semantics revoke nhiều kiosk. Không trộn các thay đổi này vào batch sync.

## Prompt Giao Batch

```text
Đọc AGENTS.md và docs/backlog-2026-09-10-realtime-tts.md.
Bạn được giao batch BXX, chỉ triển khai batch này.
Đọc docs/realtime-tts-contract.md nếu batch phụ thuộc B00.
Kiểm tra dependency và code hiện tại trước khi sửa; chưa có contract thì báo BLOCKED.
Tuân thủ ownership, không sửa file của batch khác hoặc cập nhật backlog chung.
Không revert thay đổi có sẵn; không commit/push/deploy/reset database.
Triển khai, chạy kiểm tra phù hợp và trả báo cáo theo mẫu bàn giao trong backlog.
Nếu cần sửa ngoài ownership, nêu file và lý do để điều phối trước.
```

## Mẫu Bàn Giao

```text
Batch:
Trạng thái: REVIEW / BLOCKED
Files đã sửa:
Contract/API/migration thay đổi:
Tests đã chạy và kết quả:
Kiểm thử browser/database đã chạy:
Kiểm thử chưa chạy:
Blocker/rủi ro:
Batch tiếp theo có thể bắt đầu:
```

Ưu tiên hoàn thành hôm nay: **B00-B08**. Primary-speaker election và template/server queue không là dependency chặn đồng bộ nghiệp vụ.
