/**
 * Clear attendance/check-in data cho việc test lại.
 * Mặc định chỉ xóa data của HÔM NAY theo timezone org.
 *
 * Cách dùng:
 *   npm run db:clear-checkin            # dry-run: liệt kê sẽ xóa gì
 *   npm run db:clear-checkin -- clear   # thực hiện xóa (không thể hoàn tác)
 *   npm run db:clear-checkin -- clear 2026-09-09   # xóa theo ngày chỉ định
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Load .env.local manually
const envPath = resolve(import.meta.dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const value = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function args() {
  const [arg0, arg1] = process.argv.slice(2);
  const mode = arg0 === "clear" ? "clear" : "dry";
  const workDate = arg1 ?? null;
  return { mode, workDate };
}

function todayInTimezone(tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts();
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function main() {
  const { mode, workDate: forcedDate } = args();

  const { data: settings, error: settingsError } = await supabase
    .from("organization_settings")
    .select("organization_id, timezone");
  if (settingsError) throw settingsError;
  if (!settings || settings.length === 0) {
    console.log("Không tìm thấy organization_settings.");
    return;
  }

  for (const org of settings) {
    const tz = org.timezone ?? "Asia/Ho_Chi_Minh";
    const workDate = forcedDate ?? todayInTimezone(tz);

    console.log(`\n=== Org ${org.organization_id} | tz=${tz} | work_date=${workDate} ===`);

    const { data: days, error: daysError } = await supabase
      .from("attendance_days")
      .select("id")
      .eq("organization_id", org.organization_id)
      .eq("work_date", workDate);
    if (daysError) throw daysError;

    if (!days || days.length === 0) {
      console.log("Không có attendance_day cho ngày này.");
      continue;
    }
    const dayIds = days.map((d) => d.id);

    const attendanceDayIds = dayIds;
    const { data: recs } = await supabase
      .from("attendance_records")
      .select("id, user_id")
      .in("attendance_day_id", attendanceDayIds);
    const recordIds = recs?.map((r) => r.id) ?? [];
    const userIds = Array.from(new Set((recs ?? []).map((r) => r.user_id)));
    const { data: fineRows, error: fineRowsError } = recordIds.length
      ? await supabase
          .from("fines")
          .select("id, code")
          .in("attendance_record_id", recordIds)
      : { data: [], error: null };
    if (fineRowsError) throw fineRowsError;
    const fineIds = fineRows?.map((fine) => fine.id) ?? [];

    const countRec = await supabase
      .from("attendance_records")
      .select("id", { count: "exact", head: true })
      .in("attendance_day_id", attendanceDayIds);
    const countAttempts = await supabase
      .from("check_in_attempts")
      .select("id", { count: "exact", head: true })
      .in("attendance_day_id", attendanceDayIds);
    const countRoster = await supabase
      .from("daily_roster")
      .select("id", { count: "exact", head: true })
      .in("attendance_day_id", attendanceDayIds);
    const countFines = { count: fineIds.length };
    const countAllocations = fineIds.length
      ? await supabase.from("fine_allocations").select("id", { count: "exact", head: true }).in("fine_id", fineIds)
      : { count: 0 };
    const { data: allocationRows, error: allocationRowsError } = fineIds.length
      ? await supabase.from("fine_allocations").select("fund_transaction_id").in("fine_id", fineIds)
      : { data: [], error: null };
    if (allocationRowsError) throw allocationRowsError;
    const fundTransactionIds = Array.from(new Set((allocationRows ?? []).map((row) => row.fund_transaction_id)));
    const countFundAudits = fundTransactionIds.length
      ? await supabase
          .from("fund_entry_audits")
          .select("id", { count: "exact", head: true })
          .in("fund_transaction_id", fundTransactionIds)
      : { count: 0 };
    const countFundTransactions = { count: fundTransactionIds.length };
    const { data: fundRows, error: fundRowsError } = fundTransactionIds.length
      ? await supabase
          .from("fund_transactions")
          .select("sepay_event_id")
          .in("id", fundTransactionIds)
      : { data: [], error: null };
    if (fundRowsError) throw fundRowsError;
    const sepayEventIds = Array.from(
      new Set((fundRows ?? []).map((row) => row.sepay_event_id).filter((id): id is number => id !== null)),
    );
    const countSepayEvents = sepayEventIds.length
      ? await supabase.from("sepay_webhook_events").select("id", { count: "exact", head: true }).in("id", sepayEventIds)
      : { count: 0 };
    const countOutbox = userIds.length
      ? await supabase
          .from("notification_outbox")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", org.organization_id)
          .in("target_user_id", userIds)
          .gte("created_at", `${workDate}T00:00:00+07:00`)
          .lt("created_at", `${workDate}T23:59:59.999+07:00`)
      : { count: 0 };

    console.log("Sẽ xóa:");
    console.log("  notification_outbox:", countOutbox.count ?? 0);
    console.log("  fine_allocations:", countAllocations.count ?? 0);
    console.log("  fund_entry_audits:", countFundAudits.count ?? 0);
    console.log("  fund_transactions:", countFundTransactions.count ?? 0);
    console.log("  sepay_webhook_events:", countSepayEvents.count ?? 0);
    console.log("  fines:", countFines.count ?? 0);
    console.log("  attendance_records:", countRec.count ?? 0);
    console.log("  check_in_attempts:", countAttempts.count ?? 0);
    console.log("  daily_roster:", countRoster.count ?? 0);

    if (mode !== "clear") {
      console.log("  (dry-run — chạy `npm run db:clear-checkin -- clear` để thực hiện)");
      continue;
    }

    if (userIds.length > 0) {
      const { error } = await supabase
        .from("notification_outbox")
        .delete()
        .eq("organization_id", org.organization_id)
        .in("target_user_id", userIds)
        .gte("created_at", `${workDate}T00:00:00+07:00`)
        .lt("created_at", `${workDate}T23:59:59.999+07:00`);
      if (error) throw new Error(`Xóa notification_outbox: ${error.message}`);
    }
    if (fineIds.length > 0) {
      const { error } = await supabase.from("fine_allocations").delete().in("fine_id", fineIds);
      if (error) throw new Error(`Xóa fine_allocations: ${error.message}`);
    }
    if (fundTransactionIds.length > 0) {
      const { error: eAudit } = await supabase
        .from("fund_entry_audits")
        .delete()
        .in("fund_transaction_id", fundTransactionIds);
      if (eAudit) throw new Error(`Xóa fund_entry_audits: ${eAudit.message}`);
      const { error: eFund } = await supabase.from("fund_transactions").delete().in("id", fundTransactionIds);
      if (eFund) throw new Error(`Xóa fund_transactions: ${eFund.message}`);
    }
    if (sepayEventIds.length > 0) {
      const { error } = await supabase.from("sepay_webhook_events").delete().in("id", sepayEventIds);
      if (error) throw new Error(`Xóa sepay_webhook_events: ${error.message}`);
    }
    if (recordIds.length > 0) {
      const { error } = await supabase.from("fines").delete().in("attendance_record_id", recordIds);
      if (error) throw new Error(`Xóa fines: ${error.message}`);
    }
    const { error: eRec } = await supabase.from("attendance_records").delete().in("attendance_day_id", attendanceDayIds);
    if (eRec) throw new Error(`Xóa attendance_records: ${eRec.message}`);
    const { error: eAttempt } = await supabase.from("check_in_attempts").delete().in("attendance_day_id", attendanceDayIds);
    if (eAttempt) throw new Error(`Xóa check_in_attempts: ${eAttempt.message}`);
    const { error: eRoster } = await supabase.from("daily_roster").delete().in("attendance_day_id", attendanceDayIds);
    if (eRoster) throw new Error(`Xóa daily_roster: ${eRoster.message}`);

    console.log("  ✓ Đã xóa dữ liệu check-in của ngày này");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
