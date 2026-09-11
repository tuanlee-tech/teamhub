"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Clock, QrCode } from "lucide-react";

import { FormInput, FormLabel, PrimaryButton, useToast } from "@/components/ui";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { formatNumber } from "@/lib/currency";
import { flushPendingPush } from "@/lib/push/client";
import { createClient } from "@/lib/supabase/client";

async function submitCheckIn(
  orgId: string,
  payload: { mode: "otp"; code: string } | { mode: "qr"; token: string },
) {
  const supabase = createClient();
  if (payload.mode === "otp") {
    const { data, error } = await supabase.rpc("check_in_otp", { organization_id: orgId, code: payload.code });
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.rpc("check_in_qr", { organization_id: orgId, token: payload.token });
  if (error) throw error;
  return data;
}

function resultText(result: { ok: boolean; reason?: string; state?: string; late_minutes?: number; fine_amount_snapshot?: number }) {
  if (result.ok) {
    if (result.state === "late") {
      return `Đã điểm danh từ server. Trễ ${result.late_minutes} phút, phạt ${formatNumber(result.fine_amount_snapshot ?? 0)} VNĐ.`;
    }
    return "Đã điểm danh đúng giờ (xác nhận từ server).";
  }
  const map: Record<string, string> = {
    invalid_or_expired_otp: "Mã OTP không đúng hoặc đã hết hạn.",
    otp_attempts_exceeded: "Quá số lần thử. Mã đã bị khóa, xin mã mới từ kiosk.",
    invalid_or_expired_token: "Mã QR không đúng hoặc đã hết hạn.",
    not_on_roster: "Bạn không có trong danh sách điểm danh hôm nay.",
    already_checked_in: "Bạn đã điểm danh hôm nay.",
  };
  return result.reason ? (map[result.reason] ?? `Chưa điểm danh được (${result.reason}).`) : "Chưa điểm danh được. Thử lại.";
}

export function QrHub({
  orgId,
  checkInWindowOpen,
  sessionStart,
  sessionEnd,
}: {
  orgId: string;
  checkInWindowOpen: boolean;
  sessionStart: string | null;
  sessionEnd: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "otp" ? "otp" : "scan";
  const { error, success } = useToast();

  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const scanFrameRef = useRef<string | null>(null);
  const cameraRequestRef = useRef(0);
  const scanActiveRef = useRef(false);

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1;
    scanActiveRef.current = false;
    if (scanLoopRef.current != null) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const handleCode = useCallback(
    async (value: string) => {
      if (!value || submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      try {
        const result = await submitCheckIn(orgId, { mode: "qr", token: value.trim() });
        if (result?.ok) {
          success(resultText(result));
          if (result.state === "late") {
            void flushPendingPush();
          }
          stopCamera();
          router.push("/member");
        } else {
          error(resultText(result ?? { ok: false }));
        }
      } catch (caughtError) {
        error(checkInErrorText(caughtError));
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [error, orgId, router, stopCamera, success],
  );

  async function startCamera() {
    const requestId = ++cameraRequestRef.current;
    try {
      if (!window.isSecureContext) {
        error("Camera cần kết nối HTTPS. Hãy mở đúng địa chỉ https://...ngrok-free.dev, không dùng http://.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        error("Trình duyệt hiện tại không hỗ trợ camera ở địa chỉ này. Hãy mở trang trực tiếp, không qua iframe.");
        return;
      }
      if (navigator.permissions?.query) {
        try {
          const permission = await navigator.permissions.query({ name: "camera" as PermissionName });
          if (permission.state === "denied") {
            error("Trình duyệt đang chặn camera cho trang này. Hãy cấp quyền Camera trong cài đặt trình duyệt.");
            return;
          }
        } catch {
          // Some browsers may not expose camera permission state; getUserMedia will prompt.
        }
      }
      const NativeBarcodeDetector = (window as unknown as {
        BarcodeDetector?: new (o: { formats?: string[] }) => {
          detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
        };
      }).BarcodeDetector;
      const detector = NativeBarcodeDetector ? new NativeBarcodeDetector({ formats: ["qr_code"] }) : null;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      if (requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      setCameraOn(true);

      // The video element is mounted by the cameraOn state update.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const video = videoRef.current;
      if (!video || requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        setCameraOn(false);
        throw new Error("camera_video_unavailable");
      }
      video.srcObject = stream;
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "true");
      await video.play();
      if (requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        if (streamRef.current === stream) streamRef.current = null;
        return;
      }
      scanActiveRef.current = true;

      const loop = async () => {
        if (!scanActiveRef.current || requestId !== cameraRequestRef.current) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0 && context) {
          try {
            let code: string | undefined;
            if (detector) {
              const codes = await detector.detect(video);
              code = codes[0]?.rawValue;
            } else {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              context.drawImage(video, 0, 0, canvas.width, canvas.height);
              const image = context.getImageData(0, 0, canvas.width, canvas.height);
              code = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" })?.data;
            }
            if (!code) {
              scanFrameRef.current = null;
            } else if (code !== scanFrameRef.current) {
              scanFrameRef.current = code;
              handleCode(code);
            }
          } catch {
            // frame is not readable yet
          }
        }
        if (!scanActiveRef.current || requestId !== cameraRequestRef.current) return;
        scanLoopRef.current = requestAnimationFrame(loop);
      };
      scanLoopRef.current = requestAnimationFrame(loop);
    } catch (err) {
      const name = (err as { name?: string }).name;
      error(
        name === "NotAllowedError"
          ? "Trình duyệt chưa cho phép trang này dùng camera."
          : name === "NotFoundError"
            ? "Không tìm thấy camera trên thiết bị."
            : "Không mở được camera. Kiểm tra quyền camera và dùng mã OTP nếu cần.",
      );
    }
  }

  useEffect(() => {
    if (!checkInWindowOpen) {
      const stopTimer = window.setTimeout(stopCamera, 0);
      return () => window.clearTimeout(stopTimer);
    }
    if (tab !== "scan") {
      const stopTimer = window.setTimeout(stopCamera, 0);
      return () => window.clearTimeout(stopTimer);
    }
    const startTimer = window.setTimeout(() => startCamera(), 250);
    return () => window.clearTimeout(startTimer);
    // Camera starts once after the scan tab has hydrated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkInWindowOpen, tab, stopCamera]);

  async function submitOtp() {
    if (!/^\d{6}$/.test(otp.trim()) || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await submitCheckIn(orgId, { mode: "otp", code: otp.trim() });
      if (result?.ok) {
        success(resultText(result));
        if (result.state === "late") {
          void flushPendingPush();
        }
        router.push("/member");
      } else {
        error(resultText(result ?? { ok: false }));
      }
    } catch (caughtError) {
      error(checkInErrorText(caughtError));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (!checkInWindowOpen) {
    return (
      <div className="space-y-5">
        <section>
          <p className="text-xs font-black tracking-[0.16em] text-[var(--signal)] uppercase">Điểm danh</p>
          <h1 className="display-type mt-1 text-3xl">Ngoài giờ điểm danh</h1>
        </section>
        <section className="paper-panel flex min-h-[calc(100dvh-23rem)] flex-col items-center justify-center gap-4 p-6 text-center">
          <Clock className="size-12 text-[var(--ink-soft)]" />
          <div>
            <p className="font-bold">Chưa thể check-in lúc này</p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Check-in mở từ {sessionStart ?? "—"} đến {sessionEnd ?? "—"}.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section>
        <p className="text-xs font-black tracking-[0.16em] text-[var(--signal)] uppercase">
          Điểm danh
        </p>
        <h1 className="display-type mt-1 text-3xl">Quét QR hoặc nhập OTP</h1>
      </section>

      <SegmentedTabs
        param="tab"
        defaultValue="scan"
        options={[
          { value: "scan", label: "Quét mã" },
          { value: "otp", label: "Nhập OTP" },
        ]}
        ariaLabel="Phương thức điểm danh"
      />

      {tab === "scan" ? (
        <div className="space-y-4">
          {cameraOn ? (
            <div className="fixed inset-0 z-50 overflow-hidden bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-0 bg-black/10" />
              <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(78vw,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border-2 border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]" />
              <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-5 pb-10 pt-5 text-white">
                <p className="font-bold">Đưa mã QR vào khung</p>
                <span className="text-sm text-white/75">Đang quét...</span>
              </div>
              {submitting ? (
                <div className="absolute inset-0 grid place-items-center bg-black/50">
                  <p className="font-bold text-white">Đang xác nhận từ server...</p>
                </div>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/80 to-transparent px-5 pb-8 pt-12">
                <PrimaryButton type="button" fullWidth={false} onClick={stopCamera}>
                  Dừng camera
                </PrimaryButton>
              </div>
            </div>
          ) : (
            <div className="paper-panel space-y-4 p-5">
              <div className="flex items-start gap-3">
                <QrCode className="mt-1 size-5 shrink-0 text-[var(--signal)]" />
                <div>
                  <p className="font-bold">Quét mã QR hiển thị trên kiosk</p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">
                    Camera sẽ tự mở khi vào tab này. Nếu bị chặn, hãy cấp quyền rồi thử lại.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <PrimaryButton type="button" onClick={startCamera} disabled={submitting}>
                  Quét QR Check-in
                </PrimaryButton>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="paper-panel space-y-5 p-5">
          <div>
            <p className="font-bold">Nhập mã OTP từ kiosk</p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">Dùng mã 6 số khi không thể quét QR bằng camera.</p>
          </div>
          <FormLabel>
            Mã OTP 6 số
            <FormInput
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && submitOtp()}
              placeholder="123456"
            />
          </FormLabel>
          <PrimaryButton type="button" onClick={submitOtp} disabled={submitting || otp.length !== 6}>
            {submitting ? "Đang xác nhận..." : "Xác nhận OTP"}
          </PrimaryButton>
          <p className="text-xs text-[var(--ink-soft)]">Mã được xác thực và giới hạn thời gian tại server.</p>
        </div>
      )}
    </div>
  );
}

function checkInErrorText(error: unknown) {
  if (error instanceof Error && error.message.includes("check_in_outside_session")) {
    return "Đã hết khung giờ điểm danh hôm nay.";
  }
  return "Lỗi kết nối. Vui lòng thử lại.";
}
