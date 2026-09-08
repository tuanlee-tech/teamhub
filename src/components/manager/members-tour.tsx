"use client";

import { useEffect, useRef } from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

import { HelpButton } from "@/components/ui";

const TOUR_KEY = "teamhub-tour-manager-members-v1";

const tourSteps = [
  {
    element: '[data-tour="members-summary"]',
    popover: {
      title: "Tổng quan thành viên",
      description: "Theo dõi nhanh số tài khoản đang chờ duyệt, đang hoạt động và đã từ chối.",
      side: "bottom" as const,
      align: "start" as const,
    },
  },
  {
    element: '[data-tour="members-list"]',
    popover: {
      title: "Danh sách trong tổ chức",
      description: "Mỗi dòng hiển thị tên, username, vai trò và trạng thái của một tài khoản.",
      side: "top" as const,
      align: "start" as const,
    },
  },
  {
    element: '[data-tour="members-status"]',
    popover: {
      title: "Trạng thái tài khoản",
      description: "Tài khoản mới sẽ ở trạng thái Chờ duyệt cho đến khi manager xác nhận.",
      side: "right" as const,
      align: "start" as const,
    },
  },
  {
    element: '[data-tour="members-actions"]',
    popover: {
      title: "Duyệt hoặc từ chối",
      description: "Duyệt để cho phép tài khoản truy cập nhóm. Từ chối để ngăn tài khoản sử dụng dữ liệu và điểm danh.",
      side: "left" as const,
      align: "start" as const,
    },
  },
];

function createMembersTour(onComplete?: () => void) {
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

export function MembersTour() {
  const driverRef = useRef<Driver | null>(null);

  const startTour = () => {
    driverRef.current?.destroy();
    driverRef.current = createMembersTour(() => {
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
