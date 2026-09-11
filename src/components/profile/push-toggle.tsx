"use client";

import { useEffect, useState } from "react";

import { Toggle, useToast } from "@/components/ui";
import { disablePush, enablePush, getPushState } from "@/lib/push/client";

const REASON_LABEL: Record<string, string> = {
  unsupported: "Thiết bị/trình duyệt này không hỗ trợ Web Push.",
  missing_key: "Thiếu cấu hình VAPID public key.",
  denied: "Bạn đã chặn thông báo. Mở cài đặt trình duyệt để cho phép.",
  bad_keys: "Không tạo được khóa đăng ký.",
  signed_out: "Bạn đã đăng xuất.",
  save_failed: "Không lưu được đăng ký. Thử lại sau.",
};

function logPush(message: string, details?: Record<string, unknown>) {
  console.info(`[Push] ${message}`, details ?? {});
}

async function buildDiagnostics(lastError: string): Promise<string> {
  const info: Record<string, unknown> = {
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "n/a",
    serviceWorker: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    pushManager: typeof window !== "undefined" && "PushManager" in window,
    notification: typeof window !== "undefined" && "Notification" in window,
    permission: typeof window !== "undefined" && "Notification" in window ? Notification.permission : "n/a",
    lastError,
  };
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    info.swScope = reg?.scope ?? "none";
    info.swActive = reg?.active?.state ?? "none";
    const sub = await reg?.pushManager.getSubscription();
    info.subscribed = sub !== null && sub !== undefined;
    info.endpoint = sub?.endpoint?.slice(0, 60) ?? "none";
  } catch (err) {
    info.diagnosticsError = String(err);
  }
  return JSON.stringify(info);
}

export function PushToggle() {
  const { success, error } = useToast();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Đang kiểm tra...");
  const [diagnostics, setDiagnostics] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPushState()
      .then((state) => {
        if (cancelled) return;
        if (!state.supported) {
          setSupported(false);
          setStatus("Thiết bị/trình duyệt này không hỗ trợ Web Push.");
          logPush("unsupported environment", { userAgent: navigator.userAgent });
          return;
        }
        setSupported(true);
        setEnabled(state.subscribed);
        setStatus(
          state.permission === "denied"
            ? "Trình duyệt đang chặn thông báo cho trang này."
            : state.subscribed
              ? "Đang bật trên thiết bị này."
              : "Đang tắt.",
        );
        logPush("state loaded", { permission: state.permission, subscribed: state.subscribed });
      })
      .catch((err) => {
        if (cancelled) return;
        setSupported(false);
        setStatus("Không kiểm tra được trạng thái.");
        logPush("state check failed", { error: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onChange(next: boolean) {
    setBusy(true);
    try {
      if (next) {
        logPush("enabling...");
        const result = await enablePush();
        logPush("enable result", { ok: result.ok, reason: !result.ok ? result.reason : undefined });
        if (result.ok) {
          setEnabled(true);
          setStatus("Đang bật trên thiết bị này.");
          success("Đã bật thông báo đẩy trên thiết bị này.");
        } else {
          setStatus(REASON_LABEL[result.reason] ?? "Không bật được thông báo.");
          error(REASON_LABEL[result.reason] ?? "Không bật được thông báo.");
        }
      } else {
        await disablePush();
        setEnabled(false);
        setStatus("Đang tắt.");
        success("Đã tắt thông báo đẩy trên thiết bị này.");
      }
    } catch (err) {
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      logPush("toggle failed with exception", { error: message });
      setStatus(`Lỗi: ${message}`);
      setDiagnostics(await buildDiagnostics(message));
      error(`Không đổi được trạng thái: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function copyDiagnostics() {
    const text = diagnostics || (await buildDiagnostics("manual"));
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setDiagnostics(text);
      error("Không sao chép được, xem nội dung bên dưới.");
    }
  }

  async function testLocalNotification() {
    try {
      if (!("serviceWorker" in navigator) || !("Notification" in window)) {
        error("Trình duyệt không hỗ trợ notification.");
        return;
      }
      if (Notification.permission !== "granted") {
        setStatus("Trình duyệt chưa được cấp quyền thông báo.");
        error("Trình duyệt chưa được cấp quyền thông báo.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const options = {
        body: "Nếu thấy thông báo này thì Android/browser cho phép hiển thị notification.",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: "/profile" },
        requireInteraction: true,
        renotify: true,
        vibrate: [120, 80, 120],
        tag: `local-test-${Date.now()}`,
      } as NotificationOptions;
      await registration.showNotification("TeamHub local test", options);
      const notifications = await registration.getNotifications();
      setStatus(`Local test đã tạo ${notifications.length} notification trong Chrome.`);
      setDiagnostics(
        await buildDiagnostics(
          `local_test_created_${notifications.length}_notifications:${notifications.map((item) => item.title).join(",")}`,
        ),
      );
      success("Đã gọi notification test trên thiết bị này.");
    } catch (err) {
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      setStatus(`Lỗi local test: ${message}`);
      setDiagnostics(await buildDiagnostics(message));
      error(`Không hiện được notification test: ${message}`);
    }
  }

  return (
    <section className="paper-panel space-y-2 p-5 sm:p-6">
      <Toggle
        label="Thông báo đẩy"
        description="Nhận báo khi có phiếu phạt mới hoặc thanh toán thành công. iOS cần thêm app vào Màn hình chính."
        checked={enabled}
        disabled={busy || supported === false}
        onChange={(event) => onChange(event.target.checked)}
      />
      <p className="px-1 text-xs text-[var(--ink-soft)]">{busy ? "Đang xử lý..." : status}</p>
      <div className="px-1">
        <button
          type="button"
          onClick={testLocalNotification}
          className="mr-4 text-xs font-bold text-[var(--signal)]"
        >
          Test trên máy này
        </button>
        <button
          type="button"
          onClick={copyDiagnostics}
          className="text-xs font-bold text-[var(--signal)]"
        >
          {copied ? "Đã sao chép!" : "Sao chép chẩn đoán"}
        </button>
        {diagnostics ? (
          <p className="mt-1 break-all text-[11px] text-[var(--ink-soft)]">{diagnostics}</p>
        ) : null}
      </div>
    </section>
  );
}
