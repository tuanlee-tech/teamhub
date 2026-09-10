"use client";

import { createClient } from "@/lib/supabase/client";

function getPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  return key && key.length > 0 ? key : null;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = window.atob(raw);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

/** Current subscription state on this device. Null when unsupported. */
export async function getPushState(): Promise<
  | { supported: false }
  | { supported: true; permission: NotificationPermission; subscribed: boolean }
> {
  if (!isPushSupported()) return { supported: false };
  const registration = await getRegistration();
  const subscription = (await registration?.pushManager.getSubscription()) ?? null;
  return { supported: true, permission: Notification.permission, subscribed: subscription !== null };
}

export async function enablePush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  const publicKey = getPublicKey();
  if (!publicKey) return { ok: false, reason: "missing_key" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const keys = subscription.toJSON().keys;
  if (!keys?.p256dh || !keys?.auth) return { ok: false, reason: "bad_keys" };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    await subscription.unsubscribe();
    return { ok: false, reason: "signed_out" };
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: keys.p256dh,
      auth_secret: keys.auth,
      user_agent: navigator.userAgent,
      is_active: true,
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    await subscription.unsubscribe();
    return { ok: false, reason: "save_failed" };
  }
  return { ok: true };
}

export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await getRegistration();
  const subscription = (await registration?.pushManager.getSubscription()) ?? null;
  if (subscription) {
    const supabase = createClient();
    await supabase.from("push_subscriptions").update({ is_active: false }).eq("endpoint", subscription.endpoint);
    await subscription.unsubscribe().catch(() => {});
  }
}
