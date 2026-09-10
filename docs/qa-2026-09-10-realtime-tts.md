# QA 2026-09-10: Realtime TTS

Batch: B08
Trạng thái: DONE_VERIFIED

## Static Checks

- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm test`: pass, 15 test files / 103 tests.
- `npm run build`: pass.
- Build warnings: Next.js reports Edge Runtime deprecation and static generation disabled for pages using edge runtime. No build failure.
- Rerun after QR 404 fix: all four commands still pass.
- Final verify sau khi user báo manual QA pass: typecheck pass, lint pass, 15 files / 103 tests pass, build pass.

## Permission QA: `/late` And `/api/vietqr`

Partial HTTP verification was run against local Next dev server with Supabase sessions built from AGENTS test accounts.

- Signed in AGENTS accounts successfully: all listed test accounts are active `member` role; no manager/kiosk credential is available in AGENTS.
- `/late?tab=unpaid` as member: HTTP 200.
- `/late?tab=unpaid` as member: response includes `FTEST01` but does not include `QR thanh toán` modal text or `Phóng lớn QR phiếu` scan button label. This verifies normal member cannot open QR from `/late` while still seeing the late list row.
- `/api/vietqr/FTEST01?amount=100000` as non-owner member in same org: HTTP 404. This matches the intended denial path after the fix.
- Manager-specific `/late` QR visibility and `/api/vietqr` success path: not run. Database has one active manager (`tuanlexor`) but no manager password/session was provided.
- Manager-specific rerun after credential provided: `/late?tab=unpaid` returns HTTP 200, includes `FTEST01`, and renders the `Phóng lớn QR phiếu` scan button label.
- Manager-specific `/api/vietqr/FTEST01?amount=100000`: returns HTTP 302 redirect to VietQR image. Redirect URL was inspected only for status; do not persist bank details in QA docs.
- Member denial rerun after endpoint fix: `/late?tab=unpaid` returns HTTP 200 and includes `FTEST01`, but does not render `Phóng lớn QR phiếu`; `/api/vietqr/FTEST01?amount=100000` returns HTTP 404.
- Owner `/api/vietqr` success path: verified after creating temporary unpaid fine `FTMPV8YVR1` for `thanh.ho@test.com` (`work_date=2026-09-20`, amount 100000). Owner request returns HTTP 302 redirect to VietQR image.
- Non-owner member request for temporary fine `FTMPV8YVR1` as `phuoc.nguyen@test.com`: HTTP 404.
- Temporary QA data intentionally remains in DB for any follow-up manual verification; clean it up after B08/manual QA if no longer needed.

## Browser QA

Not run in this session.

Blocked by lack of browser-capable QA harness/tooling in the repo and no interactive browser access in the current API environment. No Playwright/e2e config was present. The rerun used HTTP checks only for the prioritized permission path above; it did not open concurrent tabs or exercise real browser Speech API.

Manual QA assignment rerun note:

- Manager credential for manual QA is available: `tuanlexor` / provided password.
- Test member credentials are available from `AGENTS.md`.
- Temporary owner-path fine for manual QA is available: `FTMPV8YVR1` owned by `thanh.ho@test.com`.
- Full browser multi-tab realtime/TTS QA remains unexecuted by this API agent because there is no interactive browser, audio permission prompt, Speech API, network toggle, or multi-tab automation tool in this environment.
- Do not infer pass/fail for the checklist below from HTTP checks. The browser/TTS checklist must be executed in a real browser session.

Required scenarios still need manual or browser-automated verification:

- Open concurrently: `/kiosk?tab=checkin`, `/kiosk?tab=late`, `/member`, `/fines?tab=unpaid`, `/fines?tab=history`, `/late?tab=unpaid`, `/late?tab=paid`, and fine detail.
- Check-in GPS/QR/OTP on-time, late, and failed.
- Check-in updates kiosk feed, kiosk late, member for the correct user, late page for the correct day, and fines when a fine is generated.
- Payment while QR/modal/detail is open.
- Fine paid/waived, allocation insert/update/delete, and fund void UI convergence.
- Settings TTS changes while kiosk is open.
- TTS behavior: no failed check-in speech, no snapshot/reconnect history speech, mute does not break UI, quiet hours, missing voice/Speech API.
- Reconnect or reload tab without replaying historical TTS.
- Duplicate/out-of-order events if they can be simulated.
- Organization isolation and user filtering.

## Database Realtime QA

Not run in this session.

Blocked by lack of an approved mutable realtime test database workflow for B08 in this turn. The requested scenarios require creating/updating/deleting attendance, fines, allocations, fund transactions, payments, and TTS settings against a live Supabase realtime environment. No reset/clear/deploy/database mutation was performed.

Manual QA still required for live realtime mutations:

- Check-in QR/OTP/GPS success and failure.
- Fine paid/waived transitions.
- Allocation insert/update/delete.
- Fund void.
- Settings TTS update while kiosk is open.
- Reconnect/reload behavior.
- Organization/user isolation beyond the verified `/api/vietqr` permission matrix.

## Lỗi Phát Hiện

- Manual finding after the initial blocked QA report: opening payment QR from `/late` could request `/api/vietqr/FTEST01?amount=100000` and receive `404`.
- Root cause: `get_daily_late_list` is a broader snapshot RPC, but the VietQR endpoint queried `fines` through viewer RLS. A non-owner row visible in late list could be hidden from the endpoint unless the viewer was recognized by RLS as manager.
- Coordination fix applied: `/late` hides QR actions for normal members; `/api/vietqr/[fineCode]` authorizes active owner/manager/kiosk in the same organization, then uses server-side privileged reads for the minimum fine/allocation/profile/settings data needed to render QR.
- Rerun verification: member `/late` no longer exposes QR action for `FTEST01`; non-owner member API request returns 404. Manager `/late` exposes the QR action and manager API request returns 302. Owner success path verified with temporary fine `FTMPV8YVR1`; non-owner request to the same fine returns 404.
- No browser/database realtime defect confirmed because integration QA could not be executed in this environment.

## Batch Owner Cần Xử Lý

- QA/coordination: provide a browser-capable runner or manual QA window plus seeded Supabase realtime database and approval to mutate test data.
- QA/coordination: clean up temporary fine `FTMPV8YVR1` after manual QA if no longer needed.
- B04/B05/B06/B07: no new implementation defect assigned from this rerun because browser/database realtime scenarios were not executed.
- B06/B05 coordination fix permission matrix is verified by HTTP for manager success, owner success and normal member denial. Browser modal/image rendering still needs manual QA.

## Phần Chưa Kiểm Thử Được

- All browser scenarios listed above.
- All database realtime mutation scenarios listed above.
- Speech API behavior on a real browser/device.
- Network loss/reconnect behavior.
- Duplicate/out-of-order realtime event simulation.
- Cross-organization and inactive membership isolation.

## Manual QA Checklist Status

- QR permission: HTTP matrix pass; browser modal/image rendering still needs manual confirmation.
- Check-in realtime: not run in browser.
- Payment/fine realtime: not run in browser.
- Allocation/fund sync: not run in browser.
- TTS realtime: not run in browser/audio environment.
- Reconnect: not run in browser/network environment.
- Isolation: API non-owner QR denial pass; broader organization isolation not run.

No new defect is filed from this API-only rerun because no browser/manual realtime scenario was executed and no new failing behavior was observed.

## Kết Luận Release Readiness

Release-ready theo tiêu chí B08: static checks pass, HTTP permission matrix pass, và người dùng đã tự test browser manual QA báo pass toàn bộ (QR permission, check-in realtime, payment/fine realtime, allocation/fund sync, TTS settings realtime, reconnect/dedup theo checklist manual QA).

## Manual QA Hold

- Decision: full browser multi-tab realtime/TTS QA do người dùng tự test — đã báo pass.
- B04–B08 đã chuyển `DONE_VERIFIED` dựa trên manual QA pass của người dùng + verify static cuối của điều phối.
- Follow-up: cleanup fine tạm `FTMPV8YVR1` cùng các row attendance/roster/day test liên quan khi không còn cần (cần user approve trước khi mutate DB).
