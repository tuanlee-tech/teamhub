/**
 * SePay webhook helpers — pure, Edge-compatible (Web Crypto only).
 * Contract: https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc
 * - Headers: X-SePay-Signature: sha256={hex}, X-SePay-Timestamp: {unix seconds}
 * - Sign: HMAC-SHA256(secret, `${timestamp}.${raw_body}`) as lowercase hex
 * - Timestamp tolerance: |now - ts| <= 300s
 */

export const SEPAY_SIGNATURE_PREFIX = "sha256=";
export const SEPAY_TIMESTAMP_TOLERANCE_SECONDS = 300;
export const SEPAY_TIMESTAMP_SKEW_MS = SEPAY_TIMESTAMP_TOLERANCE_SECONDS * 1000;

function hexEncode(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time string comparison to avoid timing attacks. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function signSePayPayload(rawBody: string, timestamp: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  return `${SEPAY_SIGNATURE_PREFIX}${hexEncode(new Uint8Array(sig))}`;
}

export async function verifySePaySignature(input: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  secret: string;
}): Promise<boolean> {
  const { rawBody, timestamp, signature, secret } = input;
  if (!timestamp || !signature || !secret) return false;
  if (!signature.startsWith(SEPAY_SIGNATURE_PREFIX)) return false;
  const expected = await signSePayPayload(rawBody, timestamp, secret);
  return constantTimeEqual(expected, signature);
}

export function parseSePayTimestamp(value: string | null): number | null {
  if (!value) return null;
  if (!/^\d+$/.test(value.trim())) return null;
  const seconds = Number(value.trim());
  if (!Number.isSafeInteger(seconds) || seconds <= 0) return null;
  return seconds * 1000;
}

export function isFreshSePayTimestamp(timestampMs: number, nowMs: number = Date.now()): boolean {
  return Math.abs(nowMs - timestampMs) <= SEPAY_TIMESTAMP_SKEW_MS;
}

export type NormalizedSePayTransaction = {
  sepayTransactionId: number;
  gateway: string | null;
  transactionAt: string | null;
  accountNumber: string | null;
  subAccount: string | null;
  code: string | null;
  content: string;
  transferType: string | null;
  description: string | null;
  transferAmount: number;
  accumulated: number | null;
  referenceCode: string | null;
};

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function pick(first: unknown, second: unknown): unknown {
  return first !== undefined && first !== null ? first : second;
}

/**
 * Normalize SePay payload. Accepts official camelCase fields and legacy
 * snake_case (test fixtures). Returns null when required fields are missing.
 */
export function normalizeSePayTransaction(payload: unknown): NormalizedSePayTransaction | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;

  const rawId = pick(p.id, p.sepay_transaction_id);
  const sepayTransactionId = asNumber(rawId);
  const rawAmount = pick(p.transferAmount, p.transfer_amount);
  const transferAmount = asNumber(rawAmount);
  const rawContent = pick(p.content, p.transfer_content);
  const content = asString(rawContent);

  if (sepayTransactionId === null || !Number.isInteger(sepayTransactionId)) return null;
  if (transferAmount === null) return null;
  if (content === null || content.trim() === "") return null;

  return {
    sepayTransactionId,
    gateway: asString(pick(p.gateway, null)),
    transactionAt: parseSePayTransactionDate(asString(pick(p.transactionDate, p.transaction_at))),
    accountNumber: asString(pick(p.accountNumber, p.account_number)),
    subAccount: asString(pick(p.subAccount, p.sub_account)),
    code: asString(pick(p.code, p.payment_code)),
    content,
    transferType: asString(pick(p.transferType, p.transfer_type)),
    description: asString(p.description),
    transferAmount,
    accumulated: asNumber(pick(p.accumulated, null)),
    referenceCode: asString(pick(p.referenceCode, p.reference_code)),
  };
}

/**
 * Parse SePay transactionDate. Official format "YYYY-MM-DD HH:mm:ss" is
 * Vietnam local time (+07:00). ISO strings pass through Date as-is.
 */
export function parseSePayTransactionDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  if (match) {
    const [, y, mo, d, h, mi, s] = match.map(Number);
    const utcMs = Date.UTC(y, mo - 1, d, h, mi, s) - 7 * 3600 * 1000;
    return new Date(utcMs).toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/** Extract fine code (F + 4-11 alphanumerics) from transfer content. */
export function extractFineCode(content: string): string | null {
  const match = content.match(/\bF[A-Z0-9]{4,11}\b/);
  return match ? match[0] : null;
}
