import { NextRequest, NextResponse } from "next/server";
import { dispatchPushOutbox } from "@/lib/push/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BATCH_LIMIT = 20;

function getCronSecret(): string | undefined {
  return process.env.CRON_SECRET ?? process.env.TEAMHUB_CRON_SECRET ?? process.env.INTERNAL_CRON_SECRET;
}

export async function GET(request: NextRequest) {
  const cronSecret = getCronSecret();
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await dispatchPushOutbox(admin, BATCH_LIMIT);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result);
}
