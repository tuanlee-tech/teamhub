import type { ButtonHTMLAttributes } from "react";

import { SecondaryButton } from "./secondary-button";

type HelpButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type"> & {
  label?: string;
};

export function HelpButton({ label = "Hướng dẫn", className = "", ...props }: HelpButtonProps) {
  return (
    <SecondaryButton aria-label={label} className={`gap-2 px-3 py-1.5 ${className}`} type="button" {...props}>
      <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" fill="var(--ink)" r="10" />
        <path
          d="M9.75 9.25a2.35 2.35 0 1 1 3.76 1.88c-.86.64-1.51 1.03-1.51 2.12m0 2.75h.01"
          stroke="var(--white)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
      <span>{label}</span>
    </SecondaryButton>
  );
}
