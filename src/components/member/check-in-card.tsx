"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";
import { formatNumber } from "@/lib/currency";

type CheckInState = "idle" | "checking" | "success" | "error";

type CheckInResult = {
  ok: boolean;
  state?: "on_time" | "late" | "excused";
  late_minutes?: number;
  fine_amount_snapshot?: number;
  reason?: string;
  distance_m?: number;
};

type MemberStatus = {
  hasRecord: boolean;
  state?: "pending" | "on_time" | "late" | "excused";
  lateMinutes?: number;
  fineAmount?: number;
  checkedInAt?: string;
  method?: "gps" | "qr";
  officeConfigured: boolean;
  validCheckInTime?: string;
  workDate?: string;
};

function SubmitButton({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="primary-action w-full sm:w-auto disabled:opacity-60 disabled:cursor-wait"
      disabled={pending || disabled}
      type="submit"
    >
      {pending ? "Đang xử lý..." : children}
    </button>
  );
}

function Feedback({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div
      className={`rounded-xl px-4 py-3 text-sm font-semibold ${
        type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
      }`}
      role="alert"
    >
      {message}
    </div>
  );
}

export function CheckInCard({
  initialStatus,
  organizationId,
}: {
  initialStatus: MemberStatus;
  organizationId: string;
}) {
  const [status, setStatus] = useState<MemberStatus>(initialStatus);
  const [uiState, setUiState] = useState<CheckInState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showQrFallback, setShowQrFallback] = useState(false);
  const [qrToken, setQrToken] = useState<string>("");

  const env = getPublicEnv();
  const supabase = createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  async function handleGpsCheckIn() {
    setErrorMsg(null);
    setSuccessMsg(null);
    setUiState("checking");

    if (!navigator.geolocation) {
      setErrorMsg("Trình duyệt không hỗ trợ định vị GPS.");
      setUiState("error");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        try {
          const { data, error } = await supabase.rpc("check_in_gps", {
            organization_id: organizationId,
            latitude,
            longitude,
            accuracy_m: accuracy,
          });

          if (error) throw error;
          const result = data as CheckInResult;

          if (result.ok) {
            setSuccessMsg(
              result.state === "late"
                ? `Đã điểm danh. Trễ ${result.late_minutes} phút. Phạt ${formatNumber(result.fine_amount_snapshot ?? 0)} VNĐ.`
                : "Đã điểm danh đúng giờ.",
            );
            setStatus({
              ...status,
              hasRecord: true,
              state: result.state,
              lateMinutes: result.late_minutes,
              fineAmount: result.fine_amount_snapshot,
              checkedInAt: new Date().toISOString(),
              method: "gps",
            });
            setUiState("success");
          } else if (result.reason === "gps_accuracy_too_low") {
            setErrorMsg("Độ chính xác GPS quá thấp. Vui lòng thử lại hoặc dùng QR tại văn phòng.");
            setShowQrFallback(true);
            setUiState("error");
          } else if (result.reason === "outside_office_geofence") {
            setErrorMsg(
              `Bạn đang ngoài khu vực văn phòng (khoảng ${Math.round(result.distance_m || 0)} m). Hãy di chuyển gần hơn hoặc dùng QR.`,
            );
            setShowQrFallback(true);
            setUiState("error");
          } else if (result.reason === "office_not_configured") {
            setErrorMsg("Văn phòng chưa được cấu hình tọa độ. Liên hệ manager.");
            setUiState("error");
          } else if (result.reason === "not_on_roster") {
            setErrorMsg("Hôm nay bạn không có trong danh sách điểm danh.");
            setUiState("error");
          } else {
            setErrorMsg(result.reason ?? "Điểm danh thất bại.");
            setUiState("error");
          }
        } catch {
          setErrorMsg("Lỗi kết nối. Vui lòng thử lại.");
          setUiState("error");
        }
      },
      (err) => {
        setErrorMsg(err.code === 1 ? "Bạn đã từ chối quyền truy cập vị trí." : "Không thể lấy vị trí. Thử lại?");
        setUiState("error");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  async function handleQrCheckIn(token: string) {
    setErrorMsg(null);
    setSuccessMsg(null);
    setUiState("checking");

    try {
      const { data, error } = await supabase.rpc("check_in_qr", {
        organization_id: organizationId,
        token,
      });

      if (error) throw error;
      const result = data as CheckInResult;

      if (result.ok) {
        setSuccessMsg(
          result.state === "late"
            ? `Điểm danh QR thành công. Trễ ${result.late_minutes} phút. Phạt ${formatNumber(result.fine_amount_snapshot ?? 0)} VNĐ.`
            : "Điểm danh QR thành công. Đúng giờ!",
        );
        setStatus({
          ...status,
          hasRecord: true,
          state: result.state,
          lateMinutes: result.late_minutes,
          fineAmount: result.fine_amount_snapshot,
          checkedInAt: new Date().toISOString(),
          method: "qr",
        });
        setShowQrFallback(false);
        setQrToken("");
        setUiState("success");
      } else if (result.reason === "invalid_or_expired_token") {
        setErrorMsg("Mã QR không hợp lệ hoặc đã hết hạn (30 giây). Yêu cầu manager tạo mã mới.");
        setUiState("error");
      } else if (result.reason === "not_on_roster") {
        setErrorMsg("Hôm nay bạn không có trong danh sách điểm danh.");
        setUiState("error");
      } else {
        setErrorMsg(result.reason ?? "Điểm danh QR thất bại.");
        setUiState("error");
      }
    } catch {
      setErrorMsg("Lỗi kết nối. Vui lòng thử lại.");
      setUiState("error");
    }
  }

  const stateLabels = {
    pending: "Chờ điểm danh",
    on_time: "Đúng giờ",
    late: "Đi trễ",
    excused: "Được miễn",
  } as const;

  const stateColors = {
    pending: "bg-amber-100 text-amber-800",
    on_time: "bg-emerald-100 text-emerald-800",
    late: "bg-red-100 text-red-800",
    excused: "bg-blue-100 text-blue-800",
  } as const;

  return (
    <section className="space-y-6">
      <div className="paper-panel p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold tracking-[0.14em] text-[var(--ink-soft)] uppercase">
              Trạng thái hôm nay
            </p>
            <p className="display-type mt-3 text-4xl">
              {status.hasRecord
                ? stateLabels[status.state ?? "pending"]
                : "Chưa điểm danh"}
            </p>
          </div>
          {status.hasRecord && status.state && (
            <span className={`stamp ${stateColors[status.state]}`}>
              {stateLabels[status.state]}
            </span>
          )}
          {!status.hasRecord && !status.officeConfigured && (
            <span className="stamp text-[var(--signal)]">Chờ cấu hình</span>
          )}
        </div>

        {status.hasRecord && (
          <dl className="mt-6 grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-[var(--ink-soft)]">Giờ điểm danh</dt>
              <dd className="font-bold">
                {status.checkedInAt ? new Date(status.checkedInAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ink-soft)]">Phương thức</dt>
              <dd className="font-bold capitalize">{status.method ?? "—"}</dd>
            </div>
            {status.lateMinutes !== undefined && status.lateMinutes > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-[var(--ink-soft)]">Số phút trễ</dt>
                <dd className="font-bold text-[var(--signal)]">{status.lateMinutes} phút</dd>
              </div>
            )}
            {status.fineAmount !== undefined && status.fineAmount > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-[var(--ink-soft)]">Số tiền phạt dự kiến</dt>
                <dd className="font-bold text-[var(--signal)]">
                  {formatNumber(status.fineAmount)} VNĐ
                </dd>
              </div>
            )}
          </dl>
        )}

        {errorMsg && <Feedback message={errorMsg} type="error" />}
        {successMsg && <Feedback message={successMsg} type="success" />}

        {!status.hasRecord ? (
          <div className="mt-6 space-y-4">
            {!status.officeConfigured ? (
              <p className="text-center text-sm text-[var(--ink-soft)]">
                Tọa độ văn phòng chưa được cấu hình. Vui lòng nhờ manager thiết lập ở trang Cài đặt.
              </p>
            ) : (
              <>
                <form onSubmit={(e) => { e.preventDefault(); handleGpsCheckIn(); }}>
                  <SubmitButton disabled={uiState === "checking"}>
                    {uiState === "checking" ? "Đang định vị..." : "Điểm danh bằng GPS"}
                  </SubmitButton>
                </form>
                <p className="text-center text-sm text-[var(--ink-soft)]">
                  Nếu GPS không đủ chính xác, ứng dụng sẽ gợi ý chuyển sang QR.
                </p>
              </>
            )}

            {showQrFallback && (
              <div className="rounded-xl border border-[var(--line)] bg-amber-50 p-4">
                <p className="font-bold text-amber-800 mb-2">Chuyển sang điểm danh QR</p>
                <p className="text-sm text-amber-700 mb-3">
                  Yêu cầu manager mở trang Kiosk để tạo mã QR (hiệu lực 30 giây).
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (qrToken.trim().length >= 16) handleQrCheckIn(qrToken.trim());
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    placeholder="Nhập mã QR từ kiosk"
                    value={qrToken}
                    onChange={(e) => setQrToken(e.target.value)}
                    className="flex-1 h-12 rounded-xl border border-[var(--line)] bg-white px-4"
                    autoFocus
                  />
                  <SubmitButton disabled={uiState === "checking" || qrToken.trim().length < 16}>
                    Kiểm tra
                  </SubmitButton>
                </form>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-6 text-center text-sm text-[var(--ink-soft)]">
            Bạn đã hoàn tất điểm danh hôm nay. Cảm ơn!
          </p>
        )}
      </div>
    </section>
  );
}