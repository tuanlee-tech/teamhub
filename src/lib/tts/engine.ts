/**
 * B03 — TTS engine theo docs/realtime-tts-contract.md §5.
 *
 * - Queue tuần tự, không cắt câu trước (trừ mute / speakTest).
 * - Priority: payment > late > on_time > rest. Tối đa 5 messages.
 * - Cooldown giữa các câu, TTL event 60s, dedup event_id 5 phút,
 *   dedup payment theo fineCode + announcementType trong 60s.
 * - Quiet hours + enabled events kiểm tra tại thời điểm PHÁT.
 * - Mute dừng câu đang đọc và xóa queue. speakTest bypass
 *   quiet/cooldown/dedup/queue nhưng dùng voice/rate/pitch hiện tại.
 * - Thiếu Speech API → vô hiệu hóa êm, không throw.
 */

import { buildAnnouncementText } from "./messages";
import { isInQuietHours } from "./quiet-hours";
import {
  DEFAULT_TTS_CONFIG,
  TTS_EVENT_DEDUP_TTL_MS,
  TTS_EVENT_TTL_MS,
  TTS_PAYMENT_DEDUP_TTL_MS,
  TTS_QUEUE_LIMIT,
  normalizeTtsConfig,
  type TtsAnnouncement,
  type TtsAnnouncementType,
  type TtsConfig,
  type TtsEngine,
} from "./types";
import { selectVoice, type VoiceLike } from "./voice";

export type TtsEngineDeps = {
  now?: () => number;
  getSpeechSynthesis?: () => SpeechSynthesis | null;
  createUtterance?: (text: string) => SpeechSynthesisUtterance;
};

type QueueItem = {
  id: string;
  announcement: TtsAnnouncement;
  text: string;
  enqueuedAt: number;
  priority: number;
};

function priorityOf(type: TtsAnnouncementType): number {
  switch (type) {
    case "payment":
      return 0;
    case "late":
      return 1;
    case "on_time":
      return 2;
    default:
      return 3;
  }
}

function defaultGetSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    return window.speechSynthesis;
  }
  return null;
}

function defaultCreateUtterance(text: string): SpeechSynthesisUtterance {
  return new SpeechSynthesisUtterance(text);
}

function newId(counter: number): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // Bỏ qua — dùng counter fallback bên dưới.
  }
  return `tts-${Date.now().toString(36)}-${counter}`;
}

