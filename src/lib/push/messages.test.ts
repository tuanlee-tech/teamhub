import { describe, expect, it } from "vitest";

import { buildPushPayload } from "./messages";

describe("buildPushPayload", () => {
  it("builds payment payload", () => {
    expect(buildPushPayload("payment", { fineCode: "FABC1", amountVnd: 100000 })).toEqual({
      title: "Đã nhận thanh toán",
      body: "Phiếu FABC1 (100.000₫) đã được thanh toán.",
      url: "/fines/FABC1",
      tag: "fine-paid-FABC1",
    });
  });

  it("builds fine-issued payload", () => {
    const payload = buildPushPayload("fine_issued", { fineCode: "FXYZ9", amountVnd: 50000 });
    expect(payload.title).toBe("Phiếu phạt mới");
    expect(payload.url).toBe("/fines/FXYZ9");
    expect(payload.tag).toBe("fine-issued-FXYZ9");
  });
});
