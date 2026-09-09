import type { InputHTMLAttributes } from "react";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: string;
};

export function Checkbox({ label, className = "", ...props }: CheckboxProps) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-3 text-sm font-semibold ${className}`}>
      <input className="peer sr-only" type="checkbox" {...props} />
      <span className="relative flex size-5 shrink-0 items-center justify-center rounded-md border-2 border-[var(--line)] bg-[var(--white)] transition-all peer-checked:border-[var(--signal)] peer-checked:bg-[var(--signal)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--signal)] peer-focus-visible:ring-offset-2 peer-checked:[&>svg]:scale-100 peer-checked:[&>svg]:opacity-100">
        <svg className="size-3 scale-75 text-[var(--paper)] opacity-0 transition-all duration-150" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
      {label}
    </label>
  );
}
