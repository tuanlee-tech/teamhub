import { VIETINBANK_CODE, type SepayBankCode } from "@/lib/banks";

export type PaymentBank = {
  bankCode: string;
  bankShortName: string;
  accountNumber: string;
  accountHolder: string;
  transferDescriptionRule: string;
  fundDisplayName: string;
  vietqrTemplate: "compact" | "qronly" | "standee";
  vietqrShowInfo: boolean;
  vietqrFullAccount: boolean;
};

export function paymentBankFromSettings(settings: {
  bank_code: string | null;
  bank_short_name?: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
  transfer_description_rule: string | null;
  fund_display_name: string | null;
  vietqr_template?: "compact" | "qronly" | "standee" | null;
  vietqr_show_info?: boolean | null;
  vietqr_full_account?: boolean | null;
} | null | undefined): PaymentBank | null {
  if (!settings || (!settings.bank_code && !settings.bank_account_number)) {
    return null;
  }
  return {
    bankCode: settings.bank_code ?? "",
    bankShortName: settings.bank_short_name ?? settings.bank_code ?? "",
    accountNumber: settings.bank_account_number ?? "",
    accountHolder: settings.bank_account_holder ?? "",
    transferDescriptionRule: settings.transfer_description_rule ?? "",
    fundDisplayName: settings.fund_display_name ?? "TeamHub",
    vietqrTemplate: settings.vietqr_template ?? "compact",
    vietqrShowInfo: settings.vietqr_show_info ?? true,
    vietqrFullAccount: settings.vietqr_full_account ?? true,
  };
}

export function buildVietQrImageUrl(input: {
  accountNumber: string;
  bank: string;
  amountVnd: number;
  description: string;
  template: "compact" | "qronly" | "standee";
  showInfo: boolean;
  fullAccount: boolean;
  holder: string;
  store: string;
  download?: boolean;
}) {
  const params = new URLSearchParams();
  params.set("acc", input.accountNumber);
  params.set("bank", input.bank);
  params.set("amount", String(Math.max(Math.trunc(input.amountVnd), 0)));
  params.set("des", input.description);
  params.set("template", input.template);
  params.set("showinfo", input.showInfo ? "true" : "false");
  params.set("download", input.download ? "true" : "false");
  params.set("fullacc", input.fullAccount ? "true" : "false");
  params.set("holder", input.holder);
  params.set("store", input.store);
  return `https://vietqr.app/img?${params.toString()}`;
}

export function normalizeTransferText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Đđ]/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateDescriptionRule(bankCode: SepayBankCode, rule: string) {
  const normalizedRule = normalizeTransferText(rule);

  if (!normalizedRule) {
    return { valid: false as const, reason: "description_rule_required" as const };
  }

  if (bankCode === VIETINBANK_CODE && !normalizedRule.includes("SEVQR")) {
    return { valid: false as const, reason: "vietinbank_requires_sevqr" as const };
  }

  return { valid: true as const, normalizedRule };
}

export function buildTransferDescription(input: {
  rule: string;
  fineCode: string;
  displayName: string;
}) {
  return normalizeTransferText(`${input.rule} MC ${input.fineCode} ${input.displayName}`);
}
