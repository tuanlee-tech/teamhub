"use client";

import { CalendarDays, LogOut, Maximize, Mic, MicOff, QrCode, ScreenShare, Timer } from "lucide-react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";

import { signOut } from "@/app/(auth)/actions";
import { PaymentQrPanel } from "@/components/qr/payment-qr-panel";
import { CurrencyText, Logo, Modal, SecondaryButton, Stamp, Toggle, useToast } from "@/components/ui";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { formatTimeInTimezone } from "@/lib/domain/date";
import type { PaymentBank } from "@/lib/domain/payment";
import { useOrganizationRealtime } from "@/lib/realtime/organization-events";
import { createClient } from "@/lib/supabase/client";
import {
  createTtsEngine,
  normalizeTtsConfig,
  ttsConfigFromRow,
  type TtsAnnouncement,
  type TtsConfig,
  type TtsEngine,
} from "@/lib/tts";
import Link from "next/link";

type SessionInfo = {
  active: boolean;
  work_date: string | null;
  session_start_at: string | null;
  session_end_at: string | null;
  last_successful_check_in_at?: string | null;
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

const CODE_TTL_MS = 30 * 60 * 1000;

/** Coalesce late-list reload khi event dồn (giống B05). */
export const KIOSK_LATE_RELOAD_COALESCE_MS = 250;
/** Dedup consumer-level cho feed/toast/TTS/QR rotation (event_id, TTL 5 phút). */
export const KIOSK_SEEN_TTL_MS = 5 * 60 * 1000;
export const KIOSK_SEEN_MAX_ENTRIES = 500;

export type KioskLateScopeEvent =
  | { kind: "check-in-status"; work_date?: string | null }
  | { kind: "attendance-status"; work_date?: string | null }
  | { kind: "fine-status"; work_date?: string | null; fine_id?: string | null }
  | {
      kind: "fine-allocation-status";
      work_date?: string | null;
      old_work_date?: string | null;
      fine_id?: string | null;
      old_fine_id?: string | null;
    }
  | { kind: "fund-status"; related_fine_ids?: string[] | null };

/**
 * Quyết định event realtime có liên quan work_date kiosk đang xem hay không.
 * Payload Broadcast là flat (không nested `payload`), chỉ đọc trường cùng cấp.
 * Quy tắc: thiếu scope (null) thì reload để không bỏ sót; khác ngày và fine
 * không thuộc danh sách hiện tại thì bỏ qua để tránh reload vô ích.
 */
export function shouldReloadKioskLateForEvent(
  event: KioskLateScopeEvent,
  workDate: string,
  knownFineIds: Iterable<string> | null,
): boolean {
  const known = knownFineIds ? new Set(knownFineIds) : new Set<string>();
  const hasKnown = (id: string | null | undefined) => !!id && known.has(id);

  switch (event.kind) {
    case "check-in-status":
    case "attendance-status": {
      if (event.work_date == null) return true;
      return event.work_date === workDate;
    }
    case "fine-status": {
      if (event.work_date == null) return true;
      if (event.work_date === workDate) return true;
      // Fine chuyển ngày: scope cũ (đang xem) vẫn cần reload dù work_date mới khác.
      return hasKnown(event.fine_id);
    }
    case "fine-allocation-status": {
      if (event.work_date === workDate || event.old_work_date === workDate) return true;
      if (hasKnown(event.fine_id) || hasKnown(event.old_fine_id)) return true;
      // Cả hai scope đều null/unknown: chỉ reload khi allocation chạm fine đang hiển thị.
      if (event.work_date == null && event.old_work_date == null) return false;
      return false;
    }
    case "fund-status": {
      const related = event.related_fine_ids ?? [];
      if (related.length === 0) return false;
      return related.some((id) => known.has(id));
    }
  }
}

export type KioskCheckInAnnouncementInput = {
  event_id?: string | null;
  attempt_id: number;
  display_name?: string | null;
  attendance_state?: string | null;
  late_minutes?: number | null;
  server_received_at?: string | null;
  succeeded: boolean;
};

/**
 * Map check-in thành công sang announcement `on_time`/`late` theo trạng thái
 * chuẩn. Check-in thất bại trả null (chỉ toast/feed, không đọc).
 */
export function mapCheckInToAnnouncement(input: KioskCheckInAnnouncementInput): TtsAnnouncement | null {
  if (!input.succeeded) return null;
  const rawEventId = input.event_id?.trim() ? (input.event_id as string).trim() : "";
  const eventId = rawEventId || `checkin-${input.attempt_id}-${input.server_received_at ?? "live"}`;
  const announcementType = input.attendance_state === "late" ? "late" : "on_time";
  const lateMinutes =
    announcementType === "late" && typeof input.late_minutes === "number" && Number.isFinite(input.late_minutes)
      ? Math.round(input.late_minutes)
      : undefined;
  return {
    eventId,
    announcementType,
    displayName: input.display_name ?? null,
    ...(lateMinutes !== undefined ? { lateMinutes } : {}),
  };
}

export type KioskFineAnnouncementInput = {
  event_id?: string | null;
  fine_id: string;
  fine_code?: string | null;
  status: string;
};

/**
 * Chỉ fine chuyển sang `paid` mới đọc (announcement `payment`).
 * Waived/unpaid trả null — miễn phạt không được đọc như đã thanh toán.
 */
export function mapFineToPaymentAnnouncement(input: KioskFineAnnouncementInput): TtsAnnouncement | null {
  if (input.status !== "paid") return null;
  const rawEventId = input.event_id?.trim() ? (input.event_id as string).trim() : "";
  return {
    eventId: rawEventId || `fine-${input.fine_id}-paid`,
    announcementType: "payment",
    displayName: null,
    fineCode: input.fine_code ?? undefined,
  };
}

/**
 * Dedup consumer-level cho feed/toast/TTS/QR rotation theo event key
 * (event_id, fallback attempt/fine key). Hook đã dedup transport-level;
 * tracker này chặn cùng nghiệp vụ xử lý hai lần (VD cùng attempt deliver
 * hai event_id khác nhau, hoặc payment + allocation + fund cùng giao dịch).
 */
export function createKioskDeduper(options?: {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}) {
  const ttlMs = options?.ttlMs ?? KIOSK_SEEN_TTL_MS;
  const maxEntries = options?.maxEntries ?? KIOSK_SEEN_MAX_ENTRIES;
  const now = options?.now ?? Date.now;
  const seen = new Map<string, number>();

  function prune(at: number) {
    for (const [key, expiry] of seen) {
      if (expiry <= at) seen.delete(key);
    }
    while (seen.size > maxEntries) {
      const oldest = seen.keys().next().value as string | undefined;
      if (!oldest) break;
      seen.delete(oldest);
    }
  }

  return {
    /** Trả true khi key đã thấy (trùng) — caller bỏ qua feed/toast/TTS/rotation. */
    mark(key: string): boolean {
      if (!key) return false;
      const at = now();
      prune(at);
      if (seen.has(key)) return true;
      seen.set(key, at + ttlMs);
      prune(at);
      return false;
    },
    size(): number {
      prune(now());
      return seen.size;
    },
  };
}

export function kioskCheckInDedupKey(event: { event_id?: string | null; attempt_id: number }): string {
  const raw = event.event_id?.trim() ? (event.event_id as string).trim() : "";
  return raw || `checkin-${event.attempt_id}`;
}

export function kioskFinePaidDedupKey(event: { event_id?: string | null; fine_id: string }): string {
  const raw = event.event_id?.trim() ? (event.event_id as string).trim() : "";
  return raw || `fine-${event.fine_id}-paid`;
}

export type KioskTtsTab = "checkin" | "late";

/**
 * Phân TTS theo tab kiosk để mở 2 tab không đọc trùng:
 * - tab checkin chỉ đọc điểm danh.
 * - tab late chỉ đọc thanh toán.
 * Data reload (feed/toast/late list/rotation) vẫn chạy ở cả 2 tab.
 */
export function shouldSpeakCheckInForKioskTab(tab: KioskTtsTab): boolean {
  return tab === "checkin";
}

export function shouldSpeakPaymentForKioskTab(tab: KioskTtsTab): boolean {
  return tab === "late";
}

function logKioskTts(message: string, details?: Record<string, unknown>) {
  console.info(`[Kiosk TTS] ${message}`, details ?? {});
}

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
  timezone,
  bank,
  initialSession,
  initialTtsConfig,
}: {
  orgId: string;
  timezone: string;
  bank: PaymentBank | null;
  initialSession: SessionInfo | null;
  initialTtsConfig?: TtsConfig | null;
}) {
  const supabase = createClient();
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
  const mcOnRef = useRef(false);
  const [ttsTestReady, setTtsTestReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [wakeLocked, setWakeLocked] = useState(false);

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  // Modal chỉ giữ selected fine id; row luôn tra lại từ snapshot mới nhất để không stale.
  const [selectedFineId, setSelectedFineId] = useState<string | null>(null);

  const defaultLateDate = initialSession?.work_date ?? formatWorkDateLocal(new Date(), timezone);
  const [lateDate, setLateDate] = useState(defaultLateDate);
  const [lateRows, setLateRows] = useState<LateRow[]>([]);
  const [lateLoading, setLateLoading] = useState(false);
  // Late tab đang ẩn: đánh dấu stale thay vì fetch nền, lấy snapshot mới khi mở tab.
  const [lateStale, setLateStale] = useState(false);
  const { success: toastSuccess, error: toastError } = useToast();
  const generateCodesRef = useRef<((force?: boolean) => Promise<void>) | null>(null);
  const lastSuccessfulCheckInRef = useRef<string | null>(initialSession?.last_successful_check_in_at ?? null);

  // B07 realtime/TTS refs.
  const engineRef = useRef<TtsEngine | null>(null);
  const deduperRef = useRef(createKioskDeduper());
  const lateDateRef = useRef(lateDate);
  const liveRowsRef = useRef(lateRows);
  const tabRef = useRef(tab);
  const requestIdRef = useRef(0);
  const coalesceTimerRef = useRef<number | null>(null);
  const rotationInFlightRef = useRef(false);
  const rotationQueuedRef = useRef(false);
  const initialTtsConfigRef = useRef(initialTtsConfig ?? null);

  useEffect(() => {
    mcOnRef.current = mcOn;
  }, [mcOn]);

  useEffect(() => {
    lateDateRef.current = lateDate;
  }, [lateDate]);

  useEffect(() => {
    liveRowsRef.current = lateRows;
  }, [lateRows]);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    initialTtsConfigRef.current = initialTtsConfig ?? null;
  }, [initialTtsConfig]);

  useEffect(() => {
    // Keep browser-only speech controls out of the server/hydration markup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTtsTestReady(true);
  }, []);

  // TTS engine sống theo vòng đời kiosk: tạo một lần, destroy khi unmount.
  // Lỗi/mute loa không bao giờ chặn toast/feed/reload/QR rotation (TTS luôn
  // chạy cuối handler trong try/catch riêng).
  useEffect(() => {
    const engine = createTtsEngine();
    engineRef.current = engine;
    try {
      const config = normalizeTtsConfig(initialTtsConfigRef.current ?? {});
      engine.updateConfig(config, timezone);
      logKioskTts("engine initialized", {
        timezone,
        enabledEvents: config.enabledEvents,
        locale: config.locale,
        preferredVoice: config.preferredVoice,
        cooldownSeconds: config.cooldownSeconds,
        quietEnabled: config.quietEnabled,
        quietStart: config.quietStart,
        quietEnd: config.quietEnd,
        muted: !mcOnRef.current,
      });
      if (!mcOnRef.current) engine.mute();
    } catch (error) {
      logKioskTts("engine init failed", { error });
      // Engine vô hiệu hóa êm — UI nghiệp vụ không bị ảnh hưởng.
    }
    return () => {
      try {
        logKioskTts("engine destroyed");
        engine.destroy();
      } catch {
        // Bỏ qua lỗi cleanup.
      }
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- engine tạo một lần theo vòng đời
  }, []);

  // Config server mới (prop từ page) áp dụng cho lần phát tiếp theo.
  useEffect(() => {
    try {
      const config = normalizeTtsConfig(initialTtsConfig ?? {});
      engineRef.current?.updateConfig(config, timezone);
      logKioskTts("config updated from props", {
        timezone,
        enabledEvents: config.enabledEvents,
        locale: config.locale,
        preferredVoice: config.preferredVoice,
        cooldownSeconds: config.cooldownSeconds,
        quietEnabled: config.quietEnabled,
        quietStart: config.quietStart,
        quietEnd: config.quietEnd,
      });
    } catch (error) {
      logKioskTts("config update from props failed", { error });
      // Giữ config cũ khi normalize lỗi.
    }
  }, [initialTtsConfig, timezone]);

  // Toggle "Đọc kết quả" ánh xạ sang mute/unmute engine.
  useEffect(() => {
    try {
      if (mcOn) {
        engineRef.current?.unmute();
        logKioskTts("local audio toggle on");
      } else {
        engineRef.current?.mute();
        logKioskTts("local audio toggle off");
      }
    } catch (error) {
      logKioskTts("local audio toggle failed", { mcOn, error });
      // Mute/unmute không ảnh hưởng UI nghiệp vụ.
    }
  }, [mcOn]);

  useEffect(
    () => () => {
      if (coalesceTimerRef.current !== null) window.clearTimeout(coalesceTimerRef.current);
    },
    [],
  );

  const qrSecondsRemaining = qrDataUrl
    ? Math.max(0, Math.ceil((codesGeneratedAt + CODE_TTL_MS - now.getTime()) / 1000))
    : 0;
  const otpSecondsRemaining = otp
    ? Math.max(0, Math.ceil((codesGeneratedAt + CODE_TTL_MS - now.getTime()) / 1000))
    : 0;

  const refreshSession = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("kiosk_session_info", {
        p_organization_id: orgId,
      });
      if (error) throw error;
      const nextSession = data as SessionInfo;
      if (
        nextSession.last_successful_check_in_at &&
        nextSession.last_successful_check_in_at !== lastSuccessfulCheckInRef.current
      ) {
        lastSuccessfulCheckInRef.current = nextSession.last_successful_check_in_at;
        generateCodesRef.current?.(true).catch(() => { });
      }
      setSession(nextSession);
    } catch {
      setSessionError("Không xác định được trạng thái ca làm.");
    }
  }, [supabase, orgId]);

  const generateCodes = useCallback(
    async (force = false) => {
      if (!session?.active) return;
      const age = Date.now() - codesGeneratedAt;
      if (!force && age < CODE_TTL_MS && qrToken) return;
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

  useEffect(() => {
    generateCodesRef.current = generateCodes;
  }, [generateCodes]);

  /**
   * Serialize/coalesce QR rotation: event dồn không tạo nhiều lượt generate
   * cạnh tranh. Lượt đang chạy xong sẽ chạy thêm đúng một lượt nếu có event
   * mới đến trong lúc đó. Nghiệp vụ QR/OTP core (TTL/revoke/throttling) giữ nguyên.
   */
  const requestQrRotation = useCallback(() => {
    if (rotationInFlightRef.current) {
      rotationQueuedRef.current = true;
      return;
    }
    rotationInFlightRef.current = true;
    function pump(): void {
      const run = generateCodesRef.current;
      if (!run) {
        rotationInFlightRef.current = false;
        return;
      }
      run(true)
        .catch(() => { })
        .finally(() => {
          if (rotationQueuedRef.current) {
            rotationQueuedRef.current = false;
            pump();
          } else {
            rotationInFlightRef.current = false;
          }
        });
    }
    pump();
  }, []);

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
    // Session boundaries change slowly; avoid turning every kiosk into a
    // two-second RPC poller (each browser call also creates a CORS preflight).
    const refresh = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshSession().catch(() => { });
      }
    }, 30_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshSession().catch(() => { });
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(refresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshSession]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial session load
    refreshSession().catch(() => { });
  }, [refreshSession]);

  useEffect(() => {
    if (!session?.active) {
      const resetTimer = window.setTimeout(() => {
        setQrDataUrl("");
        setQrToken("");
        setOtp("");
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }

    generateCodesRef.current?.();
    const gen = window.setInterval(() => generateCodesRef.current?.(), 10_000);
    return () => window.clearInterval(gen);
  }, [session?.active]);

  const loadLate = useCallback(
    async (date: string) => {
      const requestId = (requestIdRef.current += 1);
      setLateLoading(true);
      try {
        const { data } = await supabase.rpc("get_daily_late_list", {
          p_organization_id: orgId,
          p_work_date: date,
        });
        // Response của ngày cũ không được ghi đè ngày mới.
        if (requestIdRef.current !== requestId) return;
        if (lateDateRef.current !== date) return;
        setLateRows((data ?? []) as LateRow[]);
        if (tabRef.current === "late") setLateStale(false);
      } catch {
        if (requestIdRef.current !== requestId) return;
        if (lateDateRef.current !== date) return;
        setLateRows([]);
      } finally {
        if (requestIdRef.current === requestId && lateDateRef.current === date) {
          setLateLoading(false);
        }
      }
    },
    [supabase, orgId],
  );

  const scheduleLateReload = useCallback(() => {
    if (coalesceTimerRef.current !== null) return;
    coalesceTimerRef.current = window.setTimeout(() => {
      coalesceTimerRef.current = null;
      loadLate(lateDateRef.current).catch(() => { });
    }, KIOSK_LATE_RELOAD_COALESCE_MS);
  }, [loadLate]);

  /** Late tab đang ẩn thì đánh dấu stale; snapshot mới được lấy khi mở tab. */
  const handleLateInvalidation = useCallback(() => {
    if (tabRef.current !== "late") {
      setLateStale(true);
      return;
    }
    scheduleLateReload();
  }, [scheduleLateReload]);

  const shouldReloadFor = useCallback((event: KioskLateScopeEvent) => {
    const knownFineIds = liveRowsRef.current
      .map((row) => row.fine_id)
      .filter((id): id is string => !!id);
    return shouldReloadKioskLateForEvent(event, lateDateRef.current, knownFineIds);
  }, []);

  // Mở late tab sau thời gian ở tab khác: lấy snapshot mới nếu đã stale.
  useEffect(() => {
    if (tab === "late" && lateStale) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch snapshot khi mở tab stale
      setLateStale(false);
      loadLate(lateDateRef.current).catch(() => { });
    }
  }, [tab, lateStale, loadLate]);

  const loadRecentFeed = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_recent_check_in_attempts", {
      p_organization_id: orgId,
      p_limit: 10,
    });
    if (error) return;

    setFeed(
      ((data ?? []) as Array<{
        attempt_id: number;
        user_id: string;
        display_name: string | null;
        method: FeedItem["method"];
        succeeded: boolean;
        rejection_reason: string | null;
        server_received_at: string;
      }>).map((item) => ({
        id: String(item.attempt_id),
        user_id: item.user_id,
        display_name: item.display_name,
        method: item.method,
        succeeded: item.succeeded,
        rejection_reason: item.rejection_reason,
        server_received_at: item.server_received_at,
      })),
    );
  }, [supabase, orgId]);

  /** Reload TTS settings từ server; áp dụng cho lần phát tiếp theo. */
  const loadTtsSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("tts_settings")
        .select("*")
        .eq("organization_id", orgId)
        .maybeSingle();
      if (error || !data) return;
      const config = ttsConfigFromRow(data);
      engineRef.current?.updateConfig(config, timezone);
      logKioskTts("settings loaded from server", {
        timezone,
        enabledEvents: config.enabledEvents,
        locale: config.locale,
        preferredVoice: config.preferredVoice,
        cooldownSeconds: config.cooldownSeconds,
        quietEnabled: config.quietEnabled,
        quietStart: config.quietStart,
        quietEnd: config.quietEnd,
        updatedAt: (data as { updated_at?: string | null }).updated_at ?? null,
      });
    } catch (error) {
      logKioskTts("settings load failed", { error });
      // Giữ config cũ — settings lỗi không ảnh hưởng UI nghiệp vụ.
    }
  }, [supabase, orgId, timezone]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial activity snapshot
    loadRecentFeed().catch(() => { });
  }, [loadRecentFeed]);

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

  /** Nút test loa dùng cùng engine (bypass quiet/cooldown/dedup theo contract §5.5). */
  const speakTest = useCallback(
    (text: string) => {
      try {
        if (!("speechSynthesis" in window)) {
          logKioskTts("test skipped: Speech API unavailable", { text });
          toastError("Trình duyệt không hỗ trợ đọc TTS.");
          return;
        }
        logKioskTts("test speak", { text, muted: !mcOnRef.current });
        engineRef.current?.speakTest(text);
      } catch (error) {
        logKioskTts("test speak failed", { text, error });
        // Test loa lỗi không ảnh hưởng nghiệp vụ.
      }
    },
    [toastError],
  );

  useOrganizationRealtime(
    orgId,
    {
      onCheckIn: (event) => {
        // Dedup feed/toast/TTS/QR rotation theo event_id, fallback attempt_id:
        // cùng attempt deliver hai lần (hai event_id) vẫn chỉ xử lý một lần.
        const eventKey = event.event_id?.trim() ? event.event_id.trim() : "";
        if (eventKey && deduperRef.current.mark(eventKey)) {
          logKioskTts("check-in skipped: duplicate event_id", {
            eventId: event.event_id,
            attemptId: event.attempt_id,
            activeTab: tabRef.current,
          });
          return;
        }
        if (deduperRef.current.mark(`attempt:${event.attempt_id}`)) {
          logKioskTts("check-in skipped: duplicate attempt", {
            eventId: event.event_id,
            attemptId: event.attempt_id,
            activeTab: tabRef.current,
          });
          return;
        }

        const name = event.display_name ?? "Có thành viên";
        const item: FeedItem = {
          id: String(event.attempt_id),
          user_id: event.user_id,
          method: event.method,
          succeeded: event.succeeded,
          rejection_reason: event.rejection_reason,
          server_received_at: event.server_received_at,
          display_name: event.display_name,
        };
        setFeed((prev) => [item, ...prev.filter((current) => current.id !== item.id).slice(0, 9)]);
        try {
          if (event.succeeded) {
            toastSuccess(`${name} đã điểm danh.`);
          } else {
            toastError(`${name}: ${reasonLabel(event.rejection_reason)}.`);
          }
        } catch {
          // Toast lỗi không chặn rotation/reload/TTS.
        }
        if (event.succeeded) {
          lastSuccessfulCheckInRef.current = event.server_received_at;
          try {
            requestQrRotation();
          } catch {
            // Rotation lỗi không chặn reload/TTS.
          }
        }
        if (shouldReloadFor({ kind: "check-in-status", work_date: event.work_date })) {
          handleLateInvalidation();
        }
        // TTS cuối cùng, try/catch riêng: mute/error không ảnh hưởng các bước trên.
        // Phân TTS theo tab: tab late không bao giờ đọc check-in.
        // Check-in thất bại không đọc — chỉ toast/feed.
        if (!event.succeeded) {
          logKioskTts("check-in not spoken: failed attempt", {
            eventId: event.event_id,
            attemptId: event.attempt_id,
            reason: event.rejection_reason,
            activeTab: tabRef.current,
          });
        } else if (!shouldSpeakCheckInForKioskTab(tabRef.current)) {
          logKioskTts("check-in ignored on late tab: check-in speeches only on checkin tab", {
            eventId: event.event_id,
            attemptId: event.attempt_id,
            attendanceState: event.attendance_state ?? null,
            activeTab: tabRef.current,
          });
        } else if (!mcOnRef.current) {
          logKioskTts("check-in not spoken: local audio off", {
            eventId: event.event_id,
            attemptId: event.attempt_id,
            attendanceState: event.attendance_state ?? null,
            activeTab: tabRef.current,
          });
        } else {
          try {
            const announcement = mapCheckInToAnnouncement({
              event_id: event.event_id,
              attempt_id: event.attempt_id,
              display_name: event.display_name,
              attendance_state: event.attendance_state ?? null,
              late_minutes: event.late_minutes ?? null,
              server_received_at: event.server_received_at,
              succeeded: true,
            });
            if (announcement) {
              logKioskTts("check-in enqueue", {
                eventId: announcement.eventId,
                announcementType: announcement.announcementType,
                displayName: announcement.displayName,
                lateMinutes: announcement.lateMinutes ?? null,
                attendanceState: event.attendance_state ?? null,
                activeTab: tabRef.current,
              });
              engineRef.current?.enqueue(announcement);
            } else {
              logKioskTts("check-in not spoken: no announcement", {
                eventId: event.event_id,
                attemptId: event.attempt_id,
                attendanceState: event.attendance_state ?? null,
              });
            }
          } catch (error) {
            logKioskTts("check-in enqueue failed", { eventId: event.event_id, attemptId: event.attempt_id, error });
            // Bỏ qua lỗi loa.
          }
        }
      },
      onAttendance: (event) => {
        if (shouldReloadFor({ kind: "attendance-status", work_date: event.work_date })) {
          handleLateInvalidation();
        }
      },
      onFine: (event) => {
        // Dedup transport: cùng event_id deliver 2 lần thì bỏ lần 2.
        // Không dedup theo fine_id vì cùng fine có nhiều event hợp lệ
        // (unpaid -> paid, rollback -> unpaid). Reload luôn chạy.
        const eventKey = event.event_id?.trim() ? event.event_id.trim() : "";
        if (eventKey && deduperRef.current.mark(eventKey)) {
          logKioskTts("fine skipped: duplicate event_id", {
            eventId: event.event_id,
            fineId: event.fine_id,
            fineCode: event.fine_code ?? null,
            activeTab: tabRef.current,
          });
          return;
        }

        if (
          shouldReloadFor({ kind: "fine-status", work_date: event.work_date, fine_id: event.fine_id })
        ) {
          handleLateInvalidation();
        }
        // Phân TTS theo tab trước khi xét status để 2 tab log khác nhau:
        // tab checkin không bao giờ đọc fine, tab late mới xét paid/unpaid.
        // Payment chỉ đọc một lần khi fine chuyển paid; waived không đọc như payment.
        // Allocation/fund cùng giao dịch không enqueue thêm (engine cũng dedup
        // payment theo fineCode trong 60s theo contract §8.3).
        if (!shouldSpeakPaymentForKioskTab(tabRef.current)) {
          logKioskTts("fine ignored on checkin tab: payment speeches only on late tab", {
            eventId: event.event_id,
            fineId: event.fine_id,
            fineCode: event.fine_code ?? null,
            status: event.status,
            activeTab: tabRef.current,
          });
        } else if (event.status !== "paid") {
          logKioskTts("fine not spoken: status is not paid", {
            eventId: event.event_id,
            fineId: event.fine_id,
            fineCode: event.fine_code ?? null,
            status: event.status,
            activeTab: tabRef.current,
          });
        } else if (!mcOnRef.current) {
          logKioskTts("payment not spoken: local audio off", {
            eventId: event.event_id,
            fineId: event.fine_id,
            fineCode: event.fine_code ?? null,
            activeTab: tabRef.current,
          });
        } else {
          try {
            const announcement = mapFineToPaymentAnnouncement({
              event_id: event.event_id,
              fine_id: event.fine_id,
              fine_code: event.fine_code ?? null,
              status: event.status,
            });
            if (announcement) {
              logKioskTts("payment enqueue", {
                eventId: announcement.eventId,
                fineId: event.fine_id,
                fineCode: announcement.fineCode ?? null,
                activeTab: tabRef.current,
              });
              engineRef.current?.enqueue(announcement);
            } else {
              logKioskTts("payment not spoken: no announcement", {
                eventId: event.event_id,
                fineId: event.fine_id,
                fineCode: event.fine_code ?? null,
              });
            }
          } catch (error) {
            logKioskTts("payment enqueue failed", { eventId: event.event_id, fineId: event.fine_id, error });
            // Bỏ qua lỗi loa.
          }
        }
      },
      onFineAllocation: (event) => {
        if (
          shouldReloadFor({
            kind: "fine-allocation-status",
            work_date: event.work_date,
            old_work_date: event.old_work_date,
            fine_id: event.fine_id,
            old_fine_id: event.old_fine_id,
          })
        ) {
          handleLateInvalidation();
        }
      },
      onFund: (event) => {
        if (
          shouldReloadFor({ kind: "fund-status", related_fine_ids: event.related_fine_ids ?? [] })
        ) {
          handleLateInvalidation();
        }
      },
      onTtsSettings: () => {
        logKioskTts("settings realtime event received");
        loadTtsSettings().catch(() => { });
      },
    },
    {
      // Reconnect/subscribe thành công: lấy lại snapshot (late/feed/settings),
      // không phát lại TTS/toast lịch sử.
      onSnapshotReady: () => {
        logKioskTts("snapshot ready: reload settings/feed/session/late without replaying TTS");
        loadTtsSettings().catch(() => { });
        loadRecentFeed().catch(() => { });
        refreshSession().catch(() => { });
        handleLateInvalidation();
      },
    },
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
  // Tra row mới nhất theo selected fine id để payment/waive/allocation cập nhật modal ngay.
  const selectedRow = selectedFineId ? (lateRows.find((row) => row.fine_id === selectedFineId) ?? null) : null;

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
                {ttsTestReady ? (
                  <div className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-3">
                    <p className="text-xs font-black tracking-[0.16em] text-[var(--ink-soft)] uppercase">
                      Kiểm tra loa
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <SecondaryButton type="button" fullWidth={false} onClick={() => speakTest("Xin chào, đây là bài kiểm tra loa.")}>
                        Xin chào
                      </SecondaryButton>
                      <SecondaryButton type="button" fullWidth={false} onClick={() => speakTest("Nguyễn Văn An đã điểm danh.")}>
                        Thành công
                      </SecondaryButton>
                      <SecondaryButton type="button" fullWidth={false} onClick={() => speakTest("Nguyễn Văn An điểm danh thất bại. Mã QR không hợp lệ.")}>
                        Thất bại
                      </SecondaryButton>
                    </div>
                  </div>
                ) : null}
              </section>

              <aside className="paper-panel space-y-4 p-5 ">
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
                              onClick={() => row.fine_id && setSelectedFineId(row.fine_id)}
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

      <Modal open={selectedFineId !== null} onClose={() => setSelectedFineId(null)} title="QR thanh toán">
        {selectedRow?.fine_id ? (
          <PaymentQrPanel
            fineCode={selectedRow.fine_code ?? "—"}
            originalVnd={selectedRow.original_vnd ?? 0}
            allocatedVnd={selectedRow.allocated_vnd ?? 0}
            outstandingVnd={selectedRow.outstanding_vnd ?? 0}
            status={(selectedRow.fine_status as "unpaid" | "paid" | "waived") ?? "unpaid"}
            memberName={selectedRow.display_name ?? "Thành viên"}
            bank={bank}
          />
        ) : (
          <p className="px-1 py-6 text-center text-sm text-[var(--ink-soft)]">
            Phiếu này đã chuyển trạng thái hoặc không còn trong ngày đang xem.
          </p>
        )}
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
