"use client";

import { useEffect } from "react";

export function PerformancePatch() {
  useEffect(() => {
    // Suppress noisy errors from browser extensions (e.g., Flash Glass Translate)
    // that do `entries[0].startTime` without checking empty list.
    const errorHandler = (event: ErrorEvent) => {
      const msg = event.message ?? event.error?.message ?? "";
      if (msg.includes("startTime") && msg.includes("undefined")) {
        event.preventDefault();
      }
    };
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const msg = (event.reason as Error)?.message ?? String(event.reason ?? "");
      if (msg.includes("startTime")) {
        event.preventDefault();
      }
    };
    window.addEventListener("error", errorHandler);
    window.addEventListener("unhandledrejection", rejectionHandler);

    // Patch PerformanceObserver to guard empty entries for third-party scripts
    const OrigObserver = window.PerformanceObserver;
    if (OrigObserver) {
      const Patched = class extends OrigObserver {
        constructor(callback: PerformanceObserverCallback) {
          super((list, observer, ...rest) => {
            try {
              const entries = list.getEntries();
              if (!entries || entries.length === 0) return;
              return callback(list, observer, ...rest);
            } catch {
              // swallow
            }
          });
        }
      };
      try {
        Object.defineProperty(Patched, "supportedEntryTypes", {
          get() {
            return (OrigObserver as unknown as { supportedEntryTypes: readonly string[] }).supportedEntryTypes;
          },
        });
      } catch {
        // ignore if not configurable
      }
      window.PerformanceObserver = Patched as unknown as typeof PerformanceObserver;
    }

    return () => {
      window.removeEventListener("error", errorHandler);
      window.removeEventListener("unhandledrejection", rejectionHandler);
      if (OrigObserver) {
        window.PerformanceObserver = OrigObserver;
      }
    };
  }, []);

  return null;
}