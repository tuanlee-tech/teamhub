"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";

import { CurrencyText, DividedList, DividedListItem, Stamp } from "@/components/ui";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import {
  useOrganizationRealtime,
  type FineAllocationStatusEvent,
  type FundStatusEvent,
} from "@/lib/realtime/organization-events";

type FineRow = {
  id: string;
  code: string;
  amountVnd: number;
  status: "unpaid" | "paid" | "waived";
  allocatedVnd: number;
  outstandingVnd: number;
  workDate: string | null;
};

/** Coalesce nhiều event cùng transaction thành một lần refresh. */
export const FINE_LIST_REFRESH_COALESCE_MS = 250;

type FineEventScope = {
  user_id?: string | null;
  fine_id?: string | null;
};

type FineAllocationScope = {
  user_id?: string | null;
  fine_id?: string | null;
  old_user_id?: string | null;
  old_fine_id?: string | null;
};

type FundScope = {
  related_fine_ids?: string[] | null;
};

export function isFineEventRelevant(
  event: FineEventScope,
  userId: string,
  knownFineIds: Set<string> | readonly string[],
): boolean {
  // Fine mới: user_id khớp dù list ban đầu rỗng hoặc fine chưa có trong rows.
  if (event.user_id === userId) return true;
  if (event.fine_id == null) return false;
  return knownFineIds instanceof Set ? knownFineIds.has(event.fine_id) : knownFineIds.includes(event.fine_id);
}

export function isAllocationEventRelevant(
  event: FineAllocationScope,
  userId: string,
  knownFineIds: Set<string> | readonly string[],
): boolean {
  // Allocation đổi outstanding/badge — invalidate cả scope cũ và mới (contract §7.3).
  // DELETE verified: allocation_id null nhưng fine_id vẫn có.
  if (event.user_id === userId || event.old_user_id === userId) return true;
  const has = (id: string | null | undefined) => {
    if (id == null) return false;
    return knownFineIds instanceof Set ? knownFineIds.has(id) : knownFineIds.includes(id);
  };
  return has(event.fine_id) || has(event.old_fine_id);
}

export function isFundEventRelevant(
  event: FundScope,
  knownFineIds: Set<string> | readonly string[],
): boolean {
  // Contract §7.1: chỉ invalidate fine trong related_fine_ids, không refresh
  // khi fund không liên quan fine nào của user.
  const related = event.related_fine_ids;
  if (!related || related.length === 0) return false;
  const size = knownFineIds instanceof Set ? knownFineIds.size : knownFineIds.length;
  if (size === 0) return false;
  return related.some((fineId) =>
    knownFineIds instanceof Set ? knownFineIds.has(fineId) : (knownFineIds as readonly string[]).includes(fineId),
  );
}

export function FineList({
  organizationId,
  userId,
  rows,
}: {
  organizationId: string;
  userId: string;
  rows: FineRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "unpaid";

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knownRef = useRef<Set<string>>(new Set(rows.map((row) => row.id)));

  useEffect(() => {
    knownRef.current = new Set(rows.map((row) => row.id));
  }, [rows]);

  const scheduleRefresh = useCallback(() => {
    // Coalesce fine + allocation + fund cùng transaction thành 1 refresh.
    // router.refresh() giữ nguyên tab/search params (?tab=unpaid/history).
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, FINE_LIST_REFRESH_COALESCE_MS);
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
      // Check-in/attendance của chính user có thể sinh fine mới — refresh để
      // đón fine-status insert đi kèm. Event user khác bỏ qua.
      onCheckIn: (event) => {
        if (event.user_id === userId) scheduleRefresh();
      },
      onAttendance: (event) => {
        if (event.user_id === userId) scheduleRefresh();
      },
      onFine: (event) => {
        if (isFineEventRelevant(event, userId, knownRef.current)) scheduleRefresh();
      },
      onFineAllocation: (event: FineAllocationStatusEvent) => {
        const scope = event as unknown as FineAllocationScope;
        if (isAllocationEventRelevant(scope, userId, knownRef.current)) scheduleRefresh();
      },
      onFund: (event: FundStatusEvent) => {
        const scope = event as unknown as FundScope;
        if (isFundEventRelevant(scope, knownRef.current)) scheduleRefresh();
      },
    },
    {
      // Recovery sau reconnect: snapshot server là nguồn sự thật cho outstanding.
      onSnapshotReady: () => router.refresh(),
    },
  );

  const unpaid = rows.filter((row) => row.status === "unpaid" && row.outstandingVnd > 0);
  const history = rows.filter(
    (row) => row.status === "paid" || row.status === "waived" || (row.status === "unpaid" && row.outstandingVnd <= 0),
  );

  const displayed = tab === "history" ? history : unpaid;

  return (
    <div className="space-y-4">
      <SegmentedTabs
        param="tab"
        defaultValue="unpaid"
        options={[
          { value: "unpaid", label: "Cần thanh toán", badge: unpaid.length },
          { value: "history", label: "Lịch sử", badge: history.length },
        ]}
        ariaLabel="Danh sách phiếu phạt"
      />

      {displayed.length === 0 ? (
        <div className="paper-panel px-5 py-12 text-center">
          <p className="font-bold text-[var(--ink)]">
            {tab === "history" ? "Chưa có phiếu phạt trong lịch sử." : "Không còn khoản nào cần thanh toán."}
          </p>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            {tab === "history"
              ? "Mỗi phiếu đi trễ sẽ xuất hiện tại đây sau khi được xử lý."
              : "Tốt lắm, bạn đã sạch nợ."}
          </p>
        </div>
      ) : (
        <DividedList>
          {displayed.map((row) => (
            <DividedListItem key={row.id}>
              <Link href={`/fines/${row.code}`} className="flex w-full items-center gap-3 py-1">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-black">{row.code}</span>
                    <StatusStamp status={row.status} outstanding={row.outstandingVnd} />
                  </div>
                  <p className="text-xs text-[var(--ink-soft)]">
                    {row.workDate ?? "—"} · Trễ phiếu
                  </p>
                  <p className="text-sm font-bold">
                    Còn nợ <CurrencyText amount={row.outstandingVnd} />
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-[var(--ink-soft)]" />
              </Link>
            </DividedListItem>
          ))}
        </DividedList>
      )}
    </div>
  );
}

function StatusStamp({ status, outstanding }: { status: FineRow["status"]; outstanding: number }) {
  if (status === "waived") return <Stamp variant="info">Miễn</Stamp>;
  if (status === "paid" || outstanding <= 0) return <Stamp variant="success">Đã trả</Stamp>;
  return <Stamp variant="error">Chưa trả</Stamp>;
}
