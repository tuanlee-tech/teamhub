"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import QRCode from "qrcode";
import { CalendarDays, LogOut, Maximize, Mic, MicOff, QrCode, ScreenShare, Timer } from "lucide-react";

import { signOut } from "@/app/(auth)/actions";
import { PaymentQrPanel } from "@/components/qr/payment-qr-panel";
import { CurrencyText, Logo, Modal, Stamp, Toggle } from "@/components/ui";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { formatTimeInTimezone } from "@/lib/domain/date";
import type { PaymentBank } from "@/lib/domain/payment";
import { getPublicEnv } from "@/lib/env";
import Link from "next/link";

type SessionInfo = {
  active: boolean;
  work_date: string | null;
  session_start_at: string | null;
  session_end_at: string | null;
};

type FeedItem = {
  id: string;
  user_id: string;
  method: "gps" | "qr" | "otp";
  succeeded: boolean;
  rejection_reason: string | null;
  server_received_at: string;
  display_name: string | null;
};

type LateRow = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  attendance_state: string | null;
  late_minutes: number | null;
  checked_in_at: string | null;
  late_kind: string | null;
  fine_id: string | null;
  fine_code: string | null;
  fine_status: string | null;
  original_vnd: number | null;
  allocated_vnd: number | null;
  outstanding_vnd: number | null;
};

function methodLabel(method: FeedItem["method"]) {
  return method.toUpperCase();
}

