import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeTransferText } from "@/lib/domain/payment";

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
    .select("id, code, amount_vnd, user_id, organization_id")
    .eq("code", fineCode)
    .maybeSingle();

  if (fineError || !fine) {
    return NextResponse.json({ error: "Fine not found" }, { status: 404 });
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
  const des = normalizeTransferText(`${rule} MC ${fine.code} ${asciiName}`);

  // Build VietQR URL
  const usp = new URLSearchParams();
  usp.set("acc", settings.bank_account_number);
  usp.set("bank", settings.bank_code);
  usp.set("amount", String(fine.amount_vnd));
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