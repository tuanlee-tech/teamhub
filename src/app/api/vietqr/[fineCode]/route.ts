import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildTransferDescription, normalizeTransferText } from "@/lib/domain/payment";

function toAscii(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Đđ]/g, "D")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fineCode: string }> }
) {
  const { fineCode } = await params;

  const supabase = await createClient();

  // Get fine info
  const { data: fine, error: fineError } = await supabase
    .from("fines")
    .select("id, code, amount_vnd, status, user_id, organization_id")
    .eq("code", fineCode)
    .maybeSingle();

  if (fineError || !fine) {
    return NextResponse.json({ error: "Fine not found" }, { status: 404 });
  }

  // Outstanding = original amount minus effective allocations.
  const { data: allocations } = await supabase
    .from("fine_allocations")
    .select("amount_vnd, fund_transactions!inner(voided_at)")
    .eq("fine_id", fine.id);

  const allocatedVnd = (allocations ?? []).reduce(
    (sum, row) => sum + (row.amount_vnd ?? 0),
    0,
  );
  const outstandingVnd = Math.max(fine.amount_vnd - allocatedVnd, 0);

  if (fine.status === "paid" || fine.status === "waived" || outstandingVnd <= 0) {
    return NextResponse.json({ error: "no_outstanding" }, { status: 409 });
  }

  // Get member display name
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", fine.user_id)
    .maybeSingle();

  // Get org settings
  const { data: settings } = await supabase
    .from("organization_settings")
    .select(
      "bank_code, bank_account_number, bank_account_holder, transfer_description_rule, fund_display_name, vietqr_template, vietqr_show_info, vietqr_full_account"
    )
    .eq("organization_id", fine.organization_id)
    .maybeSingle();

  if (!settings?.bank_code || !settings?.bank_account_number || !settings?.bank_account_holder) {
    return NextResponse.json({ error: "Bank not configured" }, { status: 400 });
  }

  // Build description
  const asciiName = toAscii(profile?.display_name ?? "MEMBER");
  const rule = normalizeTransferText(settings.transfer_description_rule ?? "");
  const des = buildTransferDescription({
    rule,
    fineCode: fine.code,
    displayName: asciiName,
  });

  // Build VietQR URL for the outstanding amount of this order.
  const usp = new URLSearchParams();
  usp.set("acc", settings.bank_account_number);
  usp.set("bank", settings.bank_code);
  usp.set("amount", String(outstandingVnd));
  usp.set("des", des);
  usp.set("template", settings.vietqr_template ?? "compact");
  usp.set("showinfo", settings.vietqr_show_info ? "true" : "false");
  usp.set("fullacc", settings.vietqr_full_account ? "true" : "false");
  usp.set("holder", settings.bank_account_holder);
  usp.set("store", settings.fund_display_name ?? "TeamHub");

  const vietQrUrl = `https://vietqr.app/img?${usp.toString()}`;

  // Redirect to VietQR image
  return NextResponse.redirect(vietQrUrl, 302);
}