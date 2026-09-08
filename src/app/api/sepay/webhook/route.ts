import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTransferText } from "@/lib/domain/payment";

export const runtime = "edge";

function getSecret() {
  return process.env.TEAMHUB_SEPAY_SECRET ?? process.env.SEPAY_WEBHOOK_SECRET;
}

async function verifyHmac(rawBody: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(rawBody);
  const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, msgData);
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return sigBase64 === signature;
}

function extractFineCode(content: string): string | null {
  // Fine code format: F + 4-11 alphanumeric chars
  const match = content.match(/\bF[A-Z0-9]{4,11}\b/);
  return match ? match[0] : null;
}

function normalizeContent(content: string): string {
  return normalizeTransferText(content);
}

export async function POST(request: NextRequest) {
  const secret = getSecret();
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const signature = request.headers.get("X-SePay-Signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const rawBody = await request.text();

  // Verify HMAC
  const valid = await verifyHmac(rawBody, signature, secret);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Check timestamp within 5 minutes
  const transactionAt = payload.transaction_at as string | undefined;
  if (transactionAt) {
    const txTime = new Date(transactionAt).getTime();
    const now = Date.now();
    if (Math.abs(now - txTime) > 5 * 60 * 1000) {
      return NextResponse.json({ error: "Timestamp too old" }, { status: 400 });
    }
  }

  const admin = createAdminClient();

  // Extract fields
  const sepayTransactionId = payload.id as number | undefined;
  const gateway = payload.gateway as string | undefined;
  const accountNumber = payload.account_number as string | undefined;
  const transferType = payload.transfer_type as string | undefined;
  const transferAmount = payload.transfer_amount as number | undefined;
  const content = payload.content as string | undefined;
  const referenceCode = payload.reference_code as string | undefined;

  if (!sepayTransactionId || !transferAmount || !content) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Only process incoming credit transactions
  if (transferType !== "in") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Try to find organization by account number
  const { data: orgSettings } = await admin
    .from("organization_settings")
    .select("organization_id, bank_account_number, transfer_description_rule")
    .eq("bank_account_number", accountNumber ?? "")
    .maybeSingle();

  if (!orgSettings) {
    // Account not found in our system - log but don't error (could be other income)
    await admin.from("sepay_webhook_events").insert({
      sepay_transaction_id: sepayTransactionId,
      gateway,
      account_number: accountNumber,
      transfer_type: transferType,
      transfer_amount: transferAmount,
      transaction_at: transactionAt ? new Date(transactionAt).toISOString() : null,
      content,
      reference_code: referenceCode,
      raw_payload: payload,
      reconciliation_status: "unmatched",
      processing_error: "Account not configured",
    });
    return NextResponse.json({ ok: true, unmatched: true });
  }

  // Verify description rule matches
  const normalizedContent = normalizeContent(content);
  const normalizedRule = normalizeTransferText(orgSettings.transfer_description_rule ?? "");
  if (normalizedRule && !normalizedContent.includes(normalizedRule)) {
    await admin.from("sepay_webhook_events").insert({
      sepay_transaction_id: sepayTransactionId,
      gateway,
      account_number: accountNumber,
      transfer_type: transferType,
      transfer_amount: transferAmount,
      transaction_at: transactionAt ? new Date(transactionAt).toISOString() : null,
      content,
      reference_code: referenceCode,
      raw_payload: payload,
      reconciliation_status: "unmatched",
      processing_error: "Description rule mismatch",
    });
    return NextResponse.json({ ok: true, unmatched: true });
  }

  // Extract fine code from content
  const fineCode = extractFineCode(content);
  if (!fineCode) {
    await admin.from("sepay_webhook_events").insert({
      sepay_transaction_id: sepayTransactionId,
      gateway,
      account_number: accountNumber,
      transfer_type: transferType,
      transfer_amount: transferAmount,
      transaction_at: transactionAt ? new Date(transactionAt).toISOString() : null,
      content,
      reference_code: referenceCode,
      raw_payload: payload,
      reconciliation_status: "unmatched",
      processing_error: "No fine code found in content",
    });
    return NextResponse.json({ ok: true, unmatched: true });
  }

  // Find matching unpaid fine
  const { data: fine } = await admin
    .from("fines")
    .select("id, organization_id, user_id, amount_vnd, status, code")
    .eq("code", fineCode)
    .eq("organization_id", orgSettings.organization_id)
    .eq("status", "unpaid")
    .maybeSingle();

  if (!fine) {
    await admin.from("sepay_webhook_events").insert({
      sepay_transaction_id: sepayTransactionId,
      gateway,
      account_number: accountNumber,
      transfer_type: transferType,
      transfer_amount: transferAmount,
      transaction_at: transactionAt ? new Date(transactionAt).toISOString() : null,
      content,
      reference_code: referenceCode,
      raw_payload: payload,
      reconciliation_status: "unmatched",
      processing_error: "Fine not found or already paid",
    });
    return NextResponse.json({ ok: true, unmatched: true });
  }

  // Check amount matches (allow small rounding difference for transfer fees)
  const amountMatch = Math.abs(transferAmount - fine.amount_vnd) <= 1000; // Allow 1000 VND diff

  const reconciliationStatus = amountMatch ? "matched" : "unmatched";
  const processingError = amountMatch ? null : `Amount mismatch: expected ${fine.amount_vnd}, got ${transferAmount}`;

  // Upsert webhook event (idempotent via unique sepay_transaction_id)
  const { error: webhookError } = await admin.from("sepay_webhook_events").upsert(
    {
      sepay_transaction_id: sepayTransactionId,
      gateway,
      account_number: accountNumber,
      transfer_type: transferType,
      transfer_amount: transferAmount,
      transaction_at: transactionAt ? new Date(transactionAt).toISOString() : null,
      content,
      reference_code: referenceCode,
      raw_payload: payload,
      reconciliation_status: reconciliationStatus,
      processing_error: processingError,
    },
    { onConflict: "sepay_transaction_id" }
  );

  if (webhookError) {
    return NextResponse.json({ error: "Failed to log webhook" }, { status: 500 });
  }

  if (!amountMatch) {
    return NextResponse.json({ ok: true, unmatched: true, reason: "amount_mismatch" });
  }

  // Amount matches - process payment in transaction
  const now = new Date().toISOString();

  // Use RPC for atomic fine payment + fund transaction + allocation
  const { error: rpcError } = await admin.rpc("process_fine_payment", {
    p_fine_id: fine.id,
    p_sepay_transaction_id: sepayTransactionId,
    p_paid_at: now,
  });

  if (rpcError) {
    // If RPC doesn't exist yet, do manual transaction
    // This will be created in a migration
    return NextResponse.json({ error: "Payment processing not ready" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, paid: true, fine_code: fineCode });
}

export async function GET() {
  return NextResponse.json({ message: "SePay webhook endpoint. Use POST." });
}