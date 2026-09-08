import type { InputHTMLAttributes } from "react";

type FormInputProps = InputHTMLAttributes<HTMLInputElement>;

const inputClassName =
  "mt-2 h-12 w-full rounded-xl border border-[var(--line)] bg-white px-4 font-normal outline-none transition focus:border-[var(--signal)] focus:ring-3 focus:ring-red-100";

export function FormInput({ className = "", ...props }: FormInputProps) {
  return <input className={`${inputClassName} ${className}`} {...props} />;
}
