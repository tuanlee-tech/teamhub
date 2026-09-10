import { FineList } from "@/components/fines/fine-list";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type FineRow = {
  id: string;
  code: string;
  amountVnd: number;
  status: "unpaid" | "paid" | "waived";
  allocatedVnd: number;
  outstandingVnd: number;
  workDate: string | null;
};

export default async function FinesPage() {
  const context = await requireActiveMember();
  const supabase = await createClient();
  const orgId = context.membership.organizationId;

  const [{ data: fines }, { data: allocations }] = await Promise.all([
    supabase
      .from("fines")
      .select(
        "id, code, amount_vnd, status, attendance_records(attendance_days(work_date))",
      )
      .eq("organization_id", orgId)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false }),
    supabase.from("fine_allocations").select("fine_id, amount_vnd, fund_transactions(voided_at)"),
  ]);

  const allocationByFine = new Map<string, number>();
  for (const row of allocations ?? []) {
    const fund = row.fund_transactions as unknown;
    const funds = Array.isArray(fund) ? fund : [fund];
    const isEffective = funds.every(
      (item) => item == null || (item as { voided_at: string | null }).voided_at == null,
    );
    if (!isEffective) continue;
    allocationByFine.set(row.fine_id, (allocationByFine.get(row.fine_id) ?? 0) + row.amount_vnd);
  }

  const rows: FineRow[] = (fines ?? []).map((fine) => {
    const allocated = allocationByFine.get(fine.id) ?? 0;
    return {
      id: fine.id,
      code: fine.code,
      amountVnd: fine.amount_vnd,
      status: fine.status,
      allocatedVnd: allocated,
      outstandingVnd: Math.max(fine.amount_vnd - allocated, 0),
      workDate: (fine.attendance_records as { attendance_days?: { work_date: string } } | null)
        ?.attendance_days?.work_date ?? null,
    };
  });

  return (
    <div className="space-y-5">
      <section>
        <p className="text-xs font-black tracking-[0.16em] text-[var(--signal)] uppercase">
          Phiếu phạt
        </p>
        <h1 className="display-type mt-1 text-3xl">Khoản của bạn</h1>
      </section>
      <FineList organizationId={orgId} userId={context.userId} rows={rows} />
    </div>
  );
}
