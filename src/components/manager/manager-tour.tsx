"use client";

import { useEffect, useRef } from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

import { HelpButton } from "@/components/ui";

const TOUR_KEY = "teamhub-tour-manager-dashboard-v1";

const steps = [
  {
    element: '[data-tour="manager-settings"]',
    popover: {
      title: "Luật văn phòng",
      description: "Cấu hình ca làm, giờ bắt đầu tính trễ, vị trí văn phòng, ngân hàng và giọng MC.",
      side: "bottom" as const,
      align: "start" as const,
    },
  },
  {
    element: '[data-tour="manager-members"]',
    popover: {
      title: "Quản lý thành viên",
      description: "Duyệt tài khoản mới và kiểm soát ai được truy cập dữ liệu nhóm, điểm danh.",
      side: "bottom" as const,
      align: "start" as const,
    },
  },
  {
    element: '[data-tour="manager-penalties"]',
    popover: {
      title: "Khung phạt",
      description: "Thiết lập các mốc phút trễ và số tiền tương ứng. Hệ thống chỉ áp dụng khung cao nhất đã vượt qua.",
      side: "top" as const,
      align: "start" as const,
    },
  },
  {
    element: '[data-tour="manager-roster"]',
    popover: {
      title: "Người cần điểm danh",
      description: "Chọn thành viên cần có mặt trong từng ngày, đồng thời loại hoặc khôi phục người được miễn.",
      side: "top" as const,
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

export function ManagerTour() {
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

  return (
    <HelpButton onClick={startTour} />
  );
}
