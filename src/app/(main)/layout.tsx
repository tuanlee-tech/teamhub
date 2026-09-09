import { ShellLayout } from "@/components/app-shell/shell-layout";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ShellLayout>{children}</ShellLayout>;
}
