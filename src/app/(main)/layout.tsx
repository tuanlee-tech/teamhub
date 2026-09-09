import { ShellLayout } from "@/components/app-shell/shell-layout";
import { requireActiveMember } from "@/lib/auth";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireActiveMember();
  return (
    <ShellLayout managerLink={context.membership.role === "manager"}>
      {children}
    </ShellLayout>
  );
}