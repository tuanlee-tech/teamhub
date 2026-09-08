import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret =
    process.env.TEAMHUB_CRON_SECRET ?? process.env.INTERNAL_CRON_SECRET ?? process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const results: Record<string, unknown> = {};

  try {
    // Get all active organizations
    const { data: orgs, error: orgError } = await admin
      .from("organizations")
      .select("id")
      .eq("is_default", true); // single org for now

    if (orgError || !orgs?.length) {
      results.organizations = "none found";
    } else {
      for (const org of orgs) {
        // Ensure today's roster
        const { data: rosterResult, error: rosterError } = await admin.rpc("ensure_todays_roster", {
          organization_id: org.id,
        });
        results[`${org.id}_roster`] = rosterError ? { error: rosterError.message } : rosterResult;

        // Run auto-late idempotent
        const { data: autoLateResult, error: autoLateError } = await admin.rpc("auto_late_idempotent");
        results[`${org.id}_auto_late`] = autoLateError ? { error: autoLateError.message } : autoLateResult;
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}