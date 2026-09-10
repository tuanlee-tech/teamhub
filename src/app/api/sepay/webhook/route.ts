import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTransferText } from "@/lib/domain/payment";
import {
  extractFineCode,
  isFreshSePayTimestamp,
  normalizeSePayTransaction,
  parseSePayTimestamp,
  verifySePaySignature,
} from "@/lib/sepay/webhook";

export const runtime = "edge";

function getSecret() {
  return process.env.SEPAY_WEBHOOK_SECRET ?? process.env.TEAMHUB_SEPAY_SECRET;
}

function fail(status: number, message: string) {
  return NextResponse.json({ success: false, message }, { status });
}

function ok(extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: true, ...extra });
}

export async function POST(request: NextRequest) {
  const secret = getSecret();
  if (!secret) {
    return fail(500, "Webhook secret not configured");
  }

  const signature = request.headers.get("X-SePay-Signature");
  const timestampHeader = request.headers.get("X-SePay-Timestamp");
  if (!signature || !timestampHeader) {
    return fail(401, "Unauthorized");
  }

  const timestampMs = parseSePayTimestamp(timestampHeader);
  if (timestampMs === null || !isFreshSePayTimestamp(timestampMs)) {
    return fail(401, "Request expired");
  }

  // Raw body — never re-serialize parsed JSON, SePay signs the exact bytes.
  const rawBody = await request.text();
  const valid = await verifySePaySignature({ rawBody, timestamp: timestampHeader, signature, secret });
  if (!valid) {
    return fail(401, "Invalid signature");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return fail(400, "Invalid JSON");
  }

  const tx = normalizeSePayTransaction(payload);
  if (!tx) {
    return fail(400, "Missing required fields");
  }

  const admin = createAdminClient();
  const eventBase = {
    sepay_transaction_id: tx.sepayTransactionId,
    gateway: tx.gateway,
    account_number: tx.accountNumber,
    transfer_type: tx.transferType,
    transfer_amount: tx.transferAmount,
    transaction_at: tx.transactionAt,
    content: tx.content,
    reference_code: tx.referenceCode,
    raw_payload: payload,
  };

  // Only incoming credit transactions move money in — log the rest as ignored.
  if (tx.transferType !== "in") {
    await admin.from("sepay_webhook_events").upsert(
      { ...eventBase, organization_id: null, reconciliation_status: "ignored", processing_error: "Non-incoming transfer" },
      { onConflict: "sepay_transaction_id" },
    );
    return ok({ ignored: true });
  }

  // Resolve organization by bank account number.
  const { data: orgSettings } = await admin
    .from("organization_settings")
    .select("organization_id, bank_account_number, transfer_description_rule")
    .eq("bank_account_number", tx.accountNumber ?? "")
    .maybeSingle();

  if (!orgSettings) {
    // Unknown account — not visible to any manager (organization_id stays NULL).
    await admin.from("sepay_webhook_events").upsert(
      {
        ...eventBase,
        organization_id: null,
        reconciliation_status: "unmatched",
        processing_error: "Account not configured",
      },
      { onConflict: "sepay_transaction_id" },
    );
    return ok({ unmatched: true });
  }

  const organizationId = orgSettings.organization_id as string;

  // Verify description rule matches.
  const normalizedContent = normalizeTransferText(tx.content);
  const normalizedRule = normalizeTransferText(orgSettings.transfer_description_rule ?? "");
  if (normalizedRule && !normalizedContent.includes(normalizedRule)) {
    await admin.from("sepay_webhook_events").upsert(
      {
        ...eventBase,
        organization_id: organizationId,
        reconciliation_status: "unmatched",
        processing_error: "Description rule mismatch",
      },
      { onConflict: "sepay_transaction_id" },
    );
    return ok({ unmatched: true });
  }

  // Extract fine code from content.
  const fineCode = extractFineCode(tx.content);
  if (!fineCode) {
    await admin.from("sepay_webhook_events").upsert(
      {
        ...eventBase,
        organization_id: organizationId,
        reconciliation_status: "unmatched",
        processing_error: "No fine code found in content",
      },
      { onConflict: "sepay_transaction_id" },
    );
    return ok({ unmatched: true });
  }

  // Find matching unpaid fine.
  const { data: fine } = await admin
    .from("fines")
    .select("id, organization_id, user_id, amount_vnd, status, code")
    .eq("code", fineCode)
    .eq("organization_id", organizationId)
    .eq("status", "unpaid")
    .maybeSingle();

  if (!fine) {
    await admin.from("sepay_webhook_events").upsert(
      {
        ...eventBase,
        organization_id: organizationId,
        reconciliation_status: "unmatched",
        processing_error: "Fine not found or already paid",
      },
      { onConflict: "sepay_transaction_id" },
    );
    return ok({ unmatched: true });
  }

  // Check amount matches (allow small rounding difference for transfer fees).
  const amountMatch = Math.abs(tx.transferAmount - fine.amount_vnd) <= 1000;
  const reconciliationStatus = amountMatch ? "matched" : "unmatched";
  const processingError = amountMatch ? null : `Amount mismatch: expected ${fine.amount_vnd}, got ${tx.transferAmount}`;

  // Inbox-first: upsert webhook event (idempotent via unique sepay_transaction_id).
  const { error: webhookError } = await admin.from("sepay_webhook_events").upsert(
    {
      ...eventBase,
      organization_id: organizationId,
      reconciliation_status: reconciliationStatus,
      processing_error: processingError,
    },
    { onConflict: "sepay_transaction_id" },
  );

  if (webhookError) {
    return fail(500, "Failed to log webhook");
  }

  if (!amountMatch) {
    return ok({ unmatched: true, reason: "amount_mismatch" });
  }

  // Amount matches — process payment atomically via RPC.
  const { error: rpcError } = await admin.rpc("process_fine_payment", {
    p_fine_id: fine.id,
    p_sepay_transaction_id: tx.sepayTransactionId,
    p_paid_at: new Date().toISOString(),
  });

  if (rpcError) {
    // Flag the event so the mismatch between event (matched) and fine (unpaid)
    // is visible for manual reconciliation instead of silently diverging.
    // SePay will retry (non-success response); the retry is idempotent.
    await admin
      .from("sepay_webhook_events")
      .update({ processing_error: `Payment failed: ${rpcError.message}` })
      .eq("sepay_transaction_id", tx.sepayTransactionId);
    return fail(500, "Payment processing failed");
  }

  return ok({ paid: true, fine_code: fineCode });
}

export async function GET() {
  return NextResponse.json({ message: "SePay webhook endpoint. Use POST." });
}
