import type { ReactNode } from "react";

type SecondaryButtonProps = {
  children: ReactNode;
  variant?: "neutral" | "destructive" | "positive";
  fullWidth?: boolean;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const variantMap = {
  neutral: {
    base: "border-[var(--line)] bg-[var(--white)]",
    shadow: "shadow-[0_4px_0_var(--line)]",
    active: "active:translate-y-[2px] active:shadow-[0_2px_0_var(--line)]",
    hover: "hover:bg-[var(--paper)]",
  },
  destructive: {
    base: "border-red-800 bg-red-950/40 text-red-300",
    shadow: "shadow-[0_4px_0_rgba(127,29,29,0.7)]",
    active: "active:translate-y-[2px] active:shadow-[0_2px_0_rgba(127,29,29,0.7)]",
    hover: "hover:bg-red-950/60",
  },
  positive: {
    base: "border-emerald-800 bg-emerald-950/40 text-emerald-300",
    shadow: "shadow-[0_4px_0_rgba(6,78,59,0.7)]",
    active: "active:translate-y-[2px] active:shadow-[0_2px_0_rgba(6,78,59,0.7)]",
    hover: "hover:bg-emerald-950/60",
  },
};

export function SecondaryButton({ children, variant = "neutral", fullWidth = false, className = "", disabled, ...props }: SecondaryButtonProps) {
  const v = variantMap[variant];
  return (
    <button
      className={`inline-flex min-h-[52px] items-center justify-center cursor-pointer rounded-full border px-6 py-2 text-sm font-bold transition-all duration-100 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--signal)] disabled:opacity-60 disabled:cursor-not-allowed ${fullWidth ? "w-full" : ""} ${v.base} ${v.shadow} ${v.active} ${v.hover} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
