"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

type PrimaryButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  type?: "submit" | "button" | "reset";
  fullWidth?: boolean;
};

export function PrimaryButton({ children, fullWidth = true, className = "", disabled, ...props }: PrimaryButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      className={`primary-action cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--signal)] ${fullWidth ? "w-full" : ""} disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      disabled={pending || disabled}
      type="submit"
      {...props}
    >
      {pending ? "Đang lưu..." : children}
    </button>
  );
}
