import { VIETINBANK_CODE, type SepayBankCode } from "@/lib/banks";

export type PaymentBank = {
  bankCode: string;
  accountNumber: string;
  accountHolder: string;
  transferDescriptionRule: string;
  fundDisplayName: string;
};

export function paymentBankFromSettings(settings: {
  bank_code: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
  transfer_description_rule: string | null;
  fund_display_name: string | null;
} | null | undefined): PaymentBank | null {
  if (!settings || (!settings.bank_code && !settings.bank_account_number)) {
    return null;
  }
  return {
    bankCode: settings.bank_code ?? "",
    accountNumber: settings.bank_account_number ?? "",
    accountHolder: settings.bank_account_holder ?? "",
    transferDescriptionRule: settings.transfer_description_rule ?? "",
    fundDisplayName: settings.fund_display_name ?? "TeamHub",
  };
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
