import { LateList } from "@/components/late/late-list";
import { requireActiveMember } from "@/lib/auth";
import { shiftDate, todayInTimezone } from "@/lib/domain/date";
import { paymentBankFromSettings } from "@/lib/domain/payment";
import { createClient } from "@/lib/supabase/server";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function LatePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const context = await requireActiveMember();
  const supabase = await createClient();
  const orgId = context.membership.organizationId;

  const { data: settings } = await supabase
    .from("organization_settings")
    .select("timezone, session_start, session_end, bank_code, bank_account_number, bank_account_holder, transfer_description_rule, fund_display_name")
    .eq("organization_id", orgId)
    .maybeSingle();

  const timezone = settings?.timezone ?? "Asia/Ho_Chi_Minh";
  const today = todayInTimezone(timezone);
  const workDate = date && DATE_RE.test(date) ? date : today;
  const minDate = shiftDate(today, -30);
  const maxDate = today;

  const { data: rows } = await supabase.rpc("get_daily_late_list", {
    p_organization_id: orgId,
    p_work_date: workDate,
  });

  return (
    <LateList
      organizationId={orgId}
      workDate={workDate}
      today={today}
      minDate={minDate}
      maxDate={maxDate}
      timezone={timezone}
      rows={rows ?? []}
      updatedAt={new Date().toISOString()}
      bank={paymentBankFromSettings(settings)}
      canOpenPaymentQr={context.membership.role === "manager"}
    />
  );
}
