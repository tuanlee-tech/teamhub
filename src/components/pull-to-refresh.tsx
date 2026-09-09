"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, RefreshCw } from "lucide-react";

const TRIGGER_DISTANCE = 96;

export function PullToRefresh() {
  const router = useRouter();
  const startYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const [mounted, setMounted] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Do not render browser-only pull state during SSR hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const body = document.body;
    const originalPaddingTop = body.style.paddingTop;
    const originalTransition = body.style.transition;
    body.style.transition = "padding-top 220ms cubic-bezier(0.22, 1, 0.36, 1)";

    const setBodyPadding = (distance: number) => {
      body.style.paddingTop = distance > 0 ? `${distance}px` : "0px";
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (window.scrollY === 0 && event.touches.length === 1) {
        startYRef.current = event.touches[0].clientY;
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (startYRef.current === null || refreshing || event.touches.length !== 1) return;

      const distance = event.touches[0].clientY - startYRef.current;
      if (distance <= 0 || window.scrollY > 0) {
        pullDistanceRef.current = 0;
        setBodyPadding(0);
        setPullDistance(0);
        return;
      }

      const easedDistance = Math.min(distance * 0.65, 112);
      pullDistanceRef.current = easedDistance;
      setBodyPadding(easedDistance);
      setPullDistance(easedDistance);
      event.preventDefault();
    };

    const handleTouchEnd = () => {
      const shouldRefresh = pullDistanceRef.current >= TRIGGER_DISTANCE * 0.5;
      startYRef.current = null;
      pullDistanceRef.current = 0;
      setBodyPadding(0);
      setPullDistance(0);

      if (!shouldRefresh || refreshing) return;
      setRefreshing(true);
      window.dispatchEvent(new Event("teamhub:pull-refresh"));
      startTransition(() => router.refresh());
      window.setTimeout(() => setRefreshing(false), 900);
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
      body.style.paddingTop = originalPaddingTop;
      body.style.transition = originalTransition;
    };
  }, [refreshing, router]);

  const visible = refreshing || pullDistance > 0;
  const ready = pullDistance >= TRIGGER_DISTANCE * 0.5;

  if (!mounted) return null;

  return (
    <div
      aria-live="polite"
      aria-label={refreshing ? "Đang cập nhật" : ready ? "Thả để làm mới" : "Kéo để làm mới"}
      className={`pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center transition-[opacity,transform] duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
      style={{ transform: `translateY(${refreshing ? 12 : pullDistance - 28}px)` }}
    >
      <div className={`flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--ink)] text-[var(--paper)] shadow-lg ${ready && !refreshing ? "px-4 py-2.5" : "size-11 justify-center"}`}>
        {refreshing ? <RefreshCw aria-hidden="true" className="size-5 animate-spin" /> : <ArrowDown aria-hidden="true" className={`size-5 transition-transform duration-200 ${ready ? "rotate-180" : ""}`} />}
        {ready && !refreshing ? <span className="text-xs font-black tracking-[0.08em] uppercase">Thả để làm mới</span> : null}
        <span className="sr-only">{refreshing ? "Đang cập nhật" : ready ? "Thả để làm mới" : "Kéo để làm mới"}</span>
      </div>
    </div>
  );
}
