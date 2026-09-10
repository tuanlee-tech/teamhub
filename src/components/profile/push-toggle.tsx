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

export function PushToggle() {
  const { success, error } = useToast();
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPushState().then((state) => {
      if (cancelled) return;
      if (!state.supported) {
        setSupported(false);
        return;
      }
      setEnabled(state.subscribed);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!supported) return null;

  async function onChange(next: boolean) {
    setBusy(true);
    try {
      if (next) {
        const result = await enablePush();
        if (result.ok) {
          setEnabled(true);
          success("Đã bật thông báo đẩy trên thiết bị này.");
        } else {
          error(REASON_LABEL[result.reason] ?? "Không bật được thông báo.");
        }
      } else {
        await disablePush();
        setEnabled(false);
        success("Đã tắt thông báo đẩy trên thiết bị này.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="paper-panel space-y-2 p-5 sm:p-6">
      <Toggle
        label="Thông báo đẩy"
        description="Nhận báo khi có phiếu phạt mới hoặc thanh toán thành công. iOS cần thêm app vào Màn hình chính."
        checked={enabled}
        disabled={busy}
        onChange={(event) => onChange(event.target.checked)}
      />
    </section>
  );
}
