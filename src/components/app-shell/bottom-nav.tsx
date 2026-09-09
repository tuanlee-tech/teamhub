"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, FileWarning, Home, QrCode, User } from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  match: (pathname: string) => boolean;
};

const primaryItems: NavItem[] = [
  {
    href: "/member",
    label: "Trang chủ",
    icon: Home,
    match: (pathname) => pathname === "/member",
  },
  {
    href: "/fines",
    label: "Phiếu phạt",
    icon: FileWarning,
    match: (pathname) => pathname.startsWith("/fines"),
  },
  {
    href: "/late",
    label: "Đi trễ",
    icon: CalendarCheck,
    match: (pathname) => pathname.startsWith("/late"),
  },
  {
    href: "/profile",
    label: "Cá nhân",
    icon: User,
    match: (pathname) => pathname.startsWith("/profile"),
  },
];

const LEFT_ITEMS = primaryItems.slice(0, 2);
const RIGHT_ITEMS = primaryItems.slice(2);

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Điều hướng chính"
      className="pointer-events-none sticky bottom-0 z-40 mx-auto w-full max-w-5xl px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2"
    >
      <div
        className="pointer-events-auto relative mx-auto grid max-w-lg grid-cols-5 items-center rounded-3xl border border-[var(--line)] bg-[var(--paper)]/90 px-2 pt-2 pb-2 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl"
      >
        {LEFT_ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="group flex min-h-11 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[0.68rem] font-bold tracking-wide"
            >
              <span
                className={`grid size-9 place-items-center rounded-full transition-all duration-200 ${
                  active
                    ? "bg-[var(--signal)] text-[var(--white)] shadow-[0_4px_14px_rgba(247,147,26,0.5)]"
                    : "text-[var(--ink-soft)] group-hover:text-[var(--ink)]"
                }`}
              >
                <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
              </span>
              <span className={active ? "text-[var(--signal)]" : ""}>{item.label}</span>
            </Link>
          );
        })}

        <div className="flex flex-col items-center justify-center">
          <Link
            href="/qr?tab=scan"
            aria-label="Mã QR và quét"
            className="group flex min-h-11 flex-col items-center justify-end gap-1"
          >
            <span
              className={`nav-callout  grid size-14 place-items-center rounded-2xl ring-4 transition-all duration-200 group-hover:scale-110 ${
                pathname.startsWith("/qr")
                  ? "bg-[var(--signal)] text-[var(--white)] shadow-[0_8px_24px_rgba(247,147,26,0.55)] ring-[var(--signal)]/30"
                  : "bg-[var(--signal)] text-[var(--white)] shadow-[0_8px_24px_rgba(247,147,26,0.55)] ring-[var(--signal)]/25"
              }`}
            >
              <QrCode className="size-7 animate-pulse stroke-[2.2]" />
            </span>
          </Link>
        </div>

        {RIGHT_ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="group flex min-h-11 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[0.68rem] font-bold tracking-wide"
            >
              <span
                className={`grid size-9 place-items-center rounded-full transition-all duration-200 ${
                  active
                    ? "bg-[var(--signal)] text-[var(--white)] shadow-[0_4px_14px_rgba(247,147,26,0.5)]"
                    : "text-[var(--ink-soft)] group-hover:text-[var(--ink)]"
                }`}
              >
                <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
              </span>
              <span className={active ? "text-[var(--signal)]" : ""}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
