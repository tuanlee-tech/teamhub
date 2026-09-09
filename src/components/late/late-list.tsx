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

type LateRow = {
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

export function LateList({
  workDate,
  today,
  minDate,
  maxDate,
  timezone,
  rows,
  updatedAt,
  bank,
}: {
  workDate: string;
  today: string;
  minDate: string;
  maxDate: string;
  timezone: string;
  rows: LateRow[];
  updatedAt: string;
  bank: PaymentBank | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "paid" ? "paid" : "unpaid";
  const [expanded, setExpanded] = useState<LateRow | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);

  const onDateChange = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", next);
      router.push(`/late?${params.toString()}`);
    },
    [router, searchParams],
  );

  const refresh = useCallback(() => {
    setRefreshing(true);
    router.refresh();
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      setRefreshing(false);
    }, 800);
  }, [router]);

  useEffect(() => () => {
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  const unpaid = rows.filter(
    (row) => row.fine_id && row.fine_status !== "paid" && row.fine_status !== "waived" && (row.outstanding_vnd ?? 0) > 0,
  );
  const pendingFine = rows.filter((row) => !row.fine_id);
  const paid = rows.filter((row) => row.fine_id && (row.fine_status === "paid" || row.fine_status === "waived"));
  const displayed = tab === "paid" ? paid : [...unpaid, ...pendingFine];

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
                {row.fine_id && (row.outstanding_vnd ?? 0) > 0 && row.fine_status !== "paid" && row.fine_status !== "waived" ? (
                  <button
                    type="button"
                    onClick={() => setExpanded(row)}
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

      <Modal open={expanded !== null} onClose={() => setExpanded(null)} title="QR thanh toán">
        {expanded?.fine_id ? (
          <PaymentQrPanel
            fineCode={expanded.fine_code ?? "—"}
            originalVnd={expanded.original_vnd ?? 0}
            allocatedVnd={expanded.allocated_vnd ?? 0}
            outstandingVnd={expanded.outstanding_vnd ?? 0}
            status={(expanded.fine_status as "unpaid" | "paid" | "waived") ?? "unpaid"}
            memberName={expanded.display_name ?? "Thành viên"}
            bank={bank}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function LateBadge({ row }: { row: LateRow }) {
  if (row.fine_status === "waived") return <Stamp variant="info">Được miễn</Stamp>;
  if (row.fine_status === "paid") return <Stamp variant="success">Đã trả</Stamp>;
  if ((row.outstanding_vnd ?? 0) > 0) return <Stamp variant="error">Còn nợ</Stamp>;
  if (!row.fine_id) return <Stamp variant="warning">Chờ cấp phiếu</Stamp>;
  return <Stamp variant="muted">Xử lý</Stamp>;
}

function lateLabel(row: LateRow) {
  const kind = row.late_kind === "auto_late" ? "Tự động ghi trễ" : row.checked_in_at ? "Đi muộn" : "Trạng thái trễ";
  const minutes = row.late_minutes != null ? `${row.late_minutes} phút` : "—";
  return `${kind} · ${minutes}`;
}
