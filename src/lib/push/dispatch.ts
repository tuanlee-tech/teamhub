import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_ATTEMPTS = 5;

function getVapidConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT ?? "mailto:admin@teamhub" };
}

export async function dispatchPushOutbox(admin: SupabaseClient, batchLimit: number, outboxIds?: string[]) {
  const vapid = getVapidConfig();
  if (!vapid) {
    return { ok: false, error: "VAPID not configured", sent: 0, failed: 0 };
  }
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  let pendingQuery = admin
    .from("notification_outbox")
    .select("id, target_user_id, event_type, payload, attempts")
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", new Date().toISOString());

  if (outboxIds && outboxIds.length > 0) {
    pendingQuery = pendingQuery.in("id", outboxIds);
  } else {
    pendingQuery = pendingQuery.order("next_attempt_at", { ascending: true }).limit(batchLimit);
  }

  const { data: pending, error: pendingError } = await pendingQuery;

  if (pendingError) {
    return { ok: false, error: pendingError.message, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  for (const item of pending ?? []) {
    const payload = item.payload as { title?: string; body?: string; url?: string; tag?: string } | null;
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_secret")
      .eq("user_id", item.target_user_id)
      .eq("is_active", true);

    if (!subs || subs.length === 0) {
      await admin
        .from("notification_outbox")
        .update({ status: "failed", attempts: item.attempts + 1, last_error: "No active subscriptions" })
        .eq("id", item.id);
      failed += 1;
      continue;
    }

    let delivered = false;
    let lastError: string | null = null;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_secret } },
          JSON.stringify({
            title: payload?.title ?? "TeamHub",
            body: payload?.body ?? "Bạn có thông báo mới.",
            url: payload?.url ?? "/",
            tag: payload?.tag,
          }),
        );
        delivered = true;
        await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).eq("id", sub.id);
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        lastError = (err as Error).message ?? "Send failed";
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").update({ is_active: false }).eq("id", sub.id);
        }
      }
    }

    if (delivered) {
      await admin
        .from("notification_outbox")
        .update({ status: "sent", processed_at: new Date().toISOString(), last_error: null })
        .eq("id", item.id);
      sent += 1;
    } else {
      const attempts = item.attempts + 1;
      await admin
        .from("notification_outbox")
        .update({
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts,
          next_attempt_at: new Date(Date.now() + attempts * 60_000).toISOString(),
          last_error: lastError,
        })
        .eq("id", item.id);
      failed += 1;
    }
  }

  return { ok: true, sent, failed };
}
