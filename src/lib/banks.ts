export const SEPAY_BANK_CODES = [
  "VCB",
  "STB",
  "TPB",
  "VPB",
  "ICB",
  "ACB",
  "BIDV",
  "MB",
  "OCB",
  "KLB",
  "MSB",
] as const;

export type SepayBankCode = (typeof SEPAY_BANK_CODES)[number];

export const VIETINBANK_CODE: SepayBankCode = "ICB";

export const SEPAY_BANKS: ReadonlyArray<{ code: SepayBankCode; name: string; shortName: string }> = [
  { code: "VCB", name: "Vietcombank", shortName: "Vietcombank" },
  { code: "STB", name: "Sacombank", shortName: "Sacombank" },
  { code: "TPB", name: "TPBank", shortName: "TPBank" },
  { code: "VPB", name: "VPBank", shortName: "VPBank" },
  { code: "ICB", name: "VietinBank", shortName: "VietinBank" },
  { code: "ACB", name: "ACB", shortName: "ACB" },
  { code: "BIDV", name: "BIDV", shortName: "BIDV" },
  { code: "MB", name: "MBBank", shortName: "MBBank" },
  { code: "OCB", name: "OCB", shortName: "OCB" },
  { code: "KLB", name: "KienLongBank", shortName: "KienLongBank" },
  { code: "MSB", name: "MSB", shortName: "MSB" },
];

export function bankShortNameForCode(code: string): string {
  return SEPAY_BANKS.find((bank) => bank.code === code)?.shortName ?? code;
}
