import { notFound } from "next/navigation";

import { FineDetail } from "@/components/fines/fine-detail";
import { requireActiveMember } from "@/lib/auth";
import { paymentBankFromSettings } from "@/lib/domain/payment";
import { createClient } from "@/lib/supabase/server";

export default async function FineDetailPage({
  params,
}: {
  params: Promise<{ fineCode: string }>;
}) {
  const { fineCode } = await params;
  const context = await requireActiveMember();
  const supabase = await createClient();
  const orgId = context.membership.organizationId;

  const [{ data: fine }, { data: settings }, { data: profileRow }] = await Promise.all([
    supabase
      .from("fines")
      .select(
        "id, code, amount_vnd, status, created_at, user_id, attendance_records(attendance_days(work_date), late_minutes)",
      )
      .eq("organization_id", orgId)
      .eq("code", fineCode)
      .maybeSingle(),
    supabase
      .from("organization_settings")
      .select(
        "bank_code, bank_account_number, bank_account_holder, transfer_description_rule, fund_display_name, timezone",
      )
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", context.userId)
      .maybeSingle(),
  ]);

  if (!fine) notFound();

  const { data: allocations } = await supabase
    .from("fine_allocations")
    .select("amount_vnd, fund_transactions!inner(voided_at)")
    .eq("fine_id", fine.id);

  const allocatedVnd = (allocations ?? []).reduce((sum, row) => sum + (row.amount_vnd ?? 0), 0);
  const outstandingVnd = Math.max(fine.amount_vnd - allocatedVnd, 0);

  const attendance = fine.attendance_records as
    | { work_date?: string }
    | { attendance_days?: { work_date: string } }
    | null;

  const workDate =
    "attendance_days" in (attendance ?? {})
      ? (attendance as { attendance_days?: { work_date: string } }).attendance_days?.work_date ?? null
      : (attendance as { work_date?: string } | null)?.work_date ?? null;

  return (
    <FineDetail
      fine={{
        code: fine.code,
        originalVnd: fine.amount_vnd,
        allocatedVnd,
        outstandingVnd,
        status: fine.status,
        workDate: workDate as string | null,
        createdAt: fine.created_at,
      }}
      memberName={profileRow?.display_name ?? context.profile.displayName}
      isManager={context.membership.role === "manager"}
      bank={paymentBankFromSettings(settings)}
    />
  );
}