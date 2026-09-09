import type { InputHTMLAttributes } from "react";

type FormInputProps = InputHTMLAttributes<HTMLInputElement>;

const inputClassName =
  "mt-2 h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--white)] px-4 font-normal text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-soft)] focus:border-[var(--signal)] focus:ring-3 focus:ring-[var(--signal)]/20";

export function FormInput({ className = "", ...props }: FormInputProps) {
  return <input className={`${inputClassName} ${className}`} {...props} />;
}
