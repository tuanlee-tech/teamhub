import { describe, expect, it } from "vitest";

import { buildPaymentQrSrc, isPaymentPaidOff } from "./payment-qr-panel";

describe("payment qr panel (B06)", () => {
  it("treats paid/waived/zero-outstanding as paid off", () => {
    expect(isPaymentPaidOff("paid", 10000)).toBe(true);
    expect(isPaymentPaidOff("waived", 10000)).toBe(true);
    expect(isPaymentPaidOff("unpaid", 0)).toBe(true);
    expect(isPaymentPaidOff("unpaid", -5)).toBe(true);
  });

  it("keeps unpaid with outstanding as still owing", () => {
    expect(isPaymentPaidOff("unpaid", 1)).toBe(false);
    expect(isPaymentPaidOff("unpaid", 50000)).toBe(false);
  });

  it("changes qr src when outstanding changes so stale qr is not reused", () => {
    const before = buildPaymentQrSrc("MC-0001", 50000);
    const after = buildPaymentQrSrc("MC-0001", 30000);
    expect(before).toContain("/api/vietqr/MC-0001");
    expect(after).toContain("/api/vietqr/MC-0001");
    expect(before).not.toBe(after);
  });

  it("keeps fine code in qr src and encodes it", () => {
    expect(buildPaymentQrSrc("MC 0001", 1000)).toContain(encodeURIComponent("MC 0001"));
  });
});
