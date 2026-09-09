"use client";

import { Clock, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Stamp, useToast } from "@/components/ui";
import { formatNumber } from "@/lib/currency";
import { formatTimeInTimezone } from "@/lib/domain/date";
import { useOrganizationRealtime } from "@/lib/realtime/organization-events";
import { createClient } from "@/lib/supabase/client";

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
  userId,
  timezone,
  checkedInAt,
  state,
  lateMinutes,
  fineAmount,
  method,
  officeConfigured,
  checkInWindowOpen,
  sessionStart,
  sessionEnd,
  validCheckInTime,
  }: {
  organizationId: string;
  userId: string;
  timezone: string;
  checkedInAt: string | null;
  state: AttendanceState | null;
  lateMinutes: number;
  fineAmount: number;
  method: "gps" | "qr" | "otp" | null;
  officeConfigured: boolean;
  checkInWindowOpen: boolean;
  sessionStart: string | null;
  sessionEnd: string | null;
  validCheckInTime: string;
}) {
  const router = useRouter();
  const { error: toastError, success: toastSuccess } = useToast();
  const [uiState, setUiState] = useState<CheckInUiState>("idle");

  const checkedIn = !!checkedInAt;
  const isAutoLatePending = state === "late" && !checkedIn;
  const statusMeta = state ? stateMeta[state] : null;

  const supabase = createClient();

  useOrganizationRealtime(organizationId, {
    onCheckIn: (event) => {
      if (event.user_id === userId) router.refresh();
    },
    onFine: () => router.refresh(),
  });

  async function handleGpsCheckIn() {
    if (uiState === "locating" || uiState === "confirming") return;
    setUiState("locating");

    if (!("geolocation" in navigator)) {
      toastError("Trình duyệt không hỗ trợ định vị. Dùng mã QR/OTP tại kiosk.");
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
            toastSuccess(
              isLate
                ? `Đã xác nhận từ server. Trễ ${result.late_minutes} phút, phạt ${formatNumber(result.fine_amount_snapshot ?? 0)} VNĐ.`
                : "Đã xác nhận từ server, đúng giờ.",
            );
            setUiState("success");
            router.refresh();
          } else {
            toastError(reasonText(result.reason, result.distance_m));
            setUiState("error");
          }
        } catch (caughtError) {
          toastError(checkInErrorText(caughtError));
          setUiState("error");
        }
      },
      (err) => {
        toastError(
          err.code === 1
            ? "Bạn đã từ chối quyền vị trí. Dùng mã QR/OTP tại kiosk để điểm danh."
            : "Không thể lấy vị trí. Thử lại hoặc dùng mã QR/OTP tại kiosk.",
        );
        setUiState("error");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  return (
    <section
      className={`paper-panel p-5 sm:p-6 ${checkedIn ? "space-y-5" : "flex min-h-[calc(100dvh-23rem)] flex-col"
        }`}
    >
      <div className={`flex items-start gap-3 ${checkedIn ? "justify-between" : "justify-center text-center"}`}>
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
        <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          {!checkInWindowOpen ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <Clock className="size-20 text-[var(--ink-soft)]" />
              <div>
                <p className="font-bold">Ngoài giờ điểm danh</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Check-in mở từ {sessionStart ?? "—"} đến {sessionEnd ?? "—"}.
                </p>
              </div>
            </div>
          ) : isAutoLatePending ? (
            <p className="rounded-xl border border-[var(--line)] bg-[var(--paper-deep)]/50 px-4 py-3 text-sm">
              Hệ thống đã ghi nhận bạn <strong>chưa điểm danh</strong>. Bấm nút bên dưới để điểm danh hoàn tất.
            </p>
          ) : null}

          {checkInWindowOpen && !officeConfigured ? (
            <p className="rounded-xl border border-[var(--line)] bg-[var(--paper-deep)]/50 px-4 py-3 text-sm text-[var(--ink-soft)]">
              Tọa độ văn phòng chưa được cấu hình ({validCheckInTime || "—"} là mốc tính trễ). Bạn vẫn có thể dùng mã
              QR/OTP tại kiosk.
            </p>
          ) : checkInWindowOpen ? (
            <>
              <button
                type="button"
                onClick={handleGpsCheckIn}
                disabled={uiState === "locating" || uiState === "confirming"}
                aria-label={uiState === "locating" ? "Đang lấy vị trí" : "Điểm danh bằng GPS"}
                className="flex size-44 shrink-0 items-center justify-center rounded-full bg-[var(--signal)] text-[var(--paper)] shadow-[0_8px_0_var(--signal-dark),0_16px_35px_rgba(247,147,26,0.25)] transition hover:scale-[1.03] active:translate-y-2 active:shadow-[0_2px_0_var(--signal-dark),0_8px_20px_rgba(247,147,26,0.2)] disabled:cursor-wait disabled:opacity-70 sm:size-52"
              >
                <MapPin className="size-20" strokeWidth={2.5} />
              </button>
              <p className="text-sm font-bold text-[var(--ink-soft)]">
                {uiState === "locating"
                  ? "Đang lấy vị trí..."
                  : uiState === "confirming"
                    ? "Đang xác nhận..."
                    : "Chạm để điểm danh bằng GPS"}
              </p>
            </>
          ) : null}

          {checkInWindowOpen ? (
            <p className="text-center text-xs text-[var(--ink-soft)]">
              Vị trí chỉ được gửi khi bạn chủ động điểm danh. Mốc tính trễ hôm nay: {validCheckInTime}.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function checkInErrorText(error: unknown) {
  if (error instanceof Error && error.message.includes("check_in_outside_session")) {
    return "Đã hết khung giờ điểm danh hôm nay.";
  }
  return "Lỗi kết nối. Vui lòng thử lại.";
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
