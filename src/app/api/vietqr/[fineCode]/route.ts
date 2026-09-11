import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { buildTransferDescription, buildVietQrImageUrl, normalizeTransferText } from "@/lib/domain/payment";

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

  // Không nới quyền: chỉ active member cùng org mới được tạo QR.
  // RLS fines vốn đã giới hạn owner/manager, check thêm org để defense-in-depth.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Fine not found" }, { status: 404 });
  }
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role, is_active, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership || membership.status !== "active" || !membership.is_active) {
    return NextResponse.json({ error: "Fine not found" }, { status: 404 });
  }

  // AuthZ ở trên dùng session viewer; đọc dữ liệu thanh toán bằng service role để
  // manager/kiosk xem được QR fine của người khác mà không bị RLS owner che.
  const admin = createAdminClient();

  const { data: fine, error: fineError } = await admin
    .from("fines")
    .select("id, code, amount_vnd, status, user_id, organization_id")
    .eq("code", fineCode)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  if (fineError || !fine) {
    return NextResponse.json({ error: "Fine not found" }, { status: 404 });
  }

  const canViewQr =
    fine.user_id === user.id || membership.role === "manager" || membership.role === "kiosk";
  if (!canViewQr) {
    return NextResponse.json({ error: "Fine not found" }, { status: 404 });
  }

  // Outstanding = original amount minus effective allocations.
  // Contract §13 + get_daily_late_list: loại allocation có fund đã void.
  // Không tin số tiền từ client (query `amount` chỉ để cache-bust, bỏ qua ở đây).
  const { data: allocations } = await admin
    .from("fine_allocations")
    .select("amount_vnd, fund_transactions(voided_at)")
    .eq("fine_id", fine.id);

  const allocatedVnd = (allocations ?? [])
    .filter((row) => {
      // Supabase có thể trả join dạng object hoặc array; void = đã void.
      const fund = row.fund_transactions as unknown;
      const funds = Array.isArray(fund) ? fund : [fund];
      return funds.every(
        (item) => item == null || (item as { voided_at: string | null }).voided_at == null,
      );
    })
    .reduce((sum, row) => sum + (row.amount_vnd ?? 0), 0);
  const outstandingVnd = Math.max(fine.amount_vnd - allocatedVnd, 0);

  if (fine.status === "paid" || fine.status === "waived" || outstandingVnd <= 0) {
    return NextResponse.json({ error: "no_outstanding" }, { status: 409 });
  }

  // Get member display name — luôn dùng chủ fine (fine.user_id), không nhầm viewer.
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("user_id", fine.user_id)
    .maybeSingle();

  // Get org settings
  const { data: settings } = await admin
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
  const vietQrUrl = buildVietQrImageUrl({
    accountNumber: settings.bank_account_number,
    bank: settings.bank_code,
    amountVnd: outstandingVnd,
    description: des,
    template: settings.vietqr_template ?? "compact",
    showInfo: settings.vietqr_show_info ?? true,
    fullAccount: settings.vietqr_full_account ?? true,
    holder: settings.bank_account_holder,
    store: settings.fund_display_name ?? "TeamHub",
    download: request.nextUrl.searchParams.get("download") === "true",
  });

  if (request.nextUrl.searchParams.get("proxy") === "true") {
    const image = await fetch(vietQrUrl, { cache: "no-store" });
    if (!image.ok) {
      return NextResponse.json({ error: "VietQR image unavailable" }, { status: 502 });
    }
    return new NextResponse(image.body, {
      status: 200,
      headers: {
        "Content-Type": image.headers.get("content-type") ?? "image/png",
        "Cache-Control": "no-store",
      },
    });
  }

  // Redirect to VietQR image. no-store để QR cũ theo outstanding cũ không bị
  // browser/CDN giữ lại sau khi allocation/payment đổi số tiền.
  const redirect = NextResponse.redirect(vietQrUrl, 302);
  redirect.headers.set("Cache-Control", "no-store");
  return redirect;
}
