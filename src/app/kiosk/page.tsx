import { KioskScreen } from "@/components/kiosk/kiosk-screen";
import { requireKiosk } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function KioskPage() {
  const context = await requireKiosk();
  const supabase = await createClient();
  const orgId = context.membership.organizationId;

  const [{ data: org }, { data: settings }, { data: session }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    supabase
      .from("organization_settings")
      .select(
        "timezone, bank_code, bank_account_number, bank_account_holder, transfer_description_rule, fund_display_name",
      )
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase.rpc("kiosk_session_info", { p_organization_id: orgId }),
  ]);

  return (
    <KioskScreen
      orgId={orgId}
      orgName={org?.name ?? "TeamHub"}
      timezone={settings?.timezone ?? "Asia/Ho_Chi_Minh"}
      initialSession={(session ?? null) as {
        active: boolean;
        work_date: string | null;
        session_start_at: string | null;
        session_end_at: string | null;
      } | null}
      bank={settings ? {
        bankCode: settings.bank_code,
        accountNumber: settings.bank_account_number,
        accountHolder: settings.bank_account_holder,
        transferDescriptionRule: settings.transfer_description_rule ?? "",
        fundDisplayName: settings.fund_display_name ?? "TeamHub",
      } : null}
    />
  );
}