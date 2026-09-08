/**
 * Full seed: reset + create members + penalty tiers
 * Chạy: npm run db:seed
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

const ORG_ID = "00000000-0000-4000-8000-000000000001";

const members = [
  { email: "phuoc.nguyen@test.com", password: "Test1234!", displayName: "Phước Nguyễn", username: "phuoc.nguyen" },
  { email: "thanh.ho@test.com", password: "Test1234!", displayName: "Thành Hồ", username: "thanh.ho" },
  { email: "tuong.vi@test.com", password: "Test1234!", displayName: "Tường Vi", username: "tuong.vi" },
  { email: "quoc.bao@test.com", password: "Test1234!", displayName: "Quốc Bảo", username: "quoc.bao" },
  { email: "trung.truong@test.com", password: "Test1234!", displayName: "Trung Trương", username: "trung.truong" },
  { email: "vu.tran@test.com", password: "Test1234!", displayName: "Vũ Trần", username: "vu.tran" },
  { email: "duc.tri@test.com", password: "Test1234!", displayName: "Đức Trí", username: "duc.tri" },
  { email: "cuong.nguyen@test.com", password: "Test1234!", displayName: "Cường Nguyễn", username: "cuong.nguyen" },
  { email: "duc.nguyen@test.com", password: "Test1234!", displayName: "Đức Nguyễn", username: "duc.nguyen" },
];

async function run() {
  // 1. Delete organization test data, but preserve real users and memberships.
  console.log("Cleaning existing data...");
  const tables = [
    "audit_logs", "notification_outbox",
    "kiosk_sessions", "kiosk_qr_challenges", "check_in_attempts",
    "fine_allocations", "fund_entry_audits", "fund_transactions",
    "fines", "attendance_records", "daily_roster", "attendance_days",
    "message_templates", "message_packs", "tts_pool_states",
    "announcement_events", "penalty_tiers", "member_title_history",
    "member_stats", "sepay_webhook_events",
  ];
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq("organization_id", ORG_ID);
    if (error) {
      throw new Error(`Không thể reset ${table}: ${error.message}`);
    }
  }

  const testEmails = new Set(members.map((member) => member.email));
  const { data: existingUsers, error: listUsersError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listUsersError) throw listUsersError;

  for (const user of existingUsers.users) {
    if (user.email && testEmails.has(user.email)) {
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      if (error) throw new Error(`Không thể xóa test user ${user.email}: ${error.message}`);
    }
  }
  console.log("  ✓ Cleaned\n");

  // 2. Reset settings
  console.log("Resetting settings...");
  await supabase
    .from("organization_settings")
    .update({
      valid_check_in_time: "09:35",
      session_start: "00:00",
      session_end: "23:59",
      work_days: [1, 2, 3, 4, 5],
      office_latitude: null,
      office_longitude: null,
    })
    .eq("organization_id", ORG_ID);
  console.log("  ✓ Settings reset\n");

  // 3. Seed members
  console.log("Seeding members...");
  for (const member of members) {
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email: member.email,
      password: member.password,
      email_confirm: true,
      user_metadata: { username: member.username, display_name: member.displayName },
    });
    if (createError) throw new Error(`Không thể tạo ${member.email}: ${createError.message}`);

    const { error: membershipError } = await supabase
      .from("organization_members")
      .update({ status: "active", is_active: true, role: "member" })
      .eq("organization_id", ORG_ID)
      .eq("user_id", userData.user.id);
    if (membershipError) {
      throw new Error(`Không thể kích hoạt ${member.email}: ${membershipError.message}`);
    }

    console.log(`  ✓ ${member.displayName}`);
  }
  console.log("");

  console.log("Done! Thành viên đã sẵn sàng; khung phạt được giữ nguyên theo cấu hình hiện tại.");
}

run().catch(console.error);
