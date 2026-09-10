"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, RefreshCw, ScanLine } from "lucide-react";

import { PaymentQrPanel } from "@/components/qr/payment-qr-panel";
import {
  CurrencyText,
  DividedList,
  DividedListItem,
  Modal,
  PrimaryButton,
  Stamp,
} from "@/components/ui";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { formatTimeInTimezone } from "@/lib/domain/date";
import type { PaymentBank } from "@/lib/domain/payment";
import { useOrganizationRealtime } from "@/lib/realtime/organization-events";
import { createClient } from "@/lib/supabase/client";

export type LateRow = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  attendance_state: string | null;
  late_minutes: number | null;
  checked_in_at: string | null;
  late_kind: string | null;
  fine_id: string | null;
  fine_code: string | null;
  fine_status: string | null;
  original_vnd: number | null;
  allocated_vnd: number | null;
  outstanding_vnd: number | null;
};

export type LateScopeEvent =
  | { kind: "check-in-status"; work_date?: string | null }
  | { kind: "attendance-status"; work_date?: string | null }
  | { kind: "fine-status"; work_date?: string | null; fine_id?: string | null }
  | {
      kind: "fine-allocation-status";
      work_date?: string | null;
      old_work_date?: string | null;
      fine_id?: string | null;
      old_fine_id?: string | null;
    }
  | { kind: "fund-status"; related_fine_ids?: string[] | null };

export function isFinePaidOff(row: LateRow): boolean {
  if (!row.fine_id) return false;
  if (row.fine_status === "paid" || row.fine_status === "waived") return true;
  // Zero-outstanding unpaid coi như hết nợ theo contract (outstanding = original - allocated).
  return (row.outstanding_vnd ?? 0) <= 0;
}

export function splitLateRows(rows: LateRow[]): {
  unpaid: LateRow[];
  pendingFine: LateRow[];
  paid: LateRow[];
} {
  const unpaid = rows.filter(
    (row) => row.fine_id && row.fine_status !== "paid" && row.fine_status !== "waived" && (row.outstanding_vnd ?? 0) > 0,
  );
  const pendingFine = rows.filter((row) => !row.fine_id);
  const paid = rows.filter((row) => row.fine_id && isFinePaidOff(row));
  return { unpaid, pendingFine, paid };
}

export function findLateRowByFineId(rows: LateRow[], fineId: string | null): LateRow | null {
  if (!fineId) return null;
  return rows.find((row) => row.fine_id === fineId) ?? null;
}

/**
 * Quyết định event realtime có liên quan work_date đang xem hay không.
 * Payload Broadcast là flat (không nested `payload`), nên chỉ đọc trường cùng cấp.
 * Quy tắc: thiếu scope (null) thì reload để không bỏ sót; khác ngày và fine
 * không thuộc danh sách hiện tại thì bỏ qua để tránh reload vô ích.
 */
export function shouldReloadLateForEvent(
  event: LateScopeEvent,
  workDate: string,
  knownFineIds: Iterable<string> | null,
): boolean {
  const known = knownFineIds ? new Set(knownFineIds) : new Set<string>();
  const hasKnown = (id: string | null | undefined) => !!id && known.has(id);

  switch (event.kind) {
    case "check-in-status":
    case "attendance-status": {
      if (event.work_date == null) return true;
      return event.work_date === workDate;
    }
    case "fine-status": {
      if (event.work_date == null) return true;
      if (event.work_date === workDate) return true;
      // Fine chuyển ngày: scope cũ (đang xem) vẫn cần reload dù work_date mới khác.
      return hasKnown(event.fine_id);
    }
    case "fine-allocation-status": {
      if (event.work_date === workDate || event.old_work_date === workDate) return true;
      if (hasKnown(event.fine_id) || hasKnown(event.old_fine_id)) return true;
      // Cả hai scope đều null/unknown: chỉ reload khi allocation chạm fine đang hiển thị.
      if (event.work_date == null && event.old_work_date == null) return false;
      return false;
    }
    case "fund-status": {
      const related = event.related_fine_ids ?? [];
      if (related.length === 0) return false;
      return related.some((id) => known.has(id));
    }
  }
}

const LATE_RELOAD_COALESCE_MS = 250;

