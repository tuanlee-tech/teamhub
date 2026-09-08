import { describe, expect, it } from "vitest";

import { buildTransferDescription, normalizeTransferText, validateDescriptionRule } from "./payment";

describe("payment descriptions", () => {
  it("normalizes Vietnamese text for VietQR", () => {
    expect(normalizeTransferText("Đóng phạt - Nguyễn Văn An")).toBe("DONG PHAT NGUYEN VAN AN");
  });

  it("requires SEVQR for VietinBank", () => {
    expect(validateDescriptionRule("ICB", "DONG PHAT")).toEqual({
      valid: false,
      reason: "vietinbank_requires_sevqr",
    });
    expect(validateDescriptionRule("ICB", "SEVQR DONG PHAT").valid).toBe(true);
  });

  it("includes the unique fine code", () => {
    expect(
      buildTransferDescription({
        rule: "SEVQR DONG PHAT",
        fineCode: "A7K29",
        displayName: "Nguyễn Văn An",
      }),
    ).toBe("SEVQR DONG PHAT MC A7K29 NGUYEN VAN AN");
  });
});
