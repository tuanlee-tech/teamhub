const currencyFormatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
const numberFormatter = new Intl.NumberFormat("vi-VN");

export function formatCurrencyInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return numberFormatter.format(Number(digits));
}

export function parseCurrencyInput(formatted: string): number {
  return Number(formatted.replace(/\D/g, ""));
}

export function formatCurrencyDisplay(amount: number): string {
  return currencyFormatter.format(amount);
}

export function formatNumber(amount: number): string {
  return numberFormatter.format(amount);
}
