"use client";

import { useState, type ChangeEvent, type InputHTMLAttributes } from "react";

type ToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: string;
  description?: string;
};

export function Toggle({ label, description, className = "", ...props }: ToggleProps) {
  const { checked, defaultChecked, onChange, ...inputProps } = props;
  const [internalChecked, setInternalChecked] = useState(Boolean(defaultChecked));
  const isChecked = checked ?? internalChecked;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (checked === undefined) setInternalChecked(event.target.checked);
    onChange?.(event);
  }

  return (
    <label className={`flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--line)] bg-white p-3 text-sm font-bold ${className}`}>
      <input className="peer sr-only" defaultChecked={defaultChecked} onChange={handleChange} type="checkbox" checked={checked} {...inputProps} />
      <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--signal)] peer-focus-visible:ring-offset-2 ${isChecked ? "bg-[var(--signal)]" : "bg-[var(--line)]"}`}>
        <span className={`inline-block size-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${isChecked ? "translate-x-5" : "translate-x-0"}`} />
      </span>
      <span className="flex-1">
        {label}
        {description ? <span className="block text-xs font-normal text-[var(--ink-soft)]">{description}</span> : null}
      </span>
    </label>
  );
}
