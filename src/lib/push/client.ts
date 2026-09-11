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

async function subscribe(registration: ServiceWorkerRegistration): Promise<PushSubscription> {
  const publicKey = getPublicKey();
  if (!publicKey) throw new Error("missing_key");
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}

async function saveSubscription(subscription: PushSubscription): Promise<"ok" | "signed_out" | "bad_keys" | "save_failed"> {
  const keys = subscription.toJSON().keys;
  if (!keys?.p256dh || !keys?.auth) return "bad_keys";

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "signed_out";

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
  return error ? "save_failed" : "ok";
}

async function syncSubscriptionToCurrentUser(registration: ServiceWorkerRegistration): Promise<boolean> {
  let subscription = (await registration.pushManager.getSubscription()) ?? null;
  if (!subscription) return false;

  let saved = await saveSubscription(subscription);
  if (saved === "ok") return true;

  // Existing endpoint can belong to a previously logged-in account. RLS blocks
  // reassigning that row, so rotate the browser subscription for this account.
  if (saved === "save_failed" && getPublicKey()) {
    await subscription.unsubscribe().catch(() => {});
    subscription = await subscribe(registration);
    saved = await saveSubscription(subscription);
    return saved === "ok";
  }

  return false;
}

/** Current subscription state on this device. Null when unsupported. */
export async function getPushState(): Promise<
  | { supported: false }
  | { supported: true; permission: NotificationPermission; subscribed: boolean }
> {
  if (!isPushSupported()) return { supported: false };
  const registration = await getRegistration();
  const subscribed = registration ? await syncSubscriptionToCurrentUser(registration) : false;
  return { supported: true, permission: Notification.permission, subscribed };
}

export async function enablePush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  const publicKey = getPublicKey();
  if (!publicKey) return { ok: false, reason: "missing_key" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const registration = await navigator.serviceWorker.ready;
  let subscription = (await registration.pushManager.getSubscription()) ?? (await subscribe(registration));
  let saved = await saveSubscription(subscription);

  if (saved === "save_failed") {
    await subscription.unsubscribe().catch(() => {});
    subscription = await subscribe(registration);
    saved = await saveSubscription(subscription);
  }

  if (saved !== "ok") {
    await subscription.unsubscribe().catch(() => {});
    return { ok: false, reason: saved };
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

export async function flushPendingPush(): Promise<void> {
  if (typeof window === "undefined") return;
  await fetch("/api/push/flush", { method: "POST" }).catch(() => {});
}
