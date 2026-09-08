import type { ReactNode } from "react";

type DividedListProps = {
  children: ReactNode;
  className?: string;
};

export function DividedList({ children, className = "" }: DividedListProps) {
  return <div className={`divide-y divide-[var(--line)] ${className}`}>{children}</div>;
}

type DividedListItemProps = {
  children: ReactNode;
  className?: string;
};

export function DividedListItem({ children, className = "" }: DividedListItemProps) {
  return <article className={`flex items-center justify-between gap-4 p-5 sm:p-6 ${className}`}>{children}</article>;
}
