/**
 * B03 — Quiet hours check tại thời điểm PHÁT (không phải lúc enqueue).
 * Theo contract §10: start=end là 24h quiet; hỗ trợ qua nửa đêm.
 */

import type { TtsConfig } from "./types";

function parseHhMm(value: string): { h: number; m: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return { h: Number(match[1]), m: Number(match[2]) };
}

function minutesInTimezone(date: Date, timezone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).formatToParts(date);
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    const m = Number(parts.find((p) => p.type === "minute")?.value);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    // Một số ICU trả "24" cho nửa đêm — chuẩn hóa về 0.
    return ((h % 24) * 60 + m) % (24 * 60);
  } catch {
    return null;
  }
}

export function isInQuietHours(now: Date, config: TtsConfig, timezone: string): boolean {
  if (!config.quietEnabled) return false;
  const start = parseHhMm(config.quietStart);
  const end = parseHhMm(config.quietEnd);
  // Config đã normalize nên hiếm khi invalid; invalid thì không chặn đọc.
  if (!start || !end) return false;
  const startMin = start.h * 60 + start.m;
  const endMin = end.h * 60 + end.m;
  // start = end nghĩa là quiet 24h.
  if (startMin === endMin) return true;
  const nowMin = minutesInTimezone(now, timezone);
  if (nowMin === null) return false;
  if (startMin < endMin) return nowMin >= startMin && nowMin < endMin;
  // Qua nửa đêm: [start, 24h) ∪ [0, end).
  return nowMin >= startMin || nowMin < endMin;
}
