import { describe, expect, it } from "vitest";

import { clampSpeechPitch, clampSpeechRate, normalizeTtsConfig, ttsConfigFromRow } from "./types";

describe("normalizeTtsConfig", () => {
  it("clamp rate/pitch về biên", () => {
    expect(clampSpeechRate(5)).toBe(2);
    expect(clampSpeechRate(0.1)).toBe(0.5);
    expect(clampSpeechRate(Number.NaN)).toBe(1);
    expect(clampSpeechPitch(-1)).toBe(0);
    expect(clampSpeechPitch(9)).toBe(2);
  });

  it("chuẩn hóa cooldown và enum lạ", () => {
    const config = normalizeTtsConfig({
      cooldownSeconds: -3,
      personality: "unknown",
      enabledEvents: ["late", "unknown-event"],
    } as never);
    expect(config.cooldownSeconds).toBe(0);
    expect(config.personality).toBe("friendly");
    expect(config.enabledEvents).toEqual(["late"]);
  });
});

describe("ttsConfigFromRow", () => {
  it("map row DB (time dạng HH:mm:ss) về config", () => {
    const config = ttsConfigFromRow({
      personality: "spicy",
      enabled_events: ["late", "payment", "on_time"],
      cooldown_seconds: 10,
      quiet_enabled: true,
      quiet_start: "22:00:00",
      quiet_end: "06:00:00",
      locale: "vi-VN",
      preferred_voice: "Linh",
      speech_rate: "1.2",
      speech_pitch: "0.9",
    });
    expect(config).toMatchObject({
      personality: "spicy",
      enabledEvents: ["late", "payment", "on_time"],
      cooldownSeconds: 10,
      quietEnabled: true,
      quietStart: "22:00",
      quietEnd: "06:00",
      locale: "vi-VN",
      preferredVoice: "Linh",
      speechRate: 1.2,
      speechPitch: 0.9,
    });
  });

  it("chịu được row thiếu field", () => {
    const config = ttsConfigFromRow({});
    expect(config.quietEnabled).toBe(false);
    expect(config.locale).toBe("vi-VN");
    expect(config.preferredVoice).toBe("");
  });
});
