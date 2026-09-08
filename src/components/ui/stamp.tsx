import type { ReactNode } from "react";

type StampProps = {
  children: ReactNode;
  variant?: "signal" | "muted" | "success" | "error" | "warning" | "info";
  className?: string;
};

const variantMap = {
  signal: "text-[var(--signal)]",
  muted: "text-[var(--ink-soft)]",
  success: "bg-emerald-100 text-emerald-800",
  error: "bg-red-100 text-red-800",
  warning: "bg-amber-100 text-amber-800",
  info: "bg-blue-100 text-blue-800",
};

export function Stamp({ children, variant = "signal", className = "" }: StampProps) {
  const isOutline = variant === "signal" || variant === "muted";
  return (
    <span className={`stamp ${isOutline ? "" : "border-0"} ${variantMap[variant]} ${className}`}>
      {children}
    </span>
  );
}
