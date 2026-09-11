"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Share, ShieldCheck } from "lucide-react";

import { CurrencyText, SecondaryButton, Stamp, useToast } from "@/components/ui";
import { buildTransferDescription, buildVietQrImageUrl, normalizeTransferText, type PaymentBank } from "@/lib/domain/payment";

type PaymentQrPanelProps = {
  fineCode: string;
  originalVnd: number;
  allocatedVnd: number;
  outstandingVnd: number;
  status: "unpaid" | "paid" | "waived";
  memberName: string;
  bank: PaymentBank | null;
};

/**
 * Panel hết nợ khi status khác unpaid hoặc không còn outstanding (contract §6).
 * Parent chịu trách nhiệm refetch snapshot realtime và pass props mới —
 * panel không tự subscribe để tránh trùng subscription với parent.
 */
export function isPaymentPaidOff(status: PaymentQrPanelProps["status"], outstandingVnd: number): boolean {
  return status !== "unpaid" || outstandingVnd <= 0;
}

/**
 * QR phải đổi khi outstanding đổi. Endpoint tính lại số tiền từ server theo
 * fineCode nên query `amount` chỉ để cache-bust phía browser/CDN, không phải
 * nguồn sự thật số tiền.
 */
export function buildPaymentQrSrc(fineCode: string, outstandingVnd: number): string {
  return `/api/vietqr/${encodeURIComponent(fineCode)}?amount=${Number.isFinite(outstandingVnd) ? Math.max(Math.trunc(outstandingVnd), 0) : 0}`;
}

function buildPaymentQrProxySrc(fineCode: string, outstandingVnd: number): string {
  return `${buildPaymentQrSrc(fineCode, outstandingVnd)}&proxy=true`;
}

function toAscii(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Đđ]/g, "D")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  }
}

