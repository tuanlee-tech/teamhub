/**
 * B03 — Public API của TTS engine cho B07 (kiosk) và Settings.
 */
export {
  DEFAULT_TTS_CONFIG,
  DEFAULT_TTS_COOLDOWN_SECONDS,
  TTS_EVENT_DEDUP_TTL_MS,
  TTS_EVENT_TTL_MS,
  TTS_PAYMENT_DEDUP_TTL_MS,
  TTS_QUEUE_LIMIT,
  clampSpeechPitch,
  clampSpeechRate,
  normalizeTtsConfig,
  ttsConfigFromRow,
  type TtsAnnouncement,
  type TtsAnnouncementType,
  type TtsConfig,
  type TtsEngine,
  type TtsPersonality,
} from "./types";
export { createTtsEngine, type TtsEngineDeps } from "./engine";
export { isInQuietHours } from "./quiet-hours";
export { selectVoice, type VoiceLike } from "./voice";
export { buildAnnouncementText } from "./messages";
