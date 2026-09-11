import { NextResponse } from "next/server";

import { dispatchPushOutbox } from "@/lib/push/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: pending, error } = await admin
    .from("notification_outbox")
    .select("id")
    .eq("target_user_id", user.id)
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(5);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (pending ?? []).map((row) => row.id);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0 });
  }

  const result = await dispatchPushOutbox(admin, ids.length, ids);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result);
}
