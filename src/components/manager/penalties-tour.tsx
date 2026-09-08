"use client";

import { useEffect, useRef } from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

import { HelpButton } from "@/components/ui";

const TOUR_KEY = "teamhub-tour-manager-penalties-v1";

const steps = [
  {
    element: '[data-tour="penalties-add"]',
    popover: {
      title: "Thêm khung phạt",
      description: "Mở khu vực này để thêm một mốc phút trễ và số tiền phạt tương ứng.",
      side: "bottom" as const,
      align: "start" as const,
    },
  },
  {
    element: '[data-tour="penalties-threshold"]',
    popover: {
      title: "Mốc bắt đầu áp dụng",
      description: "Ví dụ: mốc 1 phút sẽ áp dụng từ phút trễ đầu tiên. Các mốc tiếp theo sẽ tạo khoảng phạt mới.",
      side: "bottom" as const,
      align: "start" as const,
    },
  },
  {
    element: '[data-tour="penalties-list"]',
    popover: {
      title: "Các khung đang áp dụng",
      description: "Mỗi khung hiển thị cả khoảng phút và khoảng giờ cụ thể để dễ kiểm tra.",
      side: "top" as const,
      align: "start" as const,
    },
  },
  {
    element: '[data-tour="penalties-highest-tier"]',
    popover: {
      title: "Chỉ áp dụng mức cao nhất",
      description: "Hệ thống không cộng dồn tiền phạt. Khi trễ hơn, chỉ khung cao nhất đã đạt được được áp dụng.",
      side: "bottom" as const,
      align: "start" as const,
    },
  },
];

function createTour(onDestroyed: () => void) {
  const availableSteps = steps.filter((step) => document.querySelector(step.element));
  if (availableSteps.length === 0) return null;

  return driver({
    animate: true,
    allowClose: true,
    overlayColor: "rgba(16, 42, 44, 0.58)",
    showProgress: true,
    nextBtnText: "Tiếp",
    prevBtnText: "Quay lại",
    doneBtnText: "Hoàn tất",
    progressText: "{{current}} / {{total}}",
    steps: availableSteps,
    onDestroyed,
  });
}

export function PenaltiesTour() {
  const driverRef = useRef<Driver | null>(null);

  const startTour = () => {
    driverRef.current?.destroy();
    driverRef.current = createTour(() => {
      window.localStorage.setItem(TOUR_KEY, "completed");
    });
    driverRef.current?.drive();
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!window.localStorage.getItem(TOUR_KEY)) {
        startTour();
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
      driverRef.current?.destroy();
    };
  }, []);

  return <HelpButton onClick={startTour} />;
}
