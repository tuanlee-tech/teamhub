"use client";

import { useCallback, useState } from "react";
import { Check, Copy, Download, Share, ShieldCheck } from "lucide-react";

import { CurrencyText, SecondaryButton, Stamp } from "@/components/ui";
import { buildTransferDescription, normalizeTransferText, type PaymentBank } from "@/lib/domain/payment";

type PaymentQrPanelProps = {
  fineCode: string;
  originalVnd: number;
  allocatedVnd: number;
  outstandingVnd: number;
  status: "unpaid" | "paid" | "waived";
  memberName: string;
  bank: PaymentBank | null;
};

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

  const hasOutstanding = status === "unpaid" && outstandingVnd > 0;
  const paidOff = !hasOutstanding;
  const description = bank
    ? buildTransferDescription({
        rule: normalizeTransferText(bank.transferDescriptionRule ?? ""),
        fineCode,
        displayName: toAscii(memberName),
      })
    : null;

  const copy = useCallback(
    async (key: string, value: string) => {
      const ok = await copyText(value);
      if (ok) {
        setCopied(key);
        setTimeout(() => setCopied(null), 1500);
      }
    },
    [],
  );

  async function downloadQr() {
    try {
      const response = await fetch(`/api/vietqr/${fineCode}`);
      if (!response.ok) throw new Error("fetch failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `phieu-${fineCode}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(`/api/vietqr/${fineCode}`, "_blank");
    }
  }

  async function shareQr() {
    setSharing(true);
    try {
      const response = await fetch(`/api/vietqr/${fineCode}`);
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
          <div className="flex justify-center">
            <div className="relative rounded-2xl border border-[var(--line)] bg-[var(--white)] p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/vietqr/${fineCode}`}
                alt={`QR thanh toán phiếu ${fineCode}`}
                width={280}
                height={280}
                className="size-56 object-contain sm:size-64"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper-deep)]/40 p-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-[var(--ink-soft)]">Ngân hàng</dt>
                <dd className="font-bold">{bank.bankCode}</dd>
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