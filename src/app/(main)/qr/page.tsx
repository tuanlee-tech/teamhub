import { QrHub } from "@/components/qr/qr-hub";
import { requireActiveMember } from "@/lib/auth";

export default async function QrPage() {
  const context = await requireActiveMember();
  return <QrHub orgId={context.membership.organizationId} />;
}
