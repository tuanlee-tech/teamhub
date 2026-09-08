"use client";

import { useEffect, useRef } from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

import { HelpButton } from "@/components/ui";

const TOUR_KEY = "teamhub-tour-manager-settings-v1";

function switchTab(tabId: string, continueTour: () => void) {
  document.querySelector<HTMLElement>(`[data-tour="settings-tab-${tabId}"]`)?.click();
  window.setTimeout(continueTour, 0);
}

const tourSteps = [
  {
    element: '[data-tour="settings-tabs"]',
    popover: {
      title: "Ba nhóm cấu hình",
      description: "Các thiết lập được chia theo Điểm danh, Thanh toán và Âm thanh để dễ tìm và chỉnh sửa.",
      side: "bottom" as const,
      align: "start" as const,
    },
  },
  {
    element: '[data-tour="settings-attendance-form"]',
    popover: {
      title: "Điểm danh",
      description: "Thiết lập múi giờ, ca làm, ngày làm việc và vị trí văn phòng cho việc check-in.",
      side: "top" as const,
      align: "start" as const,
      onNextClick: (_element: Element | undefined, _step: unknown, opts: { driver: Driver }) => {
        switchTab("payments", () => opts.driver.moveNext());
      },
    },
  },
  {
    element: '[data-tour="settings-vietqr-preview"]',
    popover: {
      title: "Thanh toán và VietQR",
      description: "Chọn ngân hàng, template và các tùy chọn hiển thị. Preview VietQR lấy trực tiếp từ dữ liệu bạn đang nhập.",
      side: "top" as const,
      align: "start" as const,
      onPrevClick: (_element: Element | undefined, _step: unknown, opts: { driver: Driver }) => {
        switchTab("attendance", () => opts.driver.movePrevious());
      },
      onNextClick: (_element: Element | undefined, _step: unknown, opts: { driver: Driver }) => {
        switchTab("voice", () => opts.driver.moveNext());
      },
    },
  },
  {
    element: '[data-tour="settings-tts-range"]',
    popover: {
      title: "Giọng MC",
      description: "Chọn sự kiện được đọc, quiet hours, ngôn ngữ, tốc độ và cao độ giọng đọc.",
      side: "top" as const,
      align: "start" as const,
      onPrevClick: (_element: Element | undefined, _step: unknown, opts: { driver: Driver }) => {
        switchTab("payments", () => opts.driver.movePrevious());
      },
    },
  },
];

function createSettingsTour(onComplete?: () => void) {
  const steps = tourSteps.filter((step) => document.querySelector(step.element));
  if (steps.length === 0) return null;

  return driver({
    animate: true,
    allowClose: true,
    overlayColor: "rgba(16, 42, 44, 0.58)",
    showProgress: true,
    nextBtnText: "Tiếp",
    prevBtnText: "Quay lại",
    doneBtnText: "Hoàn tất",
    progressText: "{{current}} / {{total}}",
    steps,
    onDestroyed: onComplete,
  });
}

export function SettingsTour() {
  const driverRef = useRef<Driver | null>(null);

  const startTour = () => {
    driverRef.current?.destroy();
    driverRef.current = createSettingsTour(() => {
      window.localStorage.setItem(TOUR_KEY, "completed");
    });
    driverRef.current?.drive();
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!window.localStorage.getItem(TOUR_KEY)) startTour();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      driverRef.current?.destroy();
    };
  }, []);

  return <HelpButton onClick={startTour} />;
}
