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
      .select("id")
      .in("attendance_day_id", attendanceDayIds);
    const recordIds = recs?.map((r) => r.id) ?? [];

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
    const countFines = recordIds.length
      ? await supabase.from("fines").select("id", { count: "exact", head: true }).in("attendance_record_id", recordIds)
      : { count: 0 };

    console.log("Sẽ xóa:");
    console.log("  fines:", countFines.count ?? 0);
    console.log("  attendance_records:", countRec.count ?? 0);
    console.log("  check_in_attempts:", countAttempts.count ?? 0);
    console.log("  daily_roster:", countRoster.count ?? 0);

    if (mode !== "clear") {
      console.log("  (dry-run — chạy `npm run db:clear-checkin -- clear` để thực hiện)");
      continue;
    }

    const recRowIds = (await supabase.from("attendance_records").select("id").in("attendance_day_id", attendanceDayIds)).data ?? [];
    if (recRowIds.length > 0) {
      const { error } = await supabase
        .from("fines")
        .delete()
        .in("attendance_record_id", recRowIds.map((r) => r.id));
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