export function PaymentQrPanel({
  fineCode,
  originalVnd,
  allocatedVnd,
  outstandingVnd,
  status,
  memberName,
  bank,
}: PaymentQrPanelProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);
  const { error: toastError } = useToast();

  useEffect(() => () => {
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
  }, []);

  const hasOutstanding = !isPaymentPaidOff(status, outstandingVnd);
  const paidOff = !hasOutstanding;
  const description = bank
    ? buildTransferDescription({
        rule: normalizeTransferText(bank.transferDescriptionRule ?? ""),
        fineCode,
        displayName: toAscii(memberName),
      })
    : null;
  const qrSrc = bank && description
    ? buildVietQrImageUrl({
        accountNumber: bank.accountNumber,
        bank: bank.bankCode,
        amountVnd: outstandingVnd,
        description,
        template: bank.vietqrTemplate,
        showInfo: bank.vietqrShowInfo,
        fullAccount: bank.vietqrFullAccount,
        holder: bank.accountHolder,
        store: bank.fundDisplayName,
      })
    : buildPaymentQrSrc(fineCode, outstandingVnd);
  const qrProxySrc = buildPaymentQrProxySrc(fineCode, outstandingVnd);

  const copy = useCallback(
    async (key: string, value: string) => {
      const ok = await copyText(value);
      if (ok) {
        setCopied(key);
        if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = window.setTimeout(() => {
          copiedTimerRef.current = null;
          setCopied(null);
        }, 1500);
      }
    },
    [],
  );

  async function downloadQr() {
    try {
      const response = await fetch(qrProxySrc);
      if (!response.ok) {
        if (response.status === 409) {
          // Race: server đã hết nợ (payment/allocation mới) nhưng props parent
          // chưa refresh kịp. Báo ngay để user không chuyển khoản thừa.
          toastError("Phiếu này vừa hết nợ. Số tiền mới đang được cập nhật.");
          return;
        }
        throw new Error("fetch failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `phieu-${fineCode}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(qrSrc, "_blank");
    }
  }

  async function shareQr() {
    setSharing(true);
    try {
      const response = await fetch(qrProxySrc);
      if (response.status === 409) {
        toastError("Phiếu này vừa hết nợ. Số tiền mới đang được cập nhật.");
        return;
      }
      if (response.ok && "share" in navigator) {
        const blob = await response.blob();
        const file = new File([blob], `phieu-${fineCode}.png`, { type: "image/png" });
        const payload = {
          title: `Phiếu phạt ${fineCode}`,
          text: description ? `Chuyển ${outstandingVnd.toLocaleString("vi-VN")} VNĐ, nội dung ${description}` : undefined,
          files: [file],
        };
        await navigator.share(payload);
      } else {
        await downloadQr();
      }
    } catch {
      await downloadQr();
    } finally {
      setSharing(false);
    }
  }

  return (
    <section className="paper-panel space-y-5 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black tracking-[0.16em] text-[var(--ink-soft)] uppercase">
            QR thanh toán
          </p>
          <h2 className="display-type mt-1 text-2xl">Phiếu {fineCode}</h2>
        </div>
        <Stamp variant={paidOff ? "success" : "signal"}>{paidOff ? "Hết nợ" : "Còn nợ"}</Stamp>
      </div>

      {paidOff ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
            <ShieldCheck className="mt-0.5 size-5 shrink-0" />
            <p>
              Phiếu này đã được xử lý{status === "waived" ? " (được miễn)" : " và không còn dư nợ"}. Không cần chuyển
              khoản. Số tiền gốc <CurrencyText amount={originalVnd} />, đã phân bổ <CurrencyText amount={allocatedVnd} />.
            </p>
          </div>
        </div>
      ) : bank ? (
        <>
          {/* key theo qrSrc: props mới (outstanding mới) remount ảnh mới,
              không giữ ảnh QR cũ chỉ vì fine code không đổi. */}
          <QrImage key={qrSrc} qrSrc={qrSrc} fineCode={fineCode} />

          <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper-deep)]/40 p-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-[var(--ink-soft)]">Ngân hàng</dt>
                <dd className="font-bold">{bank.bankShortName || bank.bankCode}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-soft)]">Chủ tài khoản</dt>
                <dd className="font-bold break-words">{bank.accountHolder}</dd>
              </div>
              <div className="col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <dt className="text-[var(--ink-soft)]">Số tài khoản</dt>
                    <dd className="font-bold break-all">{bank.accountNumber}</dd>
                  </div>
                  <button
                    type="button"
                    onClick={() => copy("account", bank.accountNumber)}
                    className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--white)]"
                    aria-label="Copy số tài khoản"
                  >
                    {copied === "account" ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                  </button>
                </div>
              </div>
              <div className="col-span-2">
                <dt className="text-[var(--ink-soft)]">Số tiền</dt>
                <dd className="font-black text-[var(--signal)]">
                  <CurrencyText amount={outstandingVnd} className="text-xl" />
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[var(--ink-soft)]">Nội dung chuyển khoản</dt>
                <dd className="mt-1 rounded-lg bg-[var(--white)] px-3 py-2 font-mono break-all">{description}</dd>
                <div className="mt-2">
                  <SecondaryButton type="button" onClick={() => copy("description", description ?? "")}>
                    {copied === "description" ? "Đã copy" : "Copy nội dung"}
                  </SecondaryButton>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-[var(--ink-soft)]">
              Gốc <CurrencyText amount={originalVnd} /> · Đã đóng <CurrencyText amount={allocatedVnd} /> · Còn{" "}
              <CurrencyText amount={outstandingVnd} />
            </p>
          </div>

          <div className="flex gap-2">
            <SecondaryButton type="button" onClick={downloadQr} className="flex-1">
              <Download className="size-4" /> Tải QR
            </SecondaryButton>
            <SecondaryButton type="button" onClick={shareQr} className="flex-1" disabled={sharing}>
              <Share className="size-4" /> {sharing ? "Đang xử lý..." : "Chia sẻ"}
            </SecondaryButton>
          </div>
        </>
      ) : (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--paper-deep)]/50 px-4 py-3 text-sm text-[var(--ink-soft)]">
          Tài khoản ngân hàng của tổ chức chưa được cấu hình. Liên hệ manager.
        </p>
      )}
    </section>
  );
}

/**
 * Ảnh QR riêng để lỗi tải (endpoint 409 `no_outstanding` khi server đã hết nợ
 * nhưng props parent chưa refresh kịp) không làm vỡ layout. Parent remount qua
 * key khi outstanding đổi nên không giữ trạng thái lỗi cũ.
 */
function QrImage({ qrSrc, fineCode }: { qrSrc: string; fineCode: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-[var(--line)] bg-[var(--paper-deep)]/50 px-4 py-3 text-sm text-[var(--ink-soft)]">
          Không tải được QR — có thể phiếu vừa được thanh toán hoặc số tiền vừa đổi.
          Snapshot mới đang được cập nhật theo realtime.
        </p>
        <SecondaryButton type="button" onClick={() => setFailed(false)}>
          Tải lại QR
        </SecondaryButton>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <div className="relative rounded-2xl border border-[var(--line)] bg-[var(--white)] p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrSrc}
          onError={() => setFailed(true)}
          alt={`QR thanh toán phiếu ${fineCode}`}
          width={280}
          height={280}
          className="size-56 object-contain sm:size-64"
        />
      </div>
    </div>
  );
}
