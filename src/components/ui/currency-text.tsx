import { formatCurrencyDisplay, formatNumber } from "@/lib/currency";

type CurrencyTextProps = {
  amount: number;
  variant?: "currency" | "number";
  className?: string;
};

export function CurrencyText({ amount, variant = "currency", className = "" }: CurrencyTextProps) {
  const text = variant === "currency" ? formatCurrencyDisplay(amount) : formatNumber(amount);
  return <strong className={`text-[var(--signal)] ${className}`}>{text}</strong>;
}
