"use client";

import { useEffect, useRef } from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

import { HelpButton } from "@/components/ui";

const TOUR_KEY = "teamhub-tour-manager-roster-v2";

const tourSteps = [
  {
    element: '[data-tour="roster-date-select"]',
    popover: {
      title: "Chọn ngày cần cấu hình",
      description: "Chọn ngày làm việc để xem và điều chỉnh danh sách thành viên cần điểm danh.",
      side: "bottom" as const,
      align: "start" as const,
    },
  },
  {
    element: '[data-tour="roster-sync"]',
    popover: {
      title: "Danh sách tự động cập nhật",
      description: "Hệ thống tự thêm thành viên active khi họ điểm danh. Nút này chỉ dùng để cập nhật thủ công khi cần và không tạo bản ghi trùng.",
      side: "left" as const,
      align: "start" as const,
    },
  },
  {
    element: '[data-tour="roster-required-count"]',
    popover: {
      title: "Ai cần điểm danh",
      description: "Những người trong nhóm này sẽ được tính trạng thái đúng giờ, trễ và tiền phạt.",
      side: "bottom" as const,
      align: "start" as const,
    },
  },
  {
    element: '[data-tour="roster-excluded-members"]',
    popover: {
      title: "Người được miễn",
      description: "Dùng nút Loại cho người nghỉ phép hoặc remote. Họ sẽ không bị tính trễ hay phát sinh phạt trong ngày.",
      side: "top" as const,
      align: "start" as const,
    },
  },
];

function createRosterTour(onComplete?: () => void) {
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

export function RosterTour() {
  const driverRef = useRef<Driver | null>(null);

  const startTour = () => {
    driverRef.current?.destroy();
    driverRef.current = createRosterTour(() => {
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
