"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import jsQR from "jsqr";
import { CameraOff, QrCode } from "lucide-react";

import { Feedback, FormInput, FormLabel, PrimaryButton } from "@/components/ui";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { formatNumber } from "@/lib/currency";
import { getPublicEnv } from "@/lib/env";

type CheckInFeedback = { type: "success" | "error"; text: string } | null;

async function submitCheckIn(
  orgId: string,
  payload: { mode: "otp"; code: string } | { mode: "qr"; token: string },
) {
  const env = getPublicEnv();
  const supabase = createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (payload.mode === "otp") {
    return (await supabase.rpc("check_in_otp", { organization_id: orgId, code: payload.code })).data;
  }
  return (await supabase.rpc("check_in_qr", { organization_id: orgId, token: payload.token })).data;
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

export function QrHub({ orgId }: { orgId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "otp" ? "otp" : "scan";

  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<CheckInFeedback>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraGuide, setCameraGuide] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const scanFrameRef = useRef<string | null>(null);

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current != null) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    const clearRefreshFeedback = () => {
      setFeedback(null);
      setCameraError(null);
    };

    window.addEventListener("teamhub:pull-refresh", clearRefreshFeedback);
    return () => window.removeEventListener("teamhub:pull-refresh", clearRefreshFeedback);
  }, []);

  const handleCode = useCallback(
    async (value: string) => {
      if (!value || submitting) return;
      setSubmitting(true);
      setFeedback(null);
      try {
        const result = await submitCheckIn(orgId, { mode: "qr", token: value.trim() });
        if (result?.ok) {
          setFeedback({ type: "success", text: resultText(result) });
          stopCamera();
          router.push("/member");
        } else {
          setFeedback({ type: "error", text: resultText(result ?? { ok: false }) });
        }
      } catch {
        setFeedback({ type: "error", text: "Lỗi kết nối. Vui lòng thử lại." });
      } finally {
        setSubmitting(false);
      }
    },
    [orgId, submitting, router, stopCamera],
  );

  async function startCamera() {
    setCameraError(null);
    setCameraGuide(false);
    try {
      if (!window.isSecureContext) {
        setCameraError("Camera cần kết nối HTTPS. Hãy mở đúng địa chỉ https://...ngrok-free.dev, không dùng http://.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Safari không cấp API camera ở địa chỉ hiện tại. Hãy mở bằng Safari trực tiếp, không qua iframe.");
        return;
      }
      if (navigator.permissions?.query) {
        try {
          const permission = await navigator.permissions.query({ name: "camera" as PermissionName });
          if (permission.state === "denied") {
            setCameraGuide(true);
            setCameraError("Safari đang chặn camera cho trang này.");
            return;
          }
        } catch {
          // Safari may not expose camera permission state; getUserMedia will prompt.
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
      streamRef.current = stream;
      setCameraOn(true);

      // The video element is mounted by the cameraOn state update.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const video = videoRef.current;
      if (!video) {
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

      const loop = async () => {
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
            if (code && code !== scanFrameRef.current) {
              scanFrameRef.current = code;
              handleCode(code);
            }
          } catch {
            // frame is not readable yet
          }
        }
        scanLoopRef.current = requestAnimationFrame(loop);
      };
      scanLoopRef.current = requestAnimationFrame(loop);
    } catch (err) {
      const name = (err as { name?: string }).name;
      setCameraError(
        name === "NotAllowedError"
          ? "Safari chưa cho phép trang này dùng camera."
          : name === "NotFoundError"
            ? "Không tìm thấy camera trên thiết bị."
            : "Không mở được camera. Kiểm tra quyền camera và dùng mã OTP nếu cần.",
      );
      setCameraGuide(name === "NotAllowedError" || name === "SecurityError");
    }
  }

  useEffect(() => {
    if (tab !== "scan") {
      const stopTimer = window.setTimeout(stopCamera, 0);
      return () => window.clearTimeout(stopTimer);
    }
    const startTimer = window.setTimeout(() => startCamera(), 250);
    return () => window.clearTimeout(startTimer);
    // Camera starts once after the scan tab has hydrated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function submitOtp() {
    if (!/^\d{6}$/.test(otp.trim()) || submitting) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const result = await submitCheckIn(orgId, { mode: "otp", code: otp.trim() });
      if (result?.ok) {
        setFeedback({ type: "success", text: resultText(result) });
        router.push("/member");
      } else {
        setFeedback({ type: "error", text: resultText(result ?? { ok: false }) });
      }
    } catch {
      setFeedback({ type: "error", text: "Lỗi kết nối. Vui lòng thử lại." });
    } finally {
      setSubmitting(false);
    }
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

      <Feedback error={feedback?.type === "error" ? feedback.text : undefined} success={feedback?.type === "success" ? feedback.text : undefined} />

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
              {cameraError ? (
                <div className="space-y-3 rounded-2xl border border-red-400/30 bg-red-950/40 px-4 py-4 text-sm text-red-200">
                  <p className="flex items-center gap-2 font-semibold text-red-300">
                    <CameraOff className="size-4 shrink-0" /> {cameraError}
                  </p>
                  {cameraGuide ? (
                    <div className="space-y-2 border-t border-red-300/20 pt-3 leading-relaxed">
                      <p className="font-bold text-[var(--ink)]">Bật quyền camera như sau:</p>
                      <ol className="list-decimal space-y-1 pl-5">
                        <li>Mở Cài đặt iPhone.</li>
                        <li>Chọn Safari → Camera.</li>
                        <li>Chọn Hỏi hoặc Cho phép.</li>
                        <li>Quay lại Safari, tải lại trang rồi nhấn Quét QR Check-in.</li>
                      </ol>
                      <p className="text-xs text-red-200/80">Nếu đang dùng Chế độ riêng tư, hãy thử một tab Safari bình thường.</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
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
