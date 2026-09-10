import { describe, expect, it } from "vitest";

import { isInQuietHours } from "./quiet-hours";
import { DEFAULT_TTS_CONFIG, normalizeTtsConfig } from "./types";

const TZ = "Asia/Ho_Chi_Minh"; // UTC+7, không DST.

function atUtcForLocal(h: number, m: number): Date {
  // 2026-09-10, giờ local +07 → UTC = local - 7h.
  return new Date(Date.UTC(2026, 8, 10, h - 7, m, 0));
}

function configWith(quietStart: string, quietEnd: string) {
  return normalizeTtsConfig({
    ...DEFAULT_TTS_CONFIG,
    quietEnabled: true,
    quietStart,
    quietEnd,
  });
}

describe("isInQuietHours", () => {
  it("không quiet khi quietEnabled = false", () => {
    const config = normalizeTtsConfig({ ...DEFAULT_TTS_CONFIG, quietEnabled: false });
    expect(isInQuietHours(atUtcForLocal(23, 0), config, TZ)).toBe(false);
  });

  it("quiet trong khung cùng ngày", () => {
    const config = configWith("22:00", "23:00");
    expect(isInQuietHours(atUtcForLocal(22, 0), config, TZ)).toBe(true);
    expect(isInQuietHours(atUtcForLocal(22, 59), config, TZ)).toBe(true);
    expect(isInQuietHours(atUtcForLocal(21, 59), config, TZ)).toBe(false);
    expect(isInQuietHours(atUtcForLocal(23, 0), config, TZ)).toBe(false);
  });

  it("quiet qua nửa đêm", () => {
    const config = configWith("22:00", "06:00");
    expect(isInQuietHours(atUtcForLocal(23, 0), config, TZ)).toBe(true);
    expect(isInQuietHours(atUtcForLocal(2, 0), config, TZ)).toBe(true);
    expect(isInQuietHours(atUtcForLocal(5, 59), config, TZ)).toBe(true);
    expect(isInQuietHours(atUtcForLocal(6, 0), config, TZ)).toBe(false);
    expect(isInQuietHours(atUtcForLocal(12, 0), config, TZ)).toBe(false);
    expect(isInQuietHours(atUtcForLocal(21, 59), config, TZ)).toBe(false);
    expect(isInQuietHours(atUtcForLocal(22, 0), config, TZ)).toBe(true);
  });

  it("start = end nghĩa là quiet 24h", () => {
    const config = configWith("00:00", "00:00");
    expect(isInQuietHours(atUtcForLocal(0, 0), config, TZ)).toBe(true);
    expect(isInQuietHours(atUtcForLocal(12, 0), config, TZ)).toBe(true);
    expect(isInQuietHours(atUtcForLocal(23, 59), config, TZ)).toBe(true);
  });

  it("tôn trọng timezone tổ chức", () => {
    // 16:00 UTC = 23:00 ở +07 (quiet) nhưng = 09:00 ở -07 (không quiet).
    const config = configWith("22:00", "06:00");
    const instant = new Date(Date.UTC(2026, 8, 10, 16, 0, 0));
    expect(isInQuietHours(instant, config, TZ)).toBe(true);
    expect(isInQuietHours(instant, config, "America/Los_Angeles")).toBe(false);
  });
});
