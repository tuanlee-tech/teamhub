"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

type BackHeaderProps = {
  title: string;
  backHref?: string;
};

export function BackHeader({ title, backHref = "/member" }: BackHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--paper)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <Link
          href={backHref}
          aria-label="Quay lại"
          className="grid size-9 place-items-center rounded-full border border-[var(--line)] bg-[var(--white)] text-[var(--ink)] transition active:translate-y-px"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="display-type truncate text-base">{title}</h1>
        <span className="grid size-9 place-items-center" aria-hidden />
      </div>
    </header>
  );
}

export function FocusedLayout({
  title,
  backHref,
  children,
}: {
  title: string;
  backHref?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col">
      <BackHeader title={title} backHref={backHref} />
      <main className="flex-1 px-4 py-6">{children}</main>
    </div>
  );
}