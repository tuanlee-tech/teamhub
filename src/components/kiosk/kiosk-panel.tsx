"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";
import { ModuleShell } from "@/components/module-shell";

type CheckInFeedItem = {
  id: string;
  user_id: string;
  method: "gps" | "qr";
  succeeded: boolean;
  rejection_reason: string | null;
  distance_m: number | null;
  gps_accuracy_m: number | null;
  server_received_at: string;
  display_name: string | null;
  username: string | null;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function methodLabel(method: "gps" | "qr") {
  return method === "gps" ? "GPS" : "QR";
}

function reasonLabel(reason: string | null) {
  const map: Record<string, string> = {
    office_not_configured: "Văn phòng chưa cấu hình",
    gps_accuracy_too_low: "GPS kém chính xác",
    outside_office_geofence: "Ngoài khu vực",
    invalid_or_expired_token: "QR hết hạn/sai",
    not_on_roster: "Không trong danh sách điểm danh",
  };
  return reason ? (reason in map ? map[reason] : reason) : "—";
}

export function KioskPanel() {
  const env = getPublicEnv();
  const supabase = createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  const [token, setToken] = useState<string>("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [feed, setFeed] = useState<CheckInFeedItem[]>([]);
  const [isWakeLocked, setIsWakeLocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready">("idle");
  const isMountedRef = useRef(false);

  const refreshIntervalRef = useRef<number | undefined>(undefined);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const orgIdRef = useRef<string>("");
  const cleanupRef = useRef<(() => void) | undefined>(undefined);

  async function generateQr() {
    if (!orgIdRef.current) return;
    try {
      const { data, error: fnError } = await supabase.rpc("create_kiosk_qr_challenge", {
        organization_id: orgIdRef.current,
      });

      if (fnError) throw fnError;
      const newToken = data as string;
      setToken(newToken);
      const dataUrl = await QRCode.toDataURL(newToken, { width: 280, margin: 2, color: { dark: "#000000", light: "#ffffff" } });
      setQrDataUrl(dataUrl);
    } catch {
      setError("Không tạo được mã QR. Kiểm tra quyền manager.");
    }
  }

  async function fetchRecentFeed() {
    if (!orgIdRef.current) return;
    const today = new Date().toISOString().split("T")[0];
    try {
      const { data: dayRow } = await supabase
        .from("attendance_days")
        .select("id")
        .eq("organization_id", orgIdRef.current)
        .eq("work_date", today)
        .maybeSingle();

      if (!dayRow?.id) return;

      const { data: attempts } = await supabase
        .from("check_in_attempts")
        .select("id, user_id, method, succeeded, rejection_reason, distance_m, gps_accuracy_m, server_received_at")
        .eq("attendance_day_id", dayRow.id)
        .order("server_received_at", { ascending: false })
        .limit(50);

      if (!attempts?.length) return;

      const userIds = [...new Set(attempts.map((a) => a.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, username")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);
      const enriched = attempts.map((a) => ({
        ...a,
        display_name: profileMap.get(a.user_id)?.display_name ?? null,
        username: profileMap.get(a.user_id)?.username ?? null,
      }));
      setFeed(enriched);
    } catch {
      // silent fail for feed
    }
  }

  async function init(): Promise<() => void> {
    setStatus("loading");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Chưa đăng nhập.");
      setStatus("ready");
      return () => {};
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .eq("is_active", true)
      .maybeSingle();

    if (!membership || membership.role !== "manager") {
      setError("Chỉ manager mới được truy cập kiosk.");
      setStatus("ready");
      return () => {};
    }

    orgIdRef.current = membership.organization_id;

    await generateQr();
    await fetchRecentFeed();

    const channel = supabase
      .channel("kiosk-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "check_in_attempts", filter: `organization_id=eq.${membership.organization_id}` },
        (payload) => {
          const newItem = payload.new as CheckInFeedItem;
          supabase
            .from("profiles")
            .select("display_name, username")
            .eq("user_id", newItem.user_id)
            .single()
            .then(({ data: profile }) => {
              setFeed((prev) => [
                { ...newItem, display_name: profile?.display_name ?? null, username: profile?.username ?? null },
                ...prev.slice(0, 49),
              ]);
            });
        },
      )
      .subscribe();

    refreshIntervalRef.current = window.setInterval(async () => {
      await generateQr();
    }, 30_000);

    const feedInterval = window.setInterval(fetchRecentFeed, 30_000);

    setStatus("ready");

    return () => {
      channel.unsubscribe();
      clearInterval(refreshIntervalRef.current);
      clearInterval(feedInterval);
    };
  }

  useEffect(() => {
    isMountedRef.current = true;
    let cleanupFn: (() => void) | undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    init().then((fn) => {
      cleanupFn = fn;
    });
    return () => {
      if (cleanupFn) cleanupFn();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestWakeLock() {
    try {
      const sentinel = await (navigator as Navigator & { wakeLock?: { request(type: string): Promise<WakeLockSentinel> } }).wakeLock?.request("screen");
      if (sentinel) {
        wakeLockRef.current = sentinel;
        sentinel.addEventListener("release", () => setIsWakeLocked(false));
        setIsWakeLocked(true);
      }
    } catch {
      setError("Trình duyệt không hỗ trợ Wake Lock.");
    }
  }

  async function releaseWakeLock() {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }

  if (status === "loading") {
    return (
      <ModuleShell eyebrow="Kiosk" title="Đang tải..." description="Khởi tạo mã QR và kết nối realtime">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[var(--signal)] border-t-transparent" />
        </div>
      </ModuleShell>
    );
  }

  if (error) {
    return (
      <ModuleShell eyebrow="Kiosk" title="Lỗi" description={error}>
        <div className="paper-panel p-8 text-center text-red-700">{error}</div>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell
      eyebrow="Kiosk"
      title="Màn hình điểm danh"
      description="Mã QR tự làm mới 30 giây. Danh sách cập nhật realtime. Hãy bật chế độ toàn màn hình và Wake Lock."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="paper-panel p-6 sm:p-8 overflow-hidden">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-6">
            <div>
              <p className="text-sm font-black tracking-[0.16em] text-[var(--signal)] uppercase">Hoạt động hôm nay</p>
              <h1 className="display-type mt-3 text-5xl sm:text-7xl">Check-in Feed</h1>
            </div>
            <p className="metric-number display-type text-5xl text-[var(--ink-soft)]">{feed.length}</p>
          </div>

          <div className="mt-6 max-h-[60vh] overflow-y-auto">
            {feed.length === 0 ? (
              <p className="text-center text-[var(--ink-soft)] py-12">Chưa có hoạt động nào. Mã QR sẵn sàng quét.</p>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {feed.map((item) => (
                  <li key={item.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                        item.succeeded ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                      }`}>
                        {item.succeeded ? "✓ Thành công" : "✗ Thất bại"}
                      </span>
                      <span className="font-black">{item.display_name ?? "Thành viên"}</span>
                      <span className="text-sm text-[var(--ink-soft)]">@{item.username ?? "—"}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--ink-soft)]">
                      <span className="font-semibold">{methodLabel(item.method)}</span>
                      {!item.succeeded && <span className="text-red-700">{reasonLabel(item.rejection_reason)}</span>}
                      {item.succeeded && item.distance_m != null && (
                        <span>{Math.round(item.distance_m)} m</span>
                      )}
                      {item.gps_accuracy_m != null && (
                        <span>±{Math.round(item.gps_accuracy_m)} m</span>
                      )}
                      <time>{formatTime(item.server_received_at)}</time>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="grid gap-6 rounded-3xl border border-[var(--line)] bg-white p-6 sm:p-8">
          <div>
            <p className="text-sm font-bold tracking-[0.16em] text-[var(--signal)] uppercase">Mã QR điểm danh</p>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">Hiệu lực 30 giây. Tự làm mới.</p>
            <div className="mt-6 grid aspect-square max-w-[320px] place-items-center rounded-2xl bg-white p-6 border border-[var(--line)]">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR check-in" className="max-w-full max-h-full" />
              ) : (
                <p className="text-[var(--ink-soft)]">Đang tạo…</p>
              )}
            </div>
            <div className="mt-4 text-xs font-mono text-[var(--ink-soft)] break-all">{token}</div>
          </div>

          <div className="grid gap-3 border-t border-[var(--line)] pt-6">
            <button
              onClick={requestWakeLock}
              disabled={isWakeLocked}
              className="primary-action"
            >
              {isWakeLocked ? "🔒 Wake Lock đã bật" : "🔆 Bật Wake Lock (giữ màn hình sáng)"}
            </button>
            <button onClick={toggleFullscreen} className="primary-action bg-transparent border border-[var(--line)]">
              {isFullscreen ? "⛶ Thoát toàn màn hình" : "⛶ Toàn màn hình"}
            </button>
            {error && <p className="text-sm text-red-700">{error}</p>}
          </div>
        </aside>
      </div>
    </ModuleShell>
  );
}
