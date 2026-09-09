"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { CurrencyText, DividedList, DividedListItem, Stamp } from "@/components/ui";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { useOrganizationRealtime } from "@/lib/realtime/organization-events";

type FineRow = {
  id: string;
  code: string;
  amountVnd: number;
  status: "unpaid" | "paid" | "waived";
  allocatedVnd: number;
  outstandingVnd: number;
  workDate: string | null;
};

export function FineList({ organizationId, rows }: { organizationId: string; rows: FineRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "unpaid";

  useOrganizationRealtime(organizationId, {
    onFine: (event) => {
      if (rows.some((row) => row.id === event.fine_id)) router.refresh();
    },
  });

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
