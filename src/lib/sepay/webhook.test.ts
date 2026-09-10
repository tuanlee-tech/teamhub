import { describe, expect, it } from "vitest";

import {
  constantTimeEqual,
  extractFineCode,
  isFreshSePayTimestamp,
  normalizeSePayTransaction,
  parseSePayTimestamp,
  parseSePayTransactionDate,
  signSePayPayload,
  verifySePaySignature,
} from "./webhook";

const SECRET = "whsec_test_secret_123";

function officialPayload() {
  return {
    id: 92704,
    gateway: "Vietcombank",
    transactionDate: "2024-07-02 11:08:33",
    accountNumber: "1017588888",
    subAccount: "",
    code: "SEVN63DC8E5C",
    content: "SEVQR MC FABC1234 NGUYEN VAN A",
    transferType: "in",
    description: "NGUYEN VAN A chuyen tien",
    transferAmount: 5000000,
    accumulated: 105000000,
    referenceCode: "FT24012345678",
  };
}

describe("signSePayPayload / verifySePaySignature", () => {
  it("verifies a correctly signed request", async () => {
    const rawBody = JSON.stringify(officialPayload());
    const timestamp = "1757328000";
    const signature = await signSePayPayload(rawBody, timestamp, SECRET);
    expect(signature.startsWith("sha256=")).toBe(true);
    await expect(verifySePaySignature({ rawBody, timestamp, signature, secret: SECRET })).resolves.toBe(true);
  });

  it("rejects tampered body", async () => {
    const rawBody = JSON.stringify(officialPayload());
    const timestamp = "1757328000";
    const signature = await signSePayPayload(rawBody, timestamp, SECRET);
    const tampered = rawBody.replace("5000000", "5000001");
    await expect(verifySePaySignature({ rawBody: tampered, timestamp, signature, secret: SECRET })).resolves.toBe(
      false,
    );
  });

  it("rejects wrong secret and missing sha256= prefix", async () => {
    const rawBody = JSON.stringify(officialPayload());
    const timestamp = "1757328000";
    const signature = await signSePayPayload(rawBody, timestamp, SECRET);
    await expect(verifySePaySignature({ rawBody, timestamp, signature, secret: "wrong" })).resolves.toBe(false);
    await expect(
      verifySePaySignature({ rawBody, timestamp, signature: signature.slice("sha256=".length), secret: SECRET }),
    ).resolves.toBe(false);
    await expect(verifySePaySignature({ rawBody, timestamp: null, signature, secret: SECRET })).resolves.toBe(false);
  });
});

describe("constantTimeEqual", () => {
  it("compares safely", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});

describe("parseSePayTimestamp / isFreshSePayTimestamp", () => {
  it("parses unix seconds and rejects garbage", () => {
    expect(parseSePayTimestamp("1757328000")).toBe(1757328000 * 1000);
    expect(parseSePayTimestamp(null)).toBeNull();
    expect(parseSePayTimestamp("not-a-number")).toBeNull();
    expect(parseSePayTimestamp("-5")).toBeNull();
  });

  it("accepts skew within 5 minutes", () => {
    const now = 1_757_328_000_000;
    expect(isFreshSePayTimestamp(now, now)).toBe(true);
    expect(isFreshSePayTimestamp(now - 299_000, now)).toBe(true);
    expect(isFreshSePayTimestamp(now - 301_000, now)).toBe(false);
    expect(isFreshSePayTimestamp(now + 301_000, now)).toBe(false);
  });
});

describe("normalizeSePayTransaction", () => {
  it("normalizes the official camelCase payload", () => {
    const tx = normalizeSePayTransaction(officialPayload());
    expect(tx).toMatchObject({
      sepayTransactionId: 92704,
      gateway: "Vietcombank",
      accountNumber: "1017588888",
      transferType: "in",
      transferAmount: 5000000,
      referenceCode: "FT24012345678",
    });
    expect(tx?.transactionAt).toBe("2024-07-02T04:08:33.000Z");
  });

  it("supports legacy snake_case fixtures", () => {
    const tx = normalizeSePayTransaction({ id: 1, transfer_amount: 10000, content: "FABC1" });
    expect(tx).toMatchObject({ sepayTransactionId: 1, transferAmount: 10000, content: "FABC1" });
  });

  it("rejects payloads missing required fields", () => {
    expect(normalizeSePayTransaction(null)).toBeNull();
    expect(normalizeSePayTransaction({ id: 1, content: "x" })).toBeNull();
    expect(normalizeSePayTransaction({ id: 1, transferAmount: 5 })).toBeNull();
    expect(normalizeSePayTransaction({ transferAmount: 5, content: "x" })).toBeNull();
  });
});

describe("parseSePayTransactionDate", () => {
  it("treats SePay datetime as Vietnam local time", () => {
    expect(parseSePayTransactionDate("2024-07-02 11:08:33")).toBe("2024-07-02T04:08:33.000Z");
  });

  it("passes ISO through and rejects garbage", () => {
    expect(parseSePayTransactionDate("2024-07-02T11:08:33+07:00")).toBe("2024-07-02T04:08:33.000Z");
    expect(parseSePayTransactionDate(null)).toBeNull();
    expect(parseSePayTransactionDate("tomorrow")).toBeNull();
  });
});

describe("extractFineCode", () => {
  it("extracts the first fine code", () => {
    expect(extractFineCode("SEVQR MC FABC1234 NGUYEN VAN A")).toBe("FABC1234");
    expect(extractFineCode("no code here")).toBeNull();
  });
});
