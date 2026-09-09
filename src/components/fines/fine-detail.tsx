import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock, HandCoins } from "lucide-react";

import { PaymentQrPanel } from "@/components/qr/payment-qr-panel";
import { CurrencyText, DisplayHeading, Stamp } from "@/components/ui";
import type { PaymentBank } from "@/lib/domain/payment";

type FineDetailProps = {
  fine: {
    code: string;
    originalVnd: number;
    allocatedVnd: number;
    outstandingVnd: number;
    status: "unpaid" | "paid" | "waived";
    workDate: string | null;
    createdAt: string;
  };
  memberName: string;
  isManager: boolean;
  bank: PaymentBank | null;
};

export function FineDetail({ fine, memberName, isManager, bank }: FineDetailProps) {
  const statusMeta: Record<string, { label: string; variant: "success" | "error" | "warning" | "muted" | "info" }> = {
    unpaid: { label: "Chưa trả", variant: "error" },
    paid: { label: "Đã trả", variant: "success" },
    waived: { label: "Được miễn", variant: "info" },
  };
  const meta = statusMeta[fine.status];

  return (
    <div className="space-y-6">
      <Link href="/fines" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--ink-soft)]">
        <ArrowLeft className="size-4" /> Quay lại danh sách
      </Link>

      <section className="paper-panel space-y-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-[0.16em] text-[var(--ink-soft)] uppercase">Chi tiết phiếu</p>
            <DisplayHeading level={2} className="mt-1">
              {fine.code}
            </DisplayHeading>
          </div>
          <Stamp variant={meta.variant}>{meta.label}</Stamp>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper-deep)]/40 px-4 py-3">
            <HandCoins className="size-5 shrink-0 text-[var(--signal)]" />
            <div>
              <dt className="text-[var(--ink-soft)]">Số tiền gốc</dt>
              <dd className="font-black">
                <CurrencyText amount={fine.originalVnd} />
              </dd>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper-deep)]/40 px-4 py-3">
            <CalendarDays className="size-5 shrink-0 text-[var(--signal)]" />
            <div>
              <dt className="text-[var(--ink-soft)]">Ngày làm việc</dt>
              <dd className="font-bold">{fine.workDate ?? "—"}</dd>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper-deep)]/40 px-4 py-3">
            <Clock className="size-5 shrink-0 text-[var(--signal)]" />
            <div>
              <dt className="text-[var(--ink-soft)]">Còn nợ</dt>
              <dd className="font-black text-[var(--signal)]">
                <CurrencyText amount={fine.outstandingVnd} />
              </dd>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper-deep)]/40 px-4 py-3">
            <Clock className="size-5 shrink-0 text-[var(--signal)]" />
            <div>
              <dt className="text-[var(--ink-soft)]">Tạo phiếu</dt>
              <dd className="font-bold">
                {new Date(fine.createdAt).toLocaleDateString("vi-VN")}
              </dd>
            </div>
          </div>
        </dl>
      </section>

      <PaymentQrPanel
        fineCode={fine.code}
        originalVnd={fine.originalVnd}
        allocatedVnd={fine.allocatedVnd}
        outstandingVnd={fine.outstandingVnd}
        status={fine.status}
        memberName={memberName}
        bank={bank}
      />

      {isManager ? (
        <p className="text-center text-xs text-[var(--ink-soft)]">
          Đang xem với quyền manager · {memberName}
        </p>
      ) : null}
    </div>
  );
}