export function createTtsEngine(deps?: TtsEngineDeps): TtsEngine {
  const now = deps?.now ?? Date.now;
  const getSynth = deps?.getSpeechSynthesis ?? defaultGetSpeechSynthesis;
  const createUtterance = deps?.createUtterance ?? defaultCreateUtterance;

  let config: TtsConfig = { ...DEFAULT_TTS_CONFIG };
  let timezone = "Asia/Ho_Chi_Minh";
  let muted = false;
  let destroyed = false;
  let speaking = false;
  let lastSpokenAt = 0;
  let hasSpoken = false;
  let idCounter = 0;
  let cooldownTimer: ReturnType<typeof setTimeout> | null = null;
  const queue: QueueItem[] = [];
  const seenEventIds = new Map<string, number>();
  const paymentKeys = new Map<string, number>();

  function safeSynth(): SpeechSynthesis | null {
    try {
      return getSynth();
    } catch {
      return null;
    }
  }

  function pruneMaps(at: number) {
    for (const [key, expiry] of seenEventIds) {
      if (expiry <= at) seenEventIds.delete(key);
    }
    for (const [key, expiry] of paymentKeys) {
      if (expiry <= at) paymentKeys.delete(key);
    }
  }

  function clearTimer() {
    if (cooldownTimer !== null) {
      clearTimeout(cooldownTimer);
      cooldownTimer = null;
    }
  }

  function sortQueue() {
    queue.sort((a, b) => a.priority - b.priority || a.enqueuedAt - b.enqueuedAt);
  }

  /** Kiểm tra tại thời điểm phát: mute/enabled/quiet. Hết hạn thì drop. */
  function pump() {
    if (destroyed || muted || speaking) return;
    const synth = safeSynth();
    if (!synth) {
      // Speech API không có: bỏ queue êm, không throw, không chặn UI.
      queue.length = 0;
      return;
    }
    const at = now();
    pruneMaps(at);
    sortQueue();
    while (queue.length > 0) {
      const head = queue[0];
      if (!head) return;
      // TTL 60s tính từ lúc enqueue.
      if (at - head.enqueuedAt > TTS_EVENT_TTL_MS) {
        queue.shift();
        continue;
      }
      // Config có thể đổi sau khi enqueue — kiểm tra lại tại thời điểm phát.
      if (!config.enabledEvents.includes(head.announcement.announcementType)) {
        queue.shift();
        continue;
      }
      if (isInQuietHours(new Date(at), config, timezone)) {
        queue.shift();
        continue;
      }
      const cooldownMs = config.cooldownSeconds * 1000;
      if (hasSpoken && cooldownMs > 0 && at - lastSpokenAt < cooldownMs) {
        clearTimer();
        const wait = cooldownMs - (at - lastSpokenAt);
        cooldownTimer = setTimeout(pump, wait);
        return;
      }
      queue.shift();
      speakItem(synth, head);
      return;
    }
  }

  function speakItem(synth: SpeechSynthesis, item: QueueItem) {
    let utterance: SpeechSynthesisUtterance;
    try {
      utterance = createUtterance(item.text);
    } catch {
      speaking = false;
      pump();
      return;
    }
    try {
      const voices = (synth.getVoices() ?? []) as VoiceLike[];
      const voice = selectVoice(voices, {
        preferredVoice: config.preferredVoice,
        locale: config.locale,
      });
      if (voice) {
        utterance.voice = voice as SpeechSynthesisVoice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = config.locale;
      }
      utterance.rate = config.speechRate;
      utterance.pitch = config.speechPitch;
    } catch {
      // Voice/rate/pitch chỉ là presentation — lỗi thì đọc với mặc định.
    }
    speaking = true;
    const finish = () => {
      if (!speaking) return;
      speaking = false;
      hasSpoken = true;
      lastSpokenAt = now();
      pump();
    };
    utterance.onend = finish;
    utterance.onerror = () => {
      // Lỗi loa không lan sang nghiệp vụ — chuyển câu tiếp theo.
      finish();
    };
    try {
      synth.speak(utterance);
    } catch {
      speaking = false;
      hasSpoken = true;
      lastSpokenAt = now();
      pump();
    }
  }

  return {
    updateConfig(next: TtsConfig, nextTimezone: string) {
      if (destroyed) return;
      config = normalizeTtsConfig(next);
      if (typeof nextTimezone === "string" && nextTimezone.trim()) {
        timezone = nextTimezone.trim();
      }
      pruneMaps(now());
    },

    enqueue(announcement: TtsAnnouncement) {
      if (destroyed || muted) return null;
      if (!announcement || !announcement.eventId) return null;
      const synth = safeSynth();
      if (!synth) return null;
      const at = now();
      pruneMaps(at);
      if (seenEventIds.has(announcement.eventId)) return null;
      const fineCode = announcement.fineCode?.trim() ?? "";
      let paymentKey: string | null = null;
      if (announcement.announcementType === "payment" && fineCode) {
        paymentKey = `payment:${fineCode}`;
        if (paymentKeys.has(paymentKey)) return null;
      }
      // Lọc sớm để đỡ chật queue; vẫn kiểm tra lại tại thời điểm phát.
      if (!config.enabledEvents.includes(announcement.announcementType)) return null;
      seenEventIds.set(announcement.eventId, at + TTS_EVENT_DEDUP_TTL_MS);
      if (paymentKey) paymentKeys.set(paymentKey, at + TTS_PAYMENT_DEDUP_TTL_MS);

      const item: QueueItem = {
        id: newId(++idCounter),
        announcement,
        text: buildAnnouncementText(announcement),
        enqueuedAt: at,
        priority: priorityOf(announcement.announcementType),
      };
      if (queue.length >= TTS_QUEUE_LIMIT) {
        // Queue đầy: loại câu ưu tiên thấp nhất (mới nhất trong nhóm thấp nhất).
        let worstIndex = 0;
        for (let i = 1; i < queue.length; i++) {
          const current = queue[i];
          const worst = queue[worstIndex];
          if (!current || !worst) continue;
          if (
            current.priority > worst.priority ||
            (current.priority === worst.priority && current.enqueuedAt > worst.enqueuedAt)
          ) {
            worstIndex = i;
          }
        }
        const worst = queue[worstIndex];
        // Số priority càng nhỏ càng quan trọng: câu mới ngang hoặc kém hơn
        // câu kém nhất hiện có thì bỏ câu mới.
        if (!worst || item.priority >= worst.priority) return null;
        queue.splice(worstIndex, 1);
      }
      queue.push(item);
      pump();
      return item.id;
    },

    mute() {
      muted = true;
      clearTimer();
      queue.length = 0;
      speaking = false;
      try {
        safeSynth()?.cancel();
      } catch {
        // Bỏ qua lỗi cancel.
      }
    },

    unmute() {
      if (destroyed) return;
      muted = false;
      pump();
    },

    destroy() {
      destroyed = true;
      clearTimer();
      queue.length = 0;
      seenEventIds.clear();
      paymentKeys.clear();
      speaking = false;
      try {
        safeSynth()?.cancel();
      } catch {
        // Bỏ qua lỗi cancel.
      }
    },

    speakTest(text: string) {
      if (destroyed) return;
      const synth = safeSynth();
      if (!synth) return;
      const message = text.trim() ? text : "Xin chào, đây là giọng MC.";
      clearTimer();
      try {
        synth.cancel();
      } catch {
        // Bỏ qua lỗi cancel.
      }
      speaking = false;
      let utterance: SpeechSynthesisUtterance;
      try {
        utterance = createUtterance(message);
      } catch {
        return;
      }
      try {
        const voices = (synth.getVoices() ?? []) as VoiceLike[];
        const voice = selectVoice(voices, {
          preferredVoice: config.preferredVoice,
          locale: config.locale,
        });
        if (voice) {
          utterance.voice = voice as SpeechSynthesisVoice;
          utterance.lang = voice.lang;
        } else {
          utterance.lang = config.locale;
        }
        utterance.rate = config.speechRate;
        utterance.pitch = config.speechPitch;
      } catch {
        // Đọc với mặc định khi voice lỗi.
      }
      const finish = () => {
        speaking = false;
        pump();
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      speaking = true;
      try {
        synth.speak(utterance);
      } catch {
        speaking = false;
      }
    },
  };
}
