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

export const SEPAY_BANKS: ReadonlyArray<{ code: SepayBankCode; name: string }> = [
  { code: "VCB", name: "Vietcombank" },
  { code: "STB", name: "Sacombank" },
  { code: "TPB", name: "TPBank" },
  { code: "VPB", name: "VPBank" },
  { code: "ICB", name: "VietinBank" },
  { code: "ACB", name: "ACB" },
  { code: "BIDV", name: "BIDV" },
  { code: "MB", name: "MBBank" },
  { code: "OCB", name: "OCB" },
  { code: "KLB", name: "KienLongBank" },
  { code: "MSB", name: "MSB" },
];
