import type { ReactNode } from "react";

type FormLabelProps = {
  children: ReactNode;
  className?: string;
};

export function FormLabel({ children, className = "" }: FormLabelProps) {
  return <label className={`text-sm font-bold ${className}`}>{children}</label>;
}
