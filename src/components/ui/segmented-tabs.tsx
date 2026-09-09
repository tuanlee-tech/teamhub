"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type SegmentedOption = {
  value: string;
  label: string;
  badge?: number;
};

type SegmentedTabsProps = {
  param: string;
  options: SegmentedOption[];
  defaultValue: string;
  ariaLabel?: string;
};

export function SegmentedTabs({
  param,
  options,
  defaultValue,
  ariaLabel,
}: SegmentedTabsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const active = searchParams.get(param) ?? defaultValue;

  function select(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set(param, value);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl border border-[var(--line)] bg-[var(--paper-deep)]/60 p-1"
    >
      {options.map((option) => {
        const selected = active === option.value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={selected}
            onClick={() => select(option.value)}
            className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-bold transition ${
              selected
                ? "bg-[var(--white)] text-[var(--ink)] shadow-sm"
                : "text-[var(--ink-soft)]"
            }`}
          >
            {option.label}
            {typeof option.badge === "number" && option.badge > 0 ? (
              <span
                className={`grid min-w-5 place-items-center rounded-full px-1 py-0.5 text-[0.65rem] font-black ${
                  selected ? "bg-[var(--signal)] text-[var(--paper)]" : "bg-[var(--ink)]/10 text-[var(--ink-soft)]"
                }`}
              >
                {option.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}