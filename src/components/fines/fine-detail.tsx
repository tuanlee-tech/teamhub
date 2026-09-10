"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, HandCoins } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { PaymentQrPanel } from "@/components/qr/payment-qr-panel";
import { CurrencyText, DisplayHeading, Stamp } from "@/components/ui";
import type { PaymentBank } from "@/lib/domain/payment";
import { useOrganizationRealtime } from "@/lib/realtime/organization-events";

type FineDetailProps = {
  fine: {
    id: string;
    code: string;
    originalVnd: number;
    allocatedVnd: number;
    outstandingVnd: number;
    status: "unpaid" | "paid" | "waived";
    workDate: string | null;
    createdAt: string;
  };
  memberName: string;
  /** user_id của chủ fine — dùng để hiển thị, không dùng để lọc realtime. */
  ownerUserId: string;
  organizationId: string;
  isManager: boolean;
  bank: PaymentBank | null;
};

/** Coalesce fine + allocation + fund cùng transaction thành một lần refresh. */
export const FINE_DETAIL_REFRESH_COALESCE_MS = 250;

type FineScopeFields = {
  fine_id?: string | null;
  fine_code?: string | null;
};

type AllocationScopeFields = {
  fine_id?: string | null;
  fine_code?: string | null;
  old_fine_id?: string | null;
};

type FundScopeFields = {
  related_fine_ids?: string[] | null;
};

/** Detail chỉ refresh event đúng fine (lọc theo fine id, fallback fine code). */
export function isFineDetailFineRelevant(
  event: FineScopeFields,
  fineId: string,
  fineCode: string,
): boolean {
  if (event.fine_id != null && event.fine_id === fineId) return true;
  if (event.fine_code != null && event.fine_code === fineCode) return true;
  return false;
}

/**
 * Allocation insert/update/delete đều đổi outstanding của fine.
 * Payload flat theo contract có old_* cho đổi liên kết — invalidate cả scope cũ.
 */
export function isFineDetailAllocationRelevant(
  event: AllocationScopeFields,
  fineId: string,
  fineCode: string,
): boolean {
  if (event.fine_id != null && event.fine_id === fineId) return true;
  if (event.old_fine_id != null && event.old_fine_id === fineId) return true;
  // DELETE theo B01 verified có allocation_id = null nhưng vẫn có fine_id.
  // Fallback fine_code khi producer chỉ gửi code (late/kiosk dùng code để mở modal).
  if (event.fine_code != null && event.fine_code === fineCode) return true;
  return false;
}

/**
 * Fund event không có user/date trực tiếp (contract §7.1).
 * Chỉ refresh khi related_fine_ids chứa fine đang xem — không refresh mọi detail.
 */
export function isFineDetailFundRelevant(
  event: FundScopeFields,
  fineId: string,
): boolean {
  const related = event.related_fine_ids;
  if (!related || related.length === 0) return false;
  return related.includes(fineId);
}

export function FineDetail({ fine, memberName, ownerUserId, organizationId, isManager, bank }: FineDetailProps) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    // Snapshot cuối cùng lấy lại từ server (router.refresh chạy lại page.tsx),
    // không tự tính số tiền từ payload thiếu dữ liệu (contract §13).
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, FINE_DETAIL_REFRESH_COALESCE_MS);
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
      onFine: (event) => {
        const scope = event as unknown as FineScopeFields;
        if (isFineDetailFineRelevant(scope, fine.id, fine.code)) scheduleRefresh();
      },
      onFineAllocation: (event) => {
        const scope = event as unknown as AllocationScopeFields;
        if (isFineDetailAllocationRelevant(scope, fine.id, fine.code)) scheduleRefresh();
      },
      onFund: (event) => {
        const scope = event as unknown as FundScopeFields;
        if (isFineDetailFundRelevant(scope, fine.id)) scheduleRefresh();
      },
    },
    {
      // Recovery sau reconnect: fetch lại snapshot server, không phát toast/TTS lịch sử.
      onSnapshotReady: () => router.refresh(),
    },
  );

  const statusMeta: Record<string, { label: string; variant: "success" | "error" | "warning" | "muted" | "info" }> = {
    unpaid: { label: "Chưa trả", variant: "error" },
    paid: { label: "Đã trả", variant: "success" },
    waived: { label: "Được miễn", variant: "info" },
  };
  const meta = statusMeta[fine.status];

  return (
    <div className="space-y-6" data-fine-id={fine.id} data-owner-id={ownerUserId}>
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

      {/* Parent quản lý snapshot realtime; panel chỉ nhận props mới (contract §6). */}
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
