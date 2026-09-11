/**
 * Clear operational/test data while preserving organization config and users.
 *
 * Default is dry-run.
 *
 * Usage:
 *   npm run db:clear-data
 *   npm run db:clear-data -- clear
 *   npm run db:clear-data -- clear --push   # also clear push subscriptions
 *
 * Preserved by default:
 * - organizations, organization_settings
 * - profiles, organization_members, auth.users/private login identifiers
 * - penalty_tiers, tts_settings, message_packs/templates, title_definitions
 * - push_subscriptions (unless --push is passed)
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

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

type TableSpec = {
  table: string;
  filter?: "organization_id" | "none";
  optional?: boolean;
};

const CORE_DELETE_ORDER: TableSpec[] = [
  { table: "notification_outbox", filter: "organization_id" },
  { table: "announcement_events", filter: "organization_id" },
  { table: "tts_pool_states", filter: "organization_id" },
  { table: "kiosk_sessions", filter: "organization_id" },
  { table: "kiosk_otp_challenges", filter: "organization_id", optional: true },
  { table: "kiosk_qr_challenges", filter: "organization_id" },
  { table: "fine_allocations", filter: "organization_id" },
  { table: "fund_entry_audits", filter: "organization_id" },
  { table: "fund_transactions", filter: "organization_id" },
  { table: "sepay_webhook_events", filter: "none" },
  { table: "fines", filter: "organization_id" },
  { table: "check_in_attempts", filter: "organization_id" },
  { table: "attendance_records", filter: "organization_id" },
  { table: "daily_roster", filter: "organization_id" },
  { table: "attendance_days", filter: "organization_id" },
  { table: "member_title_history", filter: "organization_id" },
  { table: "member_stats", filter: "organization_id" },
  { table: "audit_logs", filter: "organization_id" },
];

function parseArgs() {
  const raw = process.argv.slice(2);
  return {
    mode: raw.includes("clear") ? "clear" : "dry",
    includePush: raw.includes("--push"),
  };
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "42P01" || error?.message?.includes("does not exist") === true;
}

async function countRows(spec: TableSpec, organizationIds: string[]) {
  let query = supabase.from(spec.table).select("*", { count: "exact", head: true });
  if (spec.filter === "organization_id") {
    query = query.in("organization_id", organizationIds);
  } else if (spec.filter === "none") {
    query = query.not("id", "is", null);
  }

  const { count, error } = await query;
  if (error && spec.optional && isMissingTable(error)) return null;
  if (error) throw new Error(`Đếm ${spec.table}: ${error.message}`);
  return count ?? 0;
}

async function deleteRows(spec: TableSpec, organizationIds: string[]) {
  let query = supabase.from(spec.table).delete();
  if (spec.filter === "organization_id") {
    query = query.in("organization_id", organizationIds);
  } else if (spec.filter === "none") {
    query = query.not("id", "is", null);
  }

  const { error } = await query;
  if (error && spec.optional && isMissingTable(error)) return;
  if (error) throw new Error(`Xóa ${spec.table}: ${error.message}`);
}

async function main() {
  const { mode, includePush } = parseArgs();

  const { data: orgs, error: orgError } = await supabase.from("organizations").select("id, name, slug").order("created_at");
  if (orgError) throw orgError;
  if (!orgs || orgs.length === 0) {
    console.log("Không tìm thấy organization nào.");
    return;
  }

  const organizationIds = orgs.map((org) => org.id);
  const specs = includePush
    ? [{ table: "push_subscriptions", filter: "none" as const }, ...CORE_DELETE_ORDER]
    : CORE_DELETE_ORDER;

  console.log("\nGiữ lại:");
  console.log("  organizations:", orgs.map((org) => `${org.name} (${org.slug})`).join(", "));
  console.log("  organization_settings, tts_settings, penalty_tiers");
  console.log("  profiles, organization_members, auth users");
  console.log(includePush ? "  push_subscriptions: SẼ XÓA do có --push" : "  push_subscriptions: giữ lại");

  console.log("\nSẽ xóa:");
  const counts: Array<{ table: string; count: number | null }> = [];
  for (const spec of specs) {
    const count = await countRows(spec, organizationIds);
    counts.push({ table: spec.table, count });
    console.log(`  ${spec.table}:`, count === null ? "không tồn tại" : count);
  }

  if (mode !== "clear") {
    console.log("\n(dry-run — chạy `npm run db:clear-data -- clear` để xóa thật)");
    console.log("(thêm `--push` nếu muốn xóa cả push_subscriptions)");
    return;
  }

  for (const spec of specs) {
    const count = counts.find((item) => item.table === spec.table)?.count;
    if (count === null || count === 0) continue;
    await deleteRows(spec, organizationIds);
  }

  console.log("\n✓ Đã xóa dữ liệu nghiệp vụ/rác và giữ lại cấu hình + user hiện tại.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
