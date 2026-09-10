import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTtsEngine } from "./engine";
import { normalizeTtsConfig, type TtsAnnouncement, type TtsConfig } from "./types";

const TZ = "Asia/Ho_Chi_Minh";

type MockUtterance = {
  text: string;
  voice?: unknown;
  lang?: string;
  rate?: number;
  pitch?: number;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type MockSynth = {
  spoken: MockUtterance[];
  cancelled: number;
  voices: { name: string; lang: string }[];
  speak: (u: MockUtterance) => void;
  cancel: () => void;
  getVoices: () => { name: string; lang: string }[];
};

function makeSynth(voices = [{ name: "Linh", lang: "vi-VN" }]): MockSynth {
  const synth: MockSynth = {
    spoken: [],
    cancelled: 0,
    voices,
    speak(u) {
      synth.spoken.push(u);
    },
    cancel() {
      synth.cancelled += 1;
    },
    getVoices() {
      return synth.voices;
    },
  };
  return synth;
}

function setup(overrides?: Partial<TtsConfig>) {
  let t = 1_000_000;
  const synth = makeSynth();
  const engine = createTtsEngine({
    now: () => t,
    getSpeechSynthesis: () => synth as unknown as SpeechSynthesis,
    createUtterance: (text) =>
      ({ text, onend: null, onerror: null }) as unknown as SpeechSynthesisUtterance,
  });
  engine.updateConfig(
    normalizeTtsConfig({ cooldownSeconds: 0, enabledEvents: ["on_time", "late", "payment"], ...overrides }),
    TZ,
  );
  return {
    engine,
    synth,
    spoken: () => synth.spoken as MockUtterance[],
    setTime: (next: number) => {
      t = next;
    },
    advance: (ms: number) => {
      t += ms;
    },
    finishCurrent: () => {
      synth.spoken.at(-1)?.onend?.();
    },
  };
}

function ann(overrides?: Partial<TtsAnnouncement>): TtsAnnouncement {
  return {
    eventId: `event-${Math.random().toString(36).slice(2)}`,
    announcementType: "on_time",
    displayName: "An",
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createTtsEngine", () => {
  it("phát ngay với voice/rate/pitch từ config", () => {
    const { engine, spoken } = setup({ speechRate: 1.5, speechPitch: 0.8, preferredVoice: "Linh" });
    const id = engine.enqueue(ann());
    expect(id).not.toBeNull();
    expect(spoken()).toHaveLength(1);
    expect(spoken()[0]?.text).toBe("An đã điểm danh.");
    expect((spoken()[0]?.voice as { name: string }).name).toBe("Linh");
    expect(spoken()[0]?.rate).toBe(1.5);
    expect(spoken()[0]?.pitch).toBe(0.8);
  });

  it("xếp hàng tuần tự, không cắt câu trước", () => {
    const { engine, spoken, finishCurrent } = setup();
    engine.enqueue(ann({ eventId: "e1" }));
    engine.enqueue(ann({ eventId: "e2" }));
    expect(spoken()).toHaveLength(1);
    finishCurrent();
    expect(spoken()).toHaveLength(2);
  });

  it("ưu tiên payment > late > on_time", () => {
    const { engine, spoken, finishCurrent } = setup();
    engine.enqueue(ann({ eventId: "e1", announcementType: "on_time" }));
    engine.enqueue(ann({ eventId: "e2", announcementType: "on_time" }));
    engine.enqueue(ann({ eventId: "e3", announcementType: "payment", fineCode: "F1" }));
    engine.enqueue(ann({ eventId: "e4", announcementType: "late", lateMinutes: 3 }));
    finishCurrent(); // e1 xong → payment trước.
    expect(spoken().at(-1)?.text).toContain("thanh toán");
    finishCurrent(); // → late.
    expect(spoken().at(-1)?.text).toContain("trễ");
  });

  it("cooldown 0 phát ngay, cooldown lớn phải chờ", () => {
    const ctx = setup({ cooldownSeconds: 10 });
    ctx.engine.enqueue(ann({ eventId: "e1" }));
    ctx.finishCurrent();
    ctx.engine.enqueue(ann({ eventId: "e2" }));
    expect(ctx.spoken()).toHaveLength(1);
    ctx.advance(10_000);
    vi.advanceTimersByTime(10_000);
    expect(ctx.spoken()).toHaveLength(2);
  });

  it("bỏ event quá TTL 60s", () => {
    const ctx = setup({ cooldownSeconds: 5 });
    ctx.engine.enqueue(ann({ eventId: "e1" }));
    ctx.finishCurrent();
    ctx.engine.enqueue(ann({ eventId: "e2" })); // chờ cooldown.
    expect(ctx.spoken()).toHaveLength(1);
    ctx.advance(61_000);
    vi.advanceTimersByTime(61_000);
    expect(ctx.spoken()).toHaveLength(1); // e2 hết hạn, không đọc.
    ctx.engine.enqueue(ann({ eventId: "e3" }));
    ctx.finishCurrent();
    expect(ctx.spoken()).toHaveLength(2);
  });

  it("dedup event_id trong 5 phút", () => {
    const ctx = setup();
    const same = ann({ eventId: "dup" });
    expect(ctx.engine.enqueue(same)).not.toBeNull();
    expect(ctx.engine.enqueue({ ...same })).toBeNull();
    ctx.finishCurrent();
    expect(ctx.spoken()).toHaveLength(1);
    ctx.advance(5 * 60_000 + 1);
    expect(ctx.engine.enqueue({ ...same })).not.toBeNull();
  });

  it("dedup payment theo fineCode trong 60s", () => {
    const ctx = setup();
    const pay = (eventId: string) =>
      ann({ eventId, announcementType: "payment", fineCode: "F1" });
    expect(ctx.engine.enqueue(pay("p1"))).not.toBeNull();
    expect(ctx.engine.enqueue(pay("p2"))).toBeNull();
    ctx.advance(60_001);
    ctx.finishCurrent();
    expect(ctx.engine.enqueue(pay("p3"))).not.toBeNull();
  });

  it("payment thiếu fineCode không dedup nhầm", () => {
    const ctx = setup();
    expect(ctx.engine.enqueue(ann({ eventId: "p1", announcementType: "payment" }))).not.toBeNull();
    expect(ctx.engine.enqueue(ann({ eventId: "p2", announcementType: "payment" }))).not.toBeNull();
  });

  it("không phát trong quiet hours, speakTest vẫn phát", () => {
    const ctx = setup({ quietEnabled: true, quietStart: "22:00", quietEnd: "06:00" });
    // 23:00 +07 = 16:00Z.
    ctx.setTime(Date.UTC(2026, 8, 10, 16, 0, 0));
    ctx.engine.enqueue(ann({ eventId: "q1" }));
    expect(ctx.spoken()).toHaveLength(0);
    ctx.engine.speakTest("Xin chào, đây là giọng MC.");
    expect(ctx.spoken()).toHaveLength(1);
  });

  it("start = end là quiet 24h", () => {
    const ctx = setup({ quietEnabled: true, quietStart: "00:00", quietEnd: "00:00" });
    ctx.setTime(Date.UTC(2026, 8, 10, 5, 0, 0));
    ctx.engine.enqueue(ann({ eventId: "q1" }));
    expect(ctx.spoken()).toHaveLength(0);
  });

  it("mute dừng câu đang đọc, xóa queue và chặn event mới", () => {
    const ctx = setup();
    ctx.engine.enqueue(ann({ eventId: "e1" }));
    ctx.engine.enqueue(ann({ eventId: "e2" }));
    ctx.engine.mute();
    expect(ctx.synth.cancelled).toBe(1);
    expect(ctx.engine.enqueue(ann({ eventId: "e3" }))).toBeNull();
    ctx.engine.unmute();
    expect(ctx.spoken()).toHaveLength(1);
    expect(ctx.engine.enqueue(ann({ eventId: "e4" }))).not.toBeNull();
    // e2 đã bị xóa khi mute nên câu mới nhất là e4.
    expect(ctx.spoken()).toHaveLength(2);
    expect(ctx.spoken().at(-1)?.text).toBe("An đã điểm danh.");
    ctx.finishCurrent();
    expect(ctx.spoken()).toHaveLength(2);
  });

  it("speakTest bypass quiet/cooldown/dedup/queue", () => {
    const ctx = setup({ quietEnabled: true, quietStart: "00:00", quietEnd: "00:00", cooldownSeconds: 60 });
    ctx.engine.enqueue(ann({ eventId: "e1" })); // bị quiet drop.
    ctx.engine.speakTest("Test loa");
    expect(ctx.spoken()).toHaveLength(1);
    expect(ctx.spoken()[0]?.text).toBe("Test loa");
  });

  it("bỏ qua event không thuộc enabledEvents, kiểm tra lại khi phát", () => {
    const ctx = setup({ enabledEvents: ["payment"] });
    expect(ctx.engine.enqueue(ann({ eventId: "e1", announcementType: "on_time" }))).toBeNull();
    const id = ctx.engine.enqueue(
      ann({ eventId: "p1", announcementType: "payment", fineCode: "F9" }),
    );
    expect(id).not.toBeNull();
    // Config đổi trước khi câu phát xong → câu payment bị drop.
    ctx.engine.updateConfig(normalizeTtsConfig({ enabledEvents: [] }), TZ);
    ctx.finishCurrent();
    expect(ctx.spoken()).toHaveLength(1); // chỉ câu p1 đã phát, không thêm câu mới.
  });

  it("giới hạn queue 5, câu ưu tiên thấp bị drop khi đầy", () => {
    const ctx = setup({ cooldownSeconds: 300 });
    ctx.engine.enqueue(ann({ eventId: "e0" })); // đang phát.
    for (let i = 1; i <= 5; i++) {
      expect(ctx.engine.enqueue(ann({ eventId: `e${i}` }))).not.toBeNull();
    }
    expect(ctx.engine.enqueue(ann({ eventId: "overflow" }))).toBeNull();
    // Payment ưu tiên hơn → chiếm chỗ câu on_time.
    expect(
      ctx.engine.enqueue(ann({ eventId: "vip", announcementType: "payment", fineCode: "VIP" })),
    ).not.toBeNull();
  });

  it("clamp rate/pitch biên", () => {
    const ctx = setup({ speechRate: 9, speechPitch: -5 });
    ctx.engine.enqueue(ann());
    expect(ctx.spoken()[0]?.rate).toBe(2);
    expect(ctx.spoken()[0]?.pitch).toBe(0);
  });

  it("thiếu Speech API thì vô hiệu hóa êm, không throw", () => {
    const engine = createTtsEngine({
      now: () => 0,
      getSpeechSynthesis: () => null,
      createUtterance: (text) => ({ text }) as unknown as SpeechSynthesisUtterance,
    });
    engine.updateConfig(normalizeTtsConfig({}), TZ);
    expect(engine.enqueue(ann())).toBeNull();
    expect(() => engine.speakTest("alo")).not.toThrow();
    expect(() => engine.mute()).not.toThrow();
    expect(() => engine.destroy()).not.toThrow();
  });

  it("destroy hủy timer và chặn enqueue", () => {
    const ctx = setup({ cooldownSeconds: 30 });
    ctx.engine.enqueue(ann({ eventId: "e1" }));
    ctx.finishCurrent();
    ctx.engine.enqueue(ann({ eventId: "e2" })); // chờ cooldown.
    ctx.engine.destroy();
    ctx.advance(60_000);
    vi.advanceTimersByTime(60_000);
    expect(ctx.spoken()).toHaveLength(1);
    expect(ctx.engine.enqueue(ann({ eventId: "e3" }))).toBeNull();
  });
});
