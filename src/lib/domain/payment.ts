import { VIETINBANK_CODE, type SepayBankCode } from "@/lib/banks";

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
