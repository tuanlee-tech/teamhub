"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);

  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function OnlineStatus() {
  const isOnline = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-[var(--signal)] px-4 py-2 text-center text-sm font-bold text-white">
      Đang ngoại tuyến. Điểm danh và giao dịch tạm thời bị khóa.
    </div>
  );
}
