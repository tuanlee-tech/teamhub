"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { MapPin, QrCode } from "lucide-react";

import { formatNumber } from "@/lib/currency";
import { formatTimeInTimezone } from "@/lib/domain/date";
import { getPublicEnv } from "@/lib/env";
import { Stamp } from "@/components/ui";

type CheckInUiState = "idle" | "locating" | "confirming" | "success" | "error";

type CheckInResult = {
  ok: boolean;
  state?: "on_time" | "late" | "excused";
  late_minutes?: number;
  fine_amount_snapshot?: number;
  reason?: string;
  distance_m?: number;
};

type AttendanceState = "pending" | "on_time" | "late" | "excused";

const stateMeta: Record<string, { label: string; variant: "success" | "error" | "warning" | "muted" | "info" }> = {
  pending: { label: "Chưa điểm danh", variant: "muted" },
  on_time: { label: "Đúng giờ", variant: "success" },
  late: { label: "Đi trễ", variant: "error" },
  excused: { label: "Được miễn", variant: "info" },
};

export function CheckInCard({
  organizationId,
  timezone,
  checkedInAt,
  state,
  lateMinutes,
  fineAmount,
  method,
  officeConfigured,
  validCheckInTime,
}: {
  organizationId: string;
  timezone: string;
  checkedInAt: string | null;
  state: AttendanceState | null;
  lateMinutes: number;
  fineAmount: number;
  method: "gps" | "qr" | "otp" | null;
  officeConfigured: boolean;
  validCheckInTime: string;
}) {
  const router = useRouter();
  const [uiState, setUiState] = useState<CheckInUiState>("idle");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const checkedIn = !!checkedInAt;
  const isAutoLatePending = state === "late" && !checkedIn;
  const statusMeta = state ? stateMeta[state] : null;

  const env = getPublicEnv();
  const supabase = createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  async function handleGpsCheckIn() {
    if (uiState === "locating" || uiState === "confirming") return;
    setMessage(null);
    setUiState("locating");

    if (!("geolocation" in navigator)) {
      setMessage({ type: "error", text: "Trình duyệt không hỗ trợ định vị. Dùng mã QR/OTP tại kiosk." });
      setUiState("error");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setUiState("confirming");
        try {
          const { data, error } = await supabase.rpc("check_in_gps", {
            organization_id: organizationId,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy_m: position.coords.accuracy,
          });
          if (error) throw error;
          const result = data as CheckInResult;

          if (result.ok) {
            const isLate = result.state === "late";
            setMessage({
              type: "success",
              text: isLate
                ? `Đã xác nhận từ server. Trễ ${result.late_minutes} phút, phạt ${formatNumber(result.fine_amount_snapshot ?? 0)} VNĐ.`
                : "Đã xác nhận từ server, đúng giờ.",
            });
            setUiState("success");
            router.refresh();
          } else {
            setMessage({
              type: "error",
              text: reasonText(result.reason, result.distance_m),
            });
            setUiState("error");
          }
        } catch {
          setMessage({ type: "error", text: "Lỗi kết nối. Vui lòng thử lại." });
          setUiState("error");
        }
      },
      (err) => {
        setMessage({
          type: "error",
          text:
            err.code === 1
              ? "Bạn đã từ chối quyền vị trí. Dùng mã QR/OTP tại kiosk để điểm danh."
              : "Không thể lấy vị trí. Thử lại hoặc dùng mã QR/OTP tại kiosk.",
        });
        setUiState("error");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  return (
    <section className="paper-panel space-y-5 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black tracking-[0.16em] text-[var(--ink-soft)] uppercase">
            Trạng thái hôm nay
          </p>
          <p className="display-type mt-2 text-2xl">{checkedIn ? (statusMeta?.label ?? "Đã điểm danh") : "Chưa điểm danh"}</p>
        </div>
        {statusMeta ? <Stamp variant={statusMeta.variant}>{statusMeta.label}</Stamp> : null}
      </div>

      {checkedIn ? (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-[var(--ink-soft)]">Giờ điểm danh</dt>
            <dd className="font-bold">{formatTimeInTimezone(checkedInAt, timezone)}</dd>
          </div>
          <div>
            <dt className="text-[var(--ink-soft)]">Phương thức</dt>
            <dd className="font-bold uppercase">{method ?? "—"}</dd>
          </div>
          {lateMinutes > 0 ? (
            <div>
              <dt className="text-[var(--ink-soft)]">Số phút trễ</dt>
              <dd className="font-bold text-[var(--signal)]">{lateMinutes} phút</dd>
            </div>
          ) : null}
          {fineAmount > 0 ? (
            <div>
              <dt className="text-[var(--ink-soft)]">Phạt</dt>
              <dd className="font-bold text-[var(--signal)]">{formatNumber(fineAmount)} VNĐ</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <div className="space-y-4">
          {isAutoLatePending ? (
            <p className="rounded-xl border border-[var(--line)] bg-[var(--paper-deep)]/50 px-4 py-3 text-sm">
              Hệ thống đã ghi nhận bạn <strong>chưa điểm danh</strong>. Bấm nút bên dưới để điểm danh hoàn tất.
            </p>
          ) : null}

          {message ? (
            <div
              role="alert"
              className={`rounded-xl px-4 py-3 text-sm font-semibold ${
                message.type === "success" ? "bg-emerald-950/40 text-emerald-300" : "bg-red-950/40 text-red-300"
              }`}
            >
              {message.text}
            </div>
          ) : null}

          {!officeConfigured ? (
            <p className="rounded-xl border border-[var(--line)] bg-[var(--paper-deep)]/50 px-4 py-3 text-sm text-[var(--ink-soft)]">
              Tọa độ văn phòng chưa được cấu hình ({validCheckInTime || "—"} là mốc tính trễ). Bạn vẫn có thể dùng mã
              QR/OTP tại kiosk.
            </p>
          ) : (
            <button
              type="button"
              onClick={handleGpsCheckIn}
              disabled={uiState === "locating" || uiState === "confirming"}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--signal)] px-5 font-black text-[var(--paper)] shadow-[0_6px_0_var(--signal-dark)] transition active:translate-y-1 active:shadow-none disabled:opacity-70"
            >
              <MapPin className="size-5" />
              {uiState === "locating"
                ? "Đang lấy vị trí..."
                : uiState === "confirming"
                  ? "Đang xác nhận từ server..."
                  : "Điểm danh bằng GPS"}
            </button>
          )}

          <Link
            href="/qr?tab=scan"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--white)] px-5 font-bold text-[var(--ink)] transition active:translate-y-px"
          >
            <QrCode className="size-5 text-[var(--signal)]" />
            Dùng mã QR / OTP tại kiosk
          </Link>
          <p className="text-center text-xs text-[var(--ink-soft)]">
            Vị trí chỉ được gửi khi bạn chủ động điểm danh. Mốc tính trễ hôm nay: {validCheckInTime}.
          </p>
        </div>
      )}
    </section>
  );
}

function reasonText(reason: string | undefined, distanceM?: number) {
  switch (reason) {
    case "gps_accuracy_too_low":
      return "Độ chính xác GPS quá thấp. Thử lại hoặc dùng mã QR/OTP tại kiosk.";
    case "outside_office_geofence":
      return `Bạn đang ngoài khu vực văn phòng (khoảng ${Math.round(distanceM ?? 0)} m). Di chuyển gần hơn hoặc dùng mã QR/OTP.`;
    case "office_not_configured":
      return "Văn phòng chưa cấu hình tọa độ. Bạn vẫn có thể dùng mã QR/OTP.";
    case "not_on_roster":
      return "Hôm nay bạn không có trong danh sách điểm danh.";
    default:
      return reason ? `Điểm danh thất bại (${reason}).` : "Điểm danh thất bại. Thử lại.";
  }
}