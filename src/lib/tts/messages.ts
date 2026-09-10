/**
 * B03 — Fallback message cố định trong code (contract §11: chưa làm template pool).
 * Văn phong ngắn gọn trung tính theo chốt với user.
 */

import type { TtsAnnouncement } from "./types";

export function buildAnnouncementText(a: TtsAnnouncement): string {
  const name = a.displayName?.trim() ? a.displayName.trim() : "Có thành viên";
  switch (a.announcementType) {
    case "late": {
      if (typeof a.lateMinutes === "number" && Number.isFinite(a.lateMinutes) && a.lateMinutes > 0) {
        return `${name} đi trễ ${Math.round(a.lateMinutes)} phút.`;
      }
      return `${name} đã điểm danh trễ.`;
    }
    case "payment": {
      if (a.fineCode?.trim()) return `Đã nhận thanh toán phạt ${a.fineCode.trim()}.`;
      return "Đã nhận thanh toán phạt.";
    }
    case "on_time":
      return `${name} đã điểm danh.`;
    case "achievement":
      return `${name} vừa đạt thành tích mới.`;
    case "fund_balance":
      return "Quỹ vừa có cập nhật số dư mới.";
    default:
      return `${name} vừa có cập nhật mới.`;
  }
}
