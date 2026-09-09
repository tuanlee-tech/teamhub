import type { ReactNode } from "react";

type StampProps = {
  children: ReactNode;
  variant?: "signal" | "muted" | "success" | "error" | "warning" | "info";
  className?: string;
};

const variantMap = {
  signal: "text-[var(--signal)]",
  muted: "text-[var(--ink-soft)]",
  success: "bg-emerald-950/50 text-emerald-300",
  error: "bg-red-950/50 text-red-300",
  warning: "bg-amber-950/50 text-amber-300",
  info: "bg-blue-950/50 text-blue-300",
};

export function Stamp({ children, variant = "signal", className = "" }: StampProps) {
  const isOutline = variant === "signal" || variant === "muted";
  return (
    <span className={`stamp ${isOutline ? "" : "border-0"} ${variantMap[variant]} ${className}`}>
      {children}
    </span>
  );
}
