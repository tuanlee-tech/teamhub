import Link from "next/link";

import { signOut } from "@/app/(auth)/actions";
import { Logo, SecondaryButton } from "@/components/ui";

type ModuleShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

export function ModuleShell({ eyebrow, title, description, children }: ModuleShellProps) {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-6 sm:px-8 lg:px-12 lg:py-10">
      <header className="flex items-center justify-between border-b border-[var(--line)] pb-5">
        <Link className="flex items-center gap-3" href="/">
          <Logo className="h-9 w-auto" />
        </Link>
        <div className="flex items-center gap-4">
          <span className="stamp text-[var(--ink-soft)]">{eyebrow}</span>
          <form action={signOut}>
            <SecondaryButton type="submit">Đăng xuất</SecondaryButton>
          </form>
        </div>
      </header>

      <section className="grid gap-8 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:py-16">
        <div>
          <p className="text-sm font-black tracking-[0.18em] text-[var(--signal)] uppercase">{eyebrow}</p>
          <h1 className="display-type mt-4 text-5xl leading-[0.9] sm:text-7xl">{title}</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--ink-soft)]">{description}</p>
        </div>
        <div>{children}</div>
      </section>
    </main>
  );
}
