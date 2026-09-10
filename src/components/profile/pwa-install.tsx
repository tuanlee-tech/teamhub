"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { SecondaryButton, useToast } from "@/components/ui";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * Nút cài PWA vào điện thoại.
 * - Android Chrome/Cốc Cốc: dùng beforeinstallprompt khi browser bắn event.
 * - iOS / trường hợp không có event: hướng dẫn thêm thủ công.
 */
export function PwaInstall() {
  const { success } = useToast();
  const [installed, setInstalled] = useState(false);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [ios] = useState(isIos);

  useEffect(() => {
    if (isStandalone()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync install state on mount
      setInstalled(true);
      return;
    }
    // Event may have fired before this screen mounted (captured globally).
    const stashed = (window as Window & { __teamhubInstallPrompt?: Event }).__teamhubInstallPrompt;
    if (stashed) {
      setPromptEvent(stashed as BeforeInstallPromptEvent);
    }
    const onAvailable = () => {
      const latest = (window as Window & { __teamhubInstallPrompt?: Event }).__teamhubInstallPrompt;
      if (latest) setPromptEvent(latest as BeforeInstallPromptEvent);
    };
    window.addEventListener("teamhub:install-available", onAvailable);
    return () => window.removeEventListener("teamhub:install-available", onAvailable);
  }, []);

  async function install() {
    if (!promptEvent) return;
    setBusy(true);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        setInstalled(true);
        success("Đã cài TeamHub vào điện thoại.");
      }
      setPromptEvent(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="paper-panel space-y-3 p-5 sm:p-6">
      <div>
        <h2 className="display-type text-xl">Cài đặt app</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          {installed
            ? "TeamHub đã được cài trên thiết bị này."
            : "Cài TeamHub vào màn hình chính để mở nhanh như app."}
        </p>
      </div>
      {!installed && promptEvent ? (
        <SecondaryButton type="button" variant="positive" fullWidth disabled={busy} onClick={install}>
          {busy ? "Đang cài..." : "Cài đặt TeamHub"}
        </SecondaryButton>
      ) : null}
      {!installed && !promptEvent ? (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--paper-deep)]/40 px-4 py-3 text-sm text-[var(--ink-soft)]">
          {ios
            ? "Trên iPhone: bấm nút Chia sẻ → “Thêm vào MH chính”."
            : "Trên trình duyệt: mở menu ⋮ → “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”."}
        </p>
      ) : null}
    </section>
  );
}

/** Shows the browser-owned install dialog after an explicit user gesture. */
export function GlobalPwaInstallPrompt() {
  const pathname = usePathname();
  const { success } = useToast();
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const readPrompt = () => {
      const event = (window as Window & { __teamhubInstallPrompt?: Event }).__teamhubInstallPrompt;
      if (event) setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      success("Đã cài TeamHub vào điện thoại.");
    };

    readPrompt();
    window.addEventListener("teamhub:install-available", readPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("teamhub:install-available", readPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [success]);

  if (!promptEvent || pathname === "/profile") return null;

  async function install() {
    if (!promptEvent) return;
    setBusy(true);
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
      setPromptEvent(null);
      delete (window as Window & { __teamhubInstallPrompt?: Event }).__teamhubInstallPrompt;
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="fixed right-4 bottom-20 left-4 z-50 rounded-2xl border border-[var(--line)] bg-[var(--paper-deep)] p-4 shadow-2xl sm:right-6 sm:bottom-6 sm:left-auto sm:w-80">
      <p className="font-bold text-[var(--ink)]">Cài TeamHub</p>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">Mở nhanh toàn màn hình như ứng dụng trên điện thoại.</p>
      <SecondaryButton type="button" variant="positive" fullWidth className="mt-3" disabled={busy} onClick={install}>
        {busy ? "Đang mở..." : "Cài đặt ứng dụng"}
      </SecondaryButton>
    </aside>
  );
}
