"use client";

import { useEffect, useRef } from "react";

type RefreshFn = () => void;

const RETRY_DELAYS_MS = [2_000, 5_000];

export function useRefreshOnForeground(enabled: boolean, refresh: RefreshFn) {
  const refreshRef = useRef(refresh);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;

    const clearTimers = () => {
      for (const timer of timersRef.current) window.clearTimeout(timer);
      timersRef.current = [];
    };

    const run = () => {
      if (document.visibilityState === "hidden") return;
      clearTimers();
      refreshRef.current();
      timersRef.current = RETRY_DELAYS_MS.map((delay) => window.setTimeout(() => refreshRef.current(), delay));
    };

    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    window.addEventListener("pageshow", run);

    return () => {
      clearTimers();
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
      window.removeEventListener("pageshow", run);
    };
  }, [enabled]);
}
