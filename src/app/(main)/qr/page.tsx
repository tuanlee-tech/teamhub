import { QrHub } from "@/components/qr/qr-hub";
import { requireActiveMember } from "@/lib/auth";
import { isWithinConfiguredTimeWindow } from "@/lib/domain/date";
import { createClient } from "@/lib/supabase/server";

export default async function QrPage() {
  const context = await requireActiveMember();
  const supabase = await createClient();
  const organizationId = context.membership.organizationId;
  const { data: settings } = await supabase
    .from("organization_settings")
    .select("timezone, session_start, session_end")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const timezone = settings?.timezone ?? "Asia/Ho_Chi_Minh";

  return (
    <QrHub
      orgId={organizationId}
      checkInWindowOpen={isWithinConfiguredTimeWindow(
        settings?.session_start ?? null,
        settings?.session_end ?? null,
        timezone,
      )}
      sessionStart={settings?.session_start?.slice(0, 5) ?? null}
      sessionEnd={settings?.session_end?.slice(0, 5) ?? null}
    />
  );
}