export function LateList({
  organizationId,
  workDate,
  today,
  minDate,
  maxDate,
  timezone,
  rows,
  updatedAt,
  bank,
  canOpenPaymentQr,
}: {
  organizationId: string;
  workDate: string;
  today: string;
  minDate: string;
  maxDate: string;
  timezone: string;
  rows: LateRow[];
  updatedAt: string;
  bank: PaymentBank | null;
  canOpenPaymentQr: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const tab = searchParams.get("tab") === "paid" ? "paid" : "unpaid";
  // Modal chỉ giữ selected fine id; row luôn tra lại từ snapshot mới nhất để không stale.
  const [selectedFineId, setSelectedFineId] = useState<string | null>(null);
  const [liveRows, setLiveRows] = useState<LateRow[]>(rows);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const coalesceTimerRef = useRef<number | null>(null);
  const workDateRef = useRef(workDate);
  const liveRowsRef = useRef(liveRows);

  useEffect(() => {
    workDateRef.current = workDate;
  }, [workDate]);

  useEffect(() => {
    liveRowsRef.current = liveRows;
  }, [liveRows]);

  // Đồng bộ snapshot server khi đổi ngày (navigation mới) mà vẫn giữ tab qua URL.
  useEffect(() => {
    requestIdRef.current += 1;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync server snapshot theo ngày
    setLiveRows(rows);
    setSelectedFineId((current) => (current && rows.some((row) => row.fine_id === current) ? current : null));
  }, [rows, workDate]);

  const loadSnapshot = useCallback(
    async (date: string) => {
      const requestId = (requestIdRef.current += 1);
      setRefreshing(true);
      try {
        const { data } = await supabase.rpc("get_daily_late_list", {
          p_organization_id: organizationId,
          p_work_date: date,
        });
        // Response của ngày cũ không được ghi đè ngày mới.
        if (requestIdRef.current !== requestId) return;
        if (workDateRef.current !== date) return;
        setLiveRows((data ?? []) as LateRow[]);
      } catch {
        if (requestIdRef.current !== requestId) return;
        if (workDateRef.current !== date) return;
        setLiveRows([]);
      } finally {
        if (requestIdRef.current === requestId && workDateRef.current === date) {
          setRefreshing(false);
        }
      }
    },
    [supabase, organizationId],
  );

  const scheduleReload = useCallback(() => {
    if (coalesceTimerRef.current !== null) return;
    coalesceTimerRef.current = window.setTimeout(() => {
      coalesceTimerRef.current = null;
      loadSnapshot(workDateRef.current).catch(() => {});
    }, LATE_RELOAD_COALESCE_MS);
  }, [loadSnapshot]);

  const reloadNow = useCallback(() => {
    if (coalesceTimerRef.current !== null) {
      window.clearTimeout(coalesceTimerRef.current);
      coalesceTimerRef.current = null;
    }
    return loadSnapshot(workDateRef.current);
  }, [loadSnapshot]);

  const shouldReload = useCallback(
    (event: LateScopeEvent) => {
      const knownFineIds = liveRowsRef.current.map((row) => row.fine_id).filter((id): id is string => !!id);
      return shouldReloadLateForEvent(event, workDateRef.current, knownFineIds);
    },
    [],
  );

  useOrganizationRealtime(
    organizationId,
    {
      onCheckIn: (event) => {
        if (shouldReload({ kind: "check-in-status", work_date: event.work_date })) scheduleReload();
      },
      onAttendance: (event) => {
        if (shouldReload({ kind: "attendance-status", work_date: event.work_date })) scheduleReload();
      },
      onFine: (event) => {
        if (shouldReload({ kind: "fine-status", work_date: event.work_date, fine_id: event.fine_id })) {
          scheduleReload();
        }
      },
      onFineAllocation: (event) => {
        if (
          shouldReload({
            kind: "fine-allocation-status",
            work_date: event.work_date,
            old_work_date: event.old_work_date,
            fine_id: event.fine_id,
            old_fine_id: event.old_fine_id,
          })
        ) {
          scheduleReload();
        }
      },
      onFund: (event) => {
        if (shouldReload({ kind: "fund-status", related_fine_ids: event.related_fine_ids })) scheduleReload();
      },
    },
    { onSnapshotReady: () => scheduleReload() },
  );

  const onDateChange = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", next);
      router.push(`/late?${params.toString()}`);
    },
    [router, searchParams],
  );

  const refresh = useCallback(() => {
    reloadNow().catch(() => {});
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
    }, 800);
  }, [reloadNow]);

  useEffect(() => () => {
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    if (coalesceTimerRef.current !== null) window.clearTimeout(coalesceTimerRef.current);
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") reloadNow().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reloadNow]);

  const { unpaid, pendingFine, paid } = splitLateRows(liveRows);
  const displayed = tab === "paid" ? paid : [...unpaid, ...pendingFine];
  // Tra row mới nhất theo selected fine id để payment/waive/allocation cập nhật badge và modal ngay.
  const selectedRow = findLateRowByFineId(liveRows, selectedFineId);

  return (
    <div className="space-y-5">
      <section>
        <p className="text-xs font-black tracking-[0.16em] text-[var(--signal)] uppercase">
          Đi trễ
        </p>
        <h1 className="display-type mt-1 text-3xl">Danh sách theo ngày</h1>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Cập nhật lúc {formatTimeInTimezone(updatedAt, timezone)}
        </p>
      </section>

      <div className="paper-panel flex flex-wrap items-center gap-3 p-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <CalendarDays className="size-5 shrink-0 text-[var(--signal)]" />
          <input
            type="date"
            value={workDate}
            min={minDate}
            max={maxDate}
            onChange={(e) => e.target.value && onDateChange(e.target.value)}
            className="h-12 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--white)] px-3 text-sm font-bold"
            aria-label="Chọn ngày"
          />
        </div>
        <PrimaryButton type="button" fullWidth={false} onClick={refresh} disabled={refreshing}>
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Đang cập nhật..." : "Cập nhật"}
        </PrimaryButton>
      </div>

      <SegmentedTabs
        param="tab"
        defaultValue={tab}
        options={[
          { value: "unpaid", label: "Chưa thanh toán", badge: unpaid.length + pendingFine.length },
          { value: "paid", label: "Đã thanh toán", badge: paid.length },
        ]}
        ariaLabel="Danh sách đi trễ"
      />

      {displayed.length === 0 ? (
        <div className="paper-panel px-5 py-12 text-center">
          <p className="font-bold text-[var(--ink)]">Không có ai đi trễ trong ngày này.</p>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            {workDate === today ? "Hôm nay mọi người đều đúng giờ." : "Không có dữ liệu trên danh sách điểm danh."}
          </p>
        </div>
      ) : (
        <DividedList>
          {displayed.map((row) => (
            <DividedListItem key={`${row.user_id}-${row.fine_id ?? "no-fine"}`}>
              <div className="flex w-full items-center gap-3 py-1">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-black">{row.display_name ?? "Thành viên"}</span>
                    <LateBadge row={row} />
                  </div>
                  <p className="text-xs text-[var(--ink-soft)]">
                    @{row.username ?? "—"} · {lateLabel(row)}
                  </p>
                  {row.fine_id ? (
                    <p className="text-sm font-bold text-[var(--signal)]">
                      <CurrencyText amount={row.outstanding_vnd ?? 0} />
                    </p>
                  ) : (
                    <p className="text-sm text-[var(--ink-soft)]">Chưa cấp phiếu phạt</p>
                  )}
                </div>
                {canOpenPaymentQr && !isFinePaidOff(row) && row.fine_id ? (
                  <button
                    type="button"
                    onClick={() => setSelectedFineId(row.fine_id)}
                    className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--signal)] text-[var(--paper)]"
                    aria-label={`Phóng lớn QR phiếu ${row.fine_code}`}
                  >
                    <ScanLine className="size-6" />
                  </button>
                ) : null}
              </div>
            </DividedListItem>
          ))}
        </DividedList>
      )}

      <Modal open={selectedFineId !== null} onClose={() => setSelectedFineId(null)} title="QR thanh toán">
        {selectedRow?.fine_id ? (
          <PaymentQrPanel
            fineCode={selectedRow.fine_code ?? "—"}
            originalVnd={selectedRow.original_vnd ?? 0}
            allocatedVnd={selectedRow.allocated_vnd ?? 0}
            outstandingVnd={selectedRow.outstanding_vnd ?? 0}
            status={(selectedRow.fine_status as "unpaid" | "paid" | "waived") ?? "unpaid"}
            memberName={selectedRow.display_name ?? "Thành viên"}
            bank={bank}
          />
        ) : (
          <p className="px-1 py-6 text-center text-sm text-[var(--ink-soft)]">
            Phiếu này đã chuyển trạng thái hoặc không còn trong ngày đang xem.
          </p>
        )}
      </Modal>
    </div>
  );
}

function LateBadge({ row }: { row: LateRow }) {
  if (row.fine_status === "waived") return <Stamp variant="info">Được miễn</Stamp>;
  if (row.fine_id && isFinePaidOff(row)) return <Stamp variant="success">Đã trả</Stamp>;
  if ((row.outstanding_vnd ?? 0) > 0) return <Stamp variant="error">Còn nợ</Stamp>;
  if (!row.fine_id) return <Stamp variant="warning">Chờ cấp phiếu</Stamp>;
  return <Stamp variant="muted">Xử lý</Stamp>;
}

function lateLabel(row: LateRow) {
  const kind = row.late_kind === "auto_late" ? "Tự động ghi trễ" : row.checked_in_at ? "Đi muộn" : "Trạng thái trễ";
  const minutes = row.late_minutes != null ? `${row.late_minutes} phút` : "—";
  return `${kind} · ${minutes}`;
}
