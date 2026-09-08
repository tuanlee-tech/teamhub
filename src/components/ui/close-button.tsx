"use client";

import type { ButtonHTMLAttributes } from "react";

import { SecondaryButton } from "@/components/ui/secondary-button";

export function CloseButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <SecondaryButton
      aria-label="Đóng"
      className="h-10 w-10 min-h-10 min-w-10 rounded-full !border-transparent !bg-[rgba(225,75,50,0.06)] !p-0 text-[var(--signal)] !shadow-[0_3px_0_rgba(225,75,50,0.28)] hover:!bg-[rgba(225,75,50,0.14)] hover:text-[var(--signal)]"
      title="Đóng"
      type="button"
      {...props}
    >
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    </SecondaryButton>
  );
}
