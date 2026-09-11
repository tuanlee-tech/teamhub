"use client";

import { Clock, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { CurrencyText, Stamp, useToast } from "@/components/ui";
import { formatNumber } from "@/lib/currency";
import { formatTimeInTimezone } from "@/lib/domain/date";
import { flushPendingPush } from "@/lib/push/client";
import {
  useOrganizationRealtime,
  type AttendanceStatusEvent,
  type CheckInStatusEvent,
  type FineAllocationStatusEvent,
  type FineStatusEvent,
  type FundStatusEvent,
} from "@/lib/realtime/organization-events";
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

/** Coalesce nhiều event cùng transaction thành một lần refresh. */
export const MEMBER_REFRESH_COALESCE_MS = 250;

type AllocationScopeFields = {
  user_id?: string | null;
  fine_id?: string | null;
  old_user_id?: string | null;
  old_fine_id?: string | null;
};

type FundScopeFields = {
  related_fine_ids?: string[] | null;
};

export function isMemberCheckInRelevant(event: Pick<CheckInStatusEvent, "user_id">, userId: string): boolean {
  return event.user_id === userId;
}

export function isMemberAttendanceRelevant(event: Pick<AttendanceStatusEvent, "user_id">, userId: string): boolean {
  return event.user_id === userId;
}

export function isMemberFineRelevant(event: Pick<FineStatusEvent, "user_id">, userId: string): boolean {
  return event.user_id === userId;
}

export function isMemberAllocationRelevant(
  event: AllocationScopeFields,
  userId: string,
  fineIds: readonly string[] = [],
): boolean {
  if (event.user_id === userId || event.old_user_id === userId) return true;
  if (fineIds.length === 0) return false;
  const known = new Set(fineIds);
  if (event.fine_id != null && known.has(event.fine_id)) return true;
  if (event.old_fine_id != null && known.has(event.old_fine_id)) return true;
  return false;
}

export function isMemberFundRelevant(event: FundScopeFields, fineIds: readonly string[] = []): boolean {
  // Contract §7.1: fund event không có user/date trực tiếp — chỉ invalidate
  // các fine trong related_fine_ids, không refresh mọi member.
  const related = event.related_fine_ids;
  if (!related || related.length === 0 || fineIds.length === 0) return false;
  const known = new Set(fineIds);
  return related.some((fineId) => known.has(fineId));
}

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
  fineIds = [],
  outstandingVnd = null,
  unpaidCount = null,
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
  /** Fine IDs của user hiện tại (snapshot server) — dùng để lọc allocation/fund. */
  fineIds?: string[];
  /** Tổng còn nợ thực tế = SUM(amount - allocated), nguồn sự thật là snapshot server. */
  outstandingVnd?: number | null;
  unpaidCount?: number | null;
}) {
  const router = useRouter();
  const { error: toastError, success: toastSuccess } = useToast();
  const [uiState, setUiState] = useState<CheckInUiState>("idle");

  const checkedIn = !!checkedInAt;
  const isAutoLatePending = state === "late" && !checkedIn;
  const statusMeta = state ? stateMeta[state] : null;

  const supabase = createClient();

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fineIdsRef = useRef(fineIds);

  useEffect(() => {
    fineIdsRef.current = fineIds;
  }, [fineIds]);

  const scheduleRefresh = useCallback(() => {
    // Coalesce event dồn cùng transaction (fine + allocation + fund) thành 1 refresh.
    // router.refresh() giữ nguyên tab/search params.
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, MEMBER_REFRESH_COALESCE_MS);
  }, [router]);

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  useOrganizationRealtime(
    organizationId,
    {
      onCheckIn: (event) => {
        if (isMemberCheckInRelevant(event, userId)) scheduleRefresh();
      },
      onAttendance: (event) => {
        if (isMemberAttendanceRelevant(event, userId)) scheduleRefresh();
      },
      onFine: (event) => {
        if (isMemberFineRelevant(event, userId)) scheduleRefresh();
      },
      onFineAllocation: (event: FineAllocationStatusEvent) => {
        // Payload flat theo contract có thêm user_id/old_*; type hook có thể thiếu
        // nên đọc defensively qua unknown cast.
        const scope = event as unknown as AllocationScopeFields;
        if (isMemberAllocationRelevant(scope, userId, fineIdsRef.current)) scheduleRefresh();
      },
      onFund: (event: FundStatusEvent) => {
        const scope = event as unknown as FundScopeFields;
        if (isMemberFundRelevant(scope, fineIdsRef.current)) scheduleRefresh();
      },
    },
    {
      // Recovery sau reconnect: fetch lại snapshot server, không phát toast/TTS lịch sử.
      onSnapshotReady: () => router.refresh(),
    },
  );

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
            if (isLate) {
              void flushPendingPush();
            }
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
              <dt className="text-[var(--ink-soft)]">Phạt (snapshot điểm danh)</dt>
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
      {outstandingVnd != null ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--paper-deep)]/50 px-4 py-3 text-sm">
          <p className="text-[var(--ink-soft)]">
            Còn nợ thực tế (server)
            {unpaidCount != null ? ` · ${unpaidCount} phiếu chưa trả` : ""}
          </p>
          <p className="mt-1 font-bold">
            <CurrencyText amount={outstandingVnd} className="text-base" />
          </p>
        </div>
      ) : null}
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
