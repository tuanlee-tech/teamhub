"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      const cacheResetKey = "teamhub-dev-cache-cleared-v2";
      if (sessionStorage.getItem(cacheResetKey) !== "1") {
        sessionStorage.setItem(cacheResetKey, "1");
        void Promise.all([
          navigator.serviceWorker.getRegistrations().then((registrations) =>
            Promise.all(registrations.map((registration) => registration.unregister())),
          ),
          caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
        ]).then(() => {
          // The first reload may still be controlled by the old worker. Reload once
          // after unregistering so browsers request the current Next.js bundle.
          window.location.reload();
        });
      }
      return;
    }

    void navigator.serviceWorker.register("/sw-v2.js", {
      scope: "/",
      updateViaCache: "none",
    });

    // Capture install prompt globally (it fires once per page load, possibly
    // before /profile mounts). Stash it and notify listeners.
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      (window as Window & { __teamhubInstallPrompt?: Event }).__teamhubInstallPrompt = event;
      window.dispatchEvent(new CustomEvent("teamhub:install-available"));
    };
    const onInstalled = () => {
      delete (window as Window & { __teamhubInstallPrompt?: Event }).__teamhubInstallPrompt;
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return null;
}
