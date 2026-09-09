import { AppHeader } from "@/components/app-shell/app-header";
import { BottomNav } from "@/components/app-shell/bottom-nav";

type ShellLayoutProps = {
  children: React.ReactNode;
  managerLink?: boolean;
};

export function ShellLayout({ children, managerLink }: ShellLayoutProps) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col">
      <AppHeader managerLink={managerLink} />
      <main className="flex-1 px-4 py-6 pb-24">{children}</main>
      <BottomNav />
    </div>
  );
}