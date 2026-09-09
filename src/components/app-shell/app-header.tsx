import Link from "next/link";
import { LogOut } from "lucide-react";

import { signOut } from "@/app/(auth)/actions";

import { Logo } from "@/components/ui";

type AppHeaderProps = {
  managerLink?: boolean;
};

export function AppHeader({ managerLink }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--paper)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <Logo className="h-8 w-auto shrink-0" />
        </Link>
        <div className="flex items-center gap-2">
          {managerLink ? (
            <Link
              href="/manager"
              className="rounded-full bg-[var(--signal)] px-3 py-1.5 text-xs font-bold text-[var(--white)]"
            >
              Quản lý
            </Link>
          ) : null}
          <form action={signOut}>
            <button
              type="submit"
              className="grid size-9 place-items-center rounded-full border border-[var(--line)] bg-[var(--white)] text-xs font-bold text-[var(--ink-soft)] transition active:translate-y-px"
              aria-label="Đăng xuất"
              title="Đăng xuất"
            >
              <LogOut className="size-4" strokeWidth={2.2} />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}