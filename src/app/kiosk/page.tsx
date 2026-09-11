import { KioskScreen } from "@/components/kiosk/kiosk-screen";
import { requireKiosk } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TTS_CONFIG, ttsConfigFromRow } from "@/lib/tts";

export default async function KioskPage() {
  const context = await requireKiosk();
  const supabase = await createClient();
  const orgId = context.membership.organizationId;

  const [{ data: settings }, { data: session }, { data: tts }] = await Promise.all([
    supabase
      .from("organization_settings")
      .select(
        "timezone, bank_code, bank_short_name, bank_account_number, bank_account_holder, transfer_description_rule, fund_display_name, vietqr_template, vietqr_show_info, vietqr_full_account",
      )
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase.rpc("kiosk_session_info", { p_organization_id: orgId }),
    supabase.from("tts_settings").select("*").eq("organization_id", orgId).maybeSingle(),
  ]);

  return (
    <KioskScreen
      orgId={orgId}
      timezone={settings?.timezone ?? "Asia/Ho_Chi_Minh"}
      initialTtsConfig={tts ? ttsConfigFromRow(tts) : DEFAULT_TTS_CONFIG}
      initialSession={(session ?? null) as {
        active: boolean;
        work_date: string | null;
        session_start_at: string | null;
        session_end_at: string | null;
        last_successful_check_in_at?: string | null;
      } | null}
      bank={settings ? {
        bankCode: settings.bank_code,
        bankShortName: settings.bank_short_name ?? settings.bank_code ?? "",
        accountNumber: settings.bank_account_number,
        accountHolder: settings.bank_account_holder,
        transferDescriptionRule: settings.transfer_description_rule ?? "",
        fundDisplayName: settings.fund_display_name ?? "TeamHub",
        vietqrTemplate: settings.vietqr_template ?? "compact",
        vietqrShowInfo: settings.vietqr_show_info ?? true,
        vietqrFullAccount: settings.vietqr_full_account ?? true,
      } : null}
    />
  );
}
