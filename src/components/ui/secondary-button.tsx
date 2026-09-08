import type { ReactNode } from "react";

type SecondaryButtonProps = {
  children: ReactNode;
  variant?: "neutral" | "destructive" | "positive";
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
    base: "border-red-300 bg-white text-red-700",
    shadow: "shadow-[0_4px_0_rgba(252,165,165,0.5)]",
    active: "active:translate-y-[2px] active:shadow-[0_2px_0_rgba(252,165,165,0.5)]",
    hover: "hover:bg-red-50",
  },
  positive: {
    base: "border-emerald-300 bg-white text-emerald-700",
    shadow: "shadow-[0_4px_0_rgba(167,243,208,0.5)]",
    active: "active:translate-y-[2px] active:shadow-[0_2px_0_rgba(167,243,208,0.5)]",
    hover: "hover:bg-emerald-50",
  },
};

export function SecondaryButton({ children, variant = "neutral", className = "", disabled, ...props }: SecondaryButtonProps) {
  const v = variantMap[variant];
  return (
    <button
      className={`inline-flex items-center justify-center cursor-pointer rounded-full border px-4 py-2 text-sm font-bold transition-all duration-100 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--signal)] disabled:opacity-60 disabled:cursor-not-allowed ${v.base} ${v.shadow} ${v.active} ${v.hover} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
