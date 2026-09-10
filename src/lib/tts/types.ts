/**
 * B03 — TTS shared model config theo docs/realtime-tts-contract.md §5.1.
 * Không chứa logic Speech API; chỉ types + normalize + map DB row.
 */

export type TtsPersonality = "friendly" | "teasing" | "spicy" | "extra_spicy" | "relentless";

export type TtsAnnouncementType = "on_time" | "late" | "payment" | "achievement" | "fund_balance";

export type TtsConfig = {
  personality: TtsPersonality;
  enabledEvents: TtsAnnouncementType[];
  cooldownSeconds: number; // >= 0, default 5
  quietEnabled: boolean;
  quietStart: string; // "HH:mm"
  quietEnd: string; // "HH:mm", có thể <= start (qua đêm)
  locale: string; // "vi-VN"
  preferredVoice: string; // voice name hoặc ""
  speechRate: number; // 0.5–2, default 1
  speechPitch: number; // 0–2, default 1
};

export type TtsAnnouncement = {
  eventId: string; // event_id từ Broadcast
  announcementType: TtsAnnouncementType;
  displayName: string | null;
  lateMinutes?: number;
  fineAmountVnd?: number;
  fineCode?: string;
  fundBalance?: number;
};

export type TtsEngine = {
  /** Cập nhật config — event tiếp theo dùng config mới. */
  updateConfig(config: TtsConfig, timezone: string): void;
  /** Enqueue một announcement — trả về ID để cancel nếu cần, null khi bị bỏ qua. */
  enqueue(announcement: TtsAnnouncement): string | null;
  /** Dừng đọc hiện tại, xóa queue, không nhận event mới cho đến unmute. */
  mute(): void;
  /** Bật lại sau mute. */
  unmute(): void;
  /** Hủy toàn bộ khi unmount. */
  destroy(): void;
  /** Nút test loa — bypass quiet hours, cooldown, dedup, queue. */
  speakTest(text: string): void;
};

export const TTS_QUEUE_LIMIT = 5;
export const TTS_EVENT_TTL_MS = 60_000;
export const TTS_EVENT_DEDUP_TTL_MS = 5 * 60_000;
export const TTS_PAYMENT_DEDUP_TTL_MS = 60_000;
export const DEFAULT_TTS_COOLDOWN_SECONDS = 5;

export const DEFAULT_TTS_CONFIG: TtsConfig = {
  personality: "friendly",
  enabledEvents: ["late", "payment"],
  cooldownSeconds: DEFAULT_TTS_COOLDOWN_SECONDS,
  quietEnabled: false,
  quietStart: "00:00",
  quietEnd: "00:00",
  locale: "vi-VN",
  preferredVoice: "",
  speechRate: 1,
  speechPitch: 1,
};

const PERSONALITIES: readonly string[] = [
  "friendly",
  "teasing",
  "spicy",
  "extra_spicy",
  "relentless",
];

const ANNOUNCEMENT_TYPES: readonly string[] = [
  "on_time",
  "late",
  "payment",
  "achievement",
  "fund_balance",
];

export function clampSpeechRate(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(2, Math.max(0.5, value));
}

export function clampSpeechPitch(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(2, Math.max(0, value));
}

function normalizeHhMm(value: unknown, fallback: string): string {
  if (typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim())) {
    return value.trim();
  }
  return fallback;
}

/** Chuẩn hóa config từ mọi nguồn (DB row, form, realtime) — không throw. */
export function normalizeTtsConfig(input: Partial<TtsConfig>): TtsConfig {
  const personality = PERSONALITIES.includes(input.personality ?? "")
    ? (input.personality as TtsPersonality)
    : DEFAULT_TTS_CONFIG.personality;
  const enabledEvents = Array.isArray(input.enabledEvents)
    ? (input.enabledEvents.filter((e) => ANNOUNCEMENT_TYPES.includes(e)) as TtsAnnouncementType[])
    : [...DEFAULT_TTS_CONFIG.enabledEvents];
  const cooldownSeconds =
    typeof input.cooldownSeconds === "number" && Number.isFinite(input.cooldownSeconds)
      ? Math.min(300, Math.max(0, Math.floor(input.cooldownSeconds)))
      : DEFAULT_TTS_CONFIG.cooldownSeconds;
  return {
    personality,
    enabledEvents,
    cooldownSeconds,
    quietEnabled: input.quietEnabled === true,
    quietStart: normalizeHhMm(input.quietStart, DEFAULT_TTS_CONFIG.quietStart),
    quietEnd: normalizeHhMm(input.quietEnd, DEFAULT_TTS_CONFIG.quietEnd),
    locale:
      typeof input.locale === "string" && input.locale.trim().length >= 2
        ? input.locale.trim().slice(0, 20)
        : DEFAULT_TTS_CONFIG.locale,
    preferredVoice: typeof input.preferredVoice === "string" ? input.preferredVoice.trim().slice(0, 100) : "",
    speechRate: clampSpeechRate(input.speechRate ?? 1),
    speechPitch: clampSpeechPitch(input.speechPitch ?? 1),
  };
}

type TtsDbRow = {
  personality?: unknown;
  enabled_events?: unknown;
  cooldown_seconds?: unknown;
  quiet_enabled?: unknown;
  quiet_start?: unknown;
  quiet_end?: unknown;
  locale?: unknown;
  preferred_voice?: unknown;
  speech_rate?: unknown;
  speech_pitch?: unknown;
};

function toShortTime(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.length >= 5) {
    return normalizeHhMm(value.slice(0, 5), fallback);
  }
  return fallback;
}

/** Map một row `tts_settings` (time có thể là "HH:mm:ss") về TtsConfig dùng chung. */
export function ttsConfigFromRow(row: TtsDbRow): TtsConfig {
  return normalizeTtsConfig({
    personality: (typeof row.personality === "string" ? row.personality : undefined) as
      | TtsPersonality
      | undefined,
    enabledEvents: (Array.isArray(row.enabled_events) ? row.enabled_events : undefined) as
      | TtsAnnouncementType[]
      | undefined,
    cooldownSeconds: typeof row.cooldown_seconds === "number" ? row.cooldown_seconds : undefined,
    quietEnabled: row.quiet_enabled === true,
    quietStart: toShortTime(row.quiet_start, DEFAULT_TTS_CONFIG.quietStart),
    quietEnd: toShortTime(row.quiet_end, DEFAULT_TTS_CONFIG.quietEnd),
    locale: typeof row.locale === "string" ? row.locale : undefined,
    preferredVoice: typeof row.preferred_voice === "string" ? row.preferred_voice : "",
    speechRate: row.speech_rate != null ? Number(row.speech_rate) : undefined,
    speechPitch: row.speech_pitch != null ? Number(row.speech_pitch) : undefined,
  });
}