function reasonLabel(reason: string | null) {
  const map: Record<string, string> = {
    office_not_configured: "Văn phòng chưa cấu hình",
    gps_accuracy_too_low: "GPS kém chính xác",
    outside_office_geofence: "Ngoài khu vực",
    invalid_or_expired_token: "QR hết hạn/sai",
    invalid_or_expired_otp: "OTP hết hạn/sai",
    otp_attempts_exceeded: "OTP quá số lần thử",
    not_on_roster: "Không trong danh sách điểm danh",
    already_checked_in: "Đã điểm danh",
  };
  return reason ? (reason in map ? map[reason] : reason) : "—";
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function KioskScreen({
  orgId,
  orgName,
  timezone,
  bank,
  initialSession,
}: {
  orgId: string;
  orgName: string;
  timezone: string;
  bank: PaymentBank | null;
  initialSession: SessionInfo | null;
}) {
  const env = getPublicEnv();
  const supabase = useMemo(
    () => createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    [env],
  );
  const searchParams = useSearchParams();

  const tab: "checkin" | "late" = searchParams.get("tab") === "late" ? "late" : "checkin";
  const lateTab: "unpaid" | "paid" = searchParams.get("lateTab") === "paid" ? "paid" : "unpaid";

  const [now, setNow] = useState(() => new Date());
  const [clockReady, setClockReady] = useState(false);

  const [session, setSession] = useState<SessionInfo | null>(initialSession);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [qrToken, setQrToken] = useState<string>("");
  const [otp, setOtp] = useState<string>("");
  const [isBusy, setIsBusy] = useState(false);
  const [codesGeneratedAt, setCodesGeneratedAt] = useState<number>(0);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);

  const [mcOn, setMcOn] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [wakeLocked, setWakeLocked] = useState(false);

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const timersRef = useRef<number[]>([]);
  const [expanded, setExpanded] = useState<LateRow | null>(null);

  const defaultLateDate = initialSession?.work_date ?? formatWorkDateLocal(new Date(), timezone);
  const [lateDate, setLateDate] = useState(defaultLateDate);
  const [lateRows, setLateRows] = useState<LateRow[]>([]);
  const [lateLoading, setLateLoading] = useState(false);

  const qrSecondsRemaining = qrDataUrl
    ? Math.max(0, Math.ceil((codesGeneratedAt + 30_000 - now.getTime()) / 1000))
    : 0;
  const otpSecondsRemaining = otp
    ? Math.max(0, Math.ceil((codesGeneratedAt + 5 * 60_000 - now.getTime()) / 1000))
    : 0;

  const refreshSession = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("kiosk_session_info", {
        p_organization_id: orgId,
      });
      if (error) throw error;
      setSession(data as SessionInfo);
    } catch {
      setSessionError("Không xác định được trạng thái ca làm.");
    }
  }, [supabase, orgId]);

  const generateCodes = useCallback(
    async (force = false) => {
      if (!session?.active) return;
      const age = Date.now() - codesGeneratedAt;
      if (!force && age < 20_000 && qrToken) return;
      setIsBusy(true);
      setSessionError(null);
      try {
        const [{ data: token, error: tokenError }, { data: code, error: codeError }] = await Promise.all([
          supabase.rpc("create_kiosk_qr_challenge", { organization_id: orgId }),
          supabase.rpc("create_kiosk_otp", { organization_id: orgId }),
        ]);
        if (tokenError) throw tokenError;
        if (codeError) throw codeError;
        const dataUrl = await QRCode.toDataURL(token, {
          width: 360,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
        });
        setQrToken(token);
        setQrDataUrl(dataUrl);
        setOtp(code);
        setCodesGeneratedAt(Date.now());
      } catch (err) {
        const message = (err as { message?: string }).message ?? "";
        setSessionError(
          message.includes("session is not active")
            ? "Hết giờ ca làm. Mã sẽ xuất hiện khi bắt đầu ca."
            : "Không tạo được mã. Kiểm tra quyền kiosk.",
        );
      } finally {
        setIsBusy(false);
      }
    },
    [session, supabase, orgId, codesGeneratedAt, qrToken],
  );

  const startWakeLock = useCallback(async () => {
    try {
      const sentinel = await (navigator as Navigator & {
        wakeLock?: { request(type: string): Promise<WakeLockSentinel> };
      }).wakeLock?.request("screen");
      if (sentinel) {
        wakeLockRef.current = sentinel;
        sentinel.addEventListener("release", () => setWakeLocked(false));
        setWakeLocked(true);
      }
    } catch {
      setSessionError("Trình duyệt không hỗ trợ Wake Lock.");
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { });
      setFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => { });
      setFullscreen(false);
    }
  }, []);

  useEffect(() => {
    // The server and browser can render on different seconds.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClockReady(true);
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    const refresh = window.setInterval(() => {
      refreshSession().catch(() => { });
    }, 10_000);
    const timers = timersRef.current;
    timers.push(clock, refresh);
    return () => timers.forEach((t) => window.clearInterval(t));
  }, [refreshSession]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial session load
    refreshSession().catch(() => { });
  }, [refreshSession]);

  useEffect(() => {
    if (session?.active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- regenerate codes once session flips active
      generateCodes().catch(() => { });
      const gen = window.setInterval(() => generateCodes().catch(() => { }), 10_000);
      const timers = timersRef.current;
      timers.push(gen);
      return () => {
        window.clearInterval(gen);
      };
    }
    setQrDataUrl("");
    setQrToken("");
    setOtp("");
  }, [session, generateCodes]);

  useEffect(() => {
    const channel = supabase
      .channel("kiosk-feed")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "check_in_attempts",
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          const item = payload.new as FeedItem;
          supabase
            .from("profiles")
            .select("display_name")
            .eq("user_id", item.user_id)
            .maybeSingle()
            .then(({ data }) => {
              const enriched = { ...item, display_name: data?.display_name ?? null };
              setFeed((prev) => [enriched, ...prev.slice(0, 9)]);
              if (mcOn && "speechSynthesis" in window) {
                const name = data?.display_name ?? "Có thành viên";
                const text = item.succeeded ? `${name} đã điểm danh` : `${name} điểm danh thất bại`;
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = "vi-VN";
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utterance);
              }
            });
        },
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [supabase, orgId, mcOn]);

  const loadLate = useCallback(
    async (date: string) => {
      setLateLoading(true);
      try {
        const { data } = await supabase.rpc("get_daily_late_list", {
          p_organization_id: orgId,
          p_work_date: date,
        });
        setLateRows((data ?? []) as LateRow[]);
      } catch {
        setLateRows([]);
      } finally {
        setLateLoading(false);
      }
    },
    [supabase, orgId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial late-list load
    loadLate(defaultLateDate).catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLateDateChange = useCallback(
    (next: string) => {
      setLateDate(next);
      loadLate(next).catch(() => { });
    },
    [loadLate],
  );

  const clock = clockReady
    ? new Intl.DateTimeFormat("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: timezone,
      }).format(now)
    : "--:--:--";

  const sessionStartLabel = session?.session_start_at
    ? formatTimeInTimezone(session.session_start_at, timezone)
    : "—";
  const sessionEndLabel = session?.session_end_at ? formatTimeInTimezone(session.session_end_at, timezone) : "—";

  const lateUnpaid = lateRows.filter(
    (row) => row.fine_id && row.fine_status !== "paid" && row.fine_status !== "waived" && (row.outstanding_vnd ?? 0) > 0,
  );
  const latePending = lateRows.filter((row) => !row.fine_id);
  const latePaid = lateRows.filter((row) => row.fine_id && (row.fine_status === "paid" || row.fine_status === "waived"));
  const lateDisplayed = lateTab === "paid" ? latePaid : [...lateUnpaid, ...latePending];

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--paper)]">
      <header className="sticky top-0 z-40 bg-[var(--white)] text-[var(--ink)] border-b border-[var(--line)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link className="flex items-center gap-3" href="/">
              <Logo className="h-9 w-auto" />
            </Link>
            <Stamp variant="info">Kiosk</Stamp>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm" aria-live="off">{clock}</span>
            <button
              type="button"
              onClick={startWakeLock}
              disabled={wakeLocked}
              className="grid size-9 place-items-center rounded-full border border-[var(--line)] bg-[var(--white)] text-[var(--ink)]"
              aria-label="Giữ màn hình sáng"
              title={wakeLocked ? "Wake Lock đã bật" : "Bật Wake Lock"}
            >
              <ScreenShare className={`size-4 ${wakeLocked ? "text-emerald-500" : ""}`} />
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="grid size-9 place-items-center rounded-full border border-[var(--line)] bg-[var(--white)] text-[var(--ink)]"
              aria-label="Toàn màn hình"
              title={fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
            >
              <Maximize className="size-4" />
            </button>
            <form action={signOut}>
              <button
                type="submit"
                className="grid size-9 place-items-center rounded-full border border-[var(--line)] bg-[var(--white)] text-[var(--ink)]"
                aria-label="Đăng xuất"
                title="Đăng xuất"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">
        <div className="grid gap-5">
          <SegmentedTabs
            param="tab"
            defaultValue="checkin"
            options={[
              { value: "checkin", label: "Check-in QR / OTP" },
              { value: "late", label: "Đi trễ" },
            ]}
            ariaLabel="Kiosk"
          />

          {tab === "checkin" ? (
            <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
              <section className="paper-panel space-y-5 p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black tracking-[0.16em] text-[var(--signal)] uppercase">
                      Điểm danh
                    </p>
                    <h1 className="display-type mt-1 text-3xl">Quét mã ở đây</h1>
                  </div>
                  {session?.active ? (
                    <Stamp variant="success">Ca hoạt động</Stamp>
                  ) : (
                    <Stamp variant="muted">Ngoài giờ ca</Stamp>
                  )}
                </div>

                {sessionError ? (
                  <p className="rounded-xl bg-red-950/40 px-4 py-3 text-sm font-semibold text-red-300">{sessionError}</p>
                ) : null}

                <div className="grid justify-items-center gap-4">
                  <div className="rounded-3xl border border-[var(--line)] bg-[var(--white)] p-6">
                    {qrDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={qrDataUrl} alt="QR điểm danh" className="size-56 object-contain sm:size-72" />
                    ) : (
                      <div className="grid size-56 place-items-center text-sm text-[var(--ink-soft)] sm:size-72">
                        Sẵn sàng phát mã khi vào ca
                      </div>
                    )}
                    <div className="mt-4 flex items-center justify-center gap-3 text-sm text-[var(--ink-soft)]">
                      <Timer className="size-4" />
                      <span>
                        {qrDataUrl
                          ? `QR hết hạn sau ${formatCountdown(qrSecondsRemaining)}`
                          : session?.active
                            ? "Đang chuẩn bị mã QR"
                            : "Chờ ca làm bắt đầu"}
                      </span>
                    </div>
                  </div>

                  {session?.active ? (
                    <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
                      <div className="rounded-xl border border-[var(--line)] bg-[var(--paper-deep)]/40 px-4 py-2">
                        Ca: {sessionStartLabel}–{sessionEndLabel}
                      </div>
                      <button
                        type="button"
                        onClick={() => generateCodes(true).catch(() => { })}
                        disabled={isBusy || !session.active}
                        className="rounded-xl border border-[var(--signal)] px-4 py-2 font-bold text-[var(--signal)] transition active:translate-y-px disabled:opacity-60"
                      >
                        <QrCode className="mr-2 inline size-4" />
                        {isBusy ? "Đang tạo..." : "Tạo mã mới"}
                      </button>
                    </div>
                  ) : (
                    <p className="rounded-xl border border-[var(--line)] bg-[var(--paper-deep)]/50 px-4 py-3 text-center text-sm text-[var(--ink-soft)]">
                      Ca tiếp theo <strong>{sessionStartLabel}</strong>–{sessionEndLabel}. Chưa phát mã trong thời gian
                      này.
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--paper-deep)]/40 px-4 py-3">
                  <div>
                    <p className="text-xs font-black tracking-[0.16em] text-[var(--ink-soft)] uppercase">
                      Mã OTP 6 số
                    </p>
                    <p className="mt-1 font-mono text-4xl font-black tracking-[0.3em]">
                      {otp || "·····"}
                    </p>
                    {otp ? (
                      <p className={`mt-1 text-xs font-bold ${otpSecondsRemaining <= 30 ? "text-red-300" : "text-[var(--ink-soft)]"}`}>
                        Hết hạn sau {formatCountdown(otpSecondsRemaining)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Toggle checked={mcOn} onChange={(e) => setMcOn(e.target.checked)} label="Đọc kết quả" />
                    {mcOn ? <Mic className="size-5 text-[var(--signal)]" /> : <MicOff className="size-5 text-[var(--ink-soft)]" />}
                  </div>
                </div>
              </section>

              <aside className="paper-panel space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black tracking-[0.16em] text-[var(--ink-soft)] uppercase">
                    Hoạt động gần đây
                  </p>
                  <Stamp variant="muted">{feed.length}</Stamp>
                </div>
                {feed.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[var(--ink-soft)]">
                    Chưa có lượt điểm danh. Mã QR sẵn sàng.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {feed.map((item) => (
                      <li
                        key={item.id}
                        className={`rounded-xl border px-3 py-2.5 text-sm ${item.succeeded ? "border-emerald-800 bg-emerald-950/40" : "border-red-800 bg-red-950/40"
                          }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-bold">
                            {item.succeeded ? "✓" : "✗"} {item.display_name ?? "Thành viên"}
                          </span>
                          <span className="shrink-0 text-xs text-[var(--ink-soft)]">
                            {methodLabel(item.method)}
                          </span>
                        </div>
                        {!item.succeeded ? (
                          <p className="mt-1 text-xs text-red-400">{reasonLabel(item.rejection_reason)}</p>
                        ) : null}
                        <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
                          {formatTimeInTimezone(item.server_received_at, timezone)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="paper-panel flex flex-wrap items-center gap-3 p-4">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <CalendarDays className="size-5 shrink-0 text-[var(--signal)]" />
                  <input
                    type="date"
                    value={lateDate}
                    onChange={(e) => e.target.value && onLateDateChange(e.target.value)}
                    className="h-12 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--white)] px-3 text-sm font-bold"
                    aria-label="Chọn ngày"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[var(--ink-soft)]">Đọc MC</span>
                  <Toggle checked={mcOn} onChange={(e) => setMcOn(e.target.checked)} label="Đọc MC" />
                </div>
              </div>

              <SegmentedTabs
                param="lateTab"
                defaultValue="unpaid"
                options={[
                  { value: "unpaid", label: "Chưa thanh toán", badge: lateUnpaid.length + latePending.length },
                  { value: "paid", label: "Đã thanh toán", badge: latePaid.length },
                ]}
                ariaLabel="Đi trễ"
              />

              {lateLoading ? (
                <div className="paper-panel px-5 py-12 text-center text-[var(--ink-soft)]">Đang tải...</div>
              ) : lateDisplayed.length === 0 ? (
                <div className="paper-panel px-5 py-12 text-center">
                  <p className="font-bold text-[var(--ink)]">Không có ai đi trễ trong ngày này.</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {lateDisplayed.map((row) => (
                    <div key={`${row.user_id}-${row.fine_id ?? "nf"}`} className="paper-panel space-y-2 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-black">{row.display_name ?? "Thành viên"}</span>
                        <LateBadge row={row} />
                      </div>
                      <p className="text-xs text-[var(--ink-soft)]">
                        {row.late_minutes != null ? `${row.late_minutes} phút trễ · ` : ""}
                        {row.late_kind === "auto_late" ? "tự ghi trễ" : "đi muộn"}
                      </p>
                      {row.fine_id ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-black text-[var(--signal)]">
                            <CurrencyText amount={row.outstanding_vnd ?? 0} />
                          </span>
                          {row.fine_status !== "paid" && row.fine_status !== "waived" && (row.outstanding_vnd ?? 0) > 0 ? (
                            <button
                              type="button"
                              onClick={() => setExpanded(row)}
                              className="rounded-xl bg-[var(--signal)] px-4 py-2 text-sm font-black text-[var(--paper)]"
                            >
                              QR thanh toán
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--ink-soft)]">Chưa cấp phiếu</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <Modal open={expanded !== null} onClose={() => setExpanded(null)} title="QR thanh toán">
        {expanded?.fine_id ? (
          <PaymentQrPanel
            fineCode={expanded.fine_code ?? "—"}
            originalVnd={expanded.original_vnd ?? 0}
            allocatedVnd={expanded.allocated_vnd ?? 0}
            outstandingVnd={expanded.outstanding_vnd ?? 0}
            status={(expanded.fine_status as "unpaid" | "paid" | "waived") ?? "unpaid"}
            memberName={expanded.display_name ?? "Thành viên"}
            bank={bank}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function LateBadge({ row }: { row: LateRow }) {
  if (row.fine_status === "waived") return <Stamp variant="info">Được miễn</Stamp>;
  if (row.fine_status === "paid") return <Stamp variant="success">Đã trả</Stamp>;
  if ((row.outstanding_vnd ?? 0) > 0) return <Stamp variant="error">Còn nợ</Stamp>;
  if (!row.fine_id) return <Stamp variant="warning">Chờ phiếu</Stamp>;
  return <Stamp variant="muted">Xử lý</Stamp>;
}

function formatWorkDateLocal(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
