import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/kiosk",
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: vi.fn(), from: vi.fn() }),
}));

vi.mock("@/lib/realtime/organization-events", () => ({
  useOrganizationRealtime: vi.fn(),
}));

vi.mock("@/app/(auth)/actions", () => ({
  signOut: vi.fn(),
}));

import {
  createKioskDeduper,
  kioskCheckInDedupKey,
  kioskFinePaidDedupKey,
  mapCheckInToAnnouncement,
  mapFineToPaymentAnnouncement,
  shouldReloadKioskLateForEvent,
  shouldSpeakCheckInForKioskTab,
  shouldSpeakPaymentForKioskTab,
} from "./kiosk-screen";

describe("mapCheckInToAnnouncement", () => {
  it("maps late success to late with minutes", () => {
    const ann = mapCheckInToAnnouncement({
      event_id: "evt-1",
      attempt_id: 7,
      display_name: "Thanh",
      attendance_state: "late",
      late_minutes: 12.4,
      server_received_at: "2026-09-10T01:00:00Z",
      succeeded: true,
    });
    expect(ann).toMatchObject({ eventId: "evt-1", announcementType: "late", lateMinutes: 12 });
  });

  it("maps on_time success and falls back when attendance_state is missing", () => {
    const ann = mapCheckInToAnnouncement({
      attempt_id: 8,
      display_name: "Vi",
      attendance_state: null,
      succeeded: true,
    });
    expect(ann?.announcementType).toBe("on_time");
    expect(ann?.eventId).toMatch(/^checkin-8-/);
  });

  it("never announces failed check-ins", () => {
    expect(
      mapCheckInToAnnouncement({ attempt_id: 9, succeeded: false, attendance_state: null }),
    ).toBeNull();
  });
});

describe("mapFineToPaymentAnnouncement", () => {
  it("announces payment once when fine turns paid", () => {
    const ann = mapFineToPaymentAnnouncement({
      event_id: "evt-pay-1",
      fine_id: "fine-1",
      fine_code: "P-001",
      status: "paid",
    });
    expect(ann).toMatchObject({ eventId: "evt-pay-1", announcementType: "payment", fineCode: "P-001" });
  });

  it("does not read waived as payment", () => {
    expect(
      mapFineToPaymentAnnouncement({ fine_id: "fine-1", status: "waived" }),
    ).toBeNull();
    expect(
      mapFineToPaymentAnnouncement({ fine_id: "fine-1", status: "unpaid" }),
    ).toBeNull();
  });

  it("falls back to a fine-scoped event id when event_id is missing", () => {
    expect(
      mapFineToPaymentAnnouncement({ fine_id: "fine-9", status: "paid" })?.eventId,
    ).toBe("fine-fine-9-paid");
  });
});

describe("kiosk dedup keys + tracker", () => {
  it("prefers event_id and falls back to attempt/fine keys", () => {
    expect(kioskCheckInDedupKey({ event_id: "evt-1", attempt_id: 5 })).toBe("evt-1");
    expect(kioskCheckInDedupKey({ attempt_id: 5 })).toBe("checkin-5");
    expect(kioskFinePaidDedupKey({ event_id: "evt-2", fine_id: "f1" })).toBe("evt-2");
    expect(kioskFinePaidDedupKey({ fine_id: "f1" })).toBe("fine-f1-paid");
  });

  it("marks the first delivery and drops the duplicate", () => {
    const t = 1_000;
    const deduper = createKioskDeduper({ now: () => t });
    expect(deduper.mark("evt-1")).toBe(false);
    expect(deduper.mark("evt-1")).toBe(true);
    expect(deduper.mark("attempt:42")).toBe(false);
    expect(deduper.mark("attempt:42")).toBe(true);
  });

  it("expires entries after TTL so later genuine events still pass", () => {
    let t = 0;
    const deduper = createKioskDeduper({ ttlMs: 1_000, now: () => t });
    expect(deduper.mark("evt-1")).toBe(false);
    t += 1_001;
    expect(deduper.mark("evt-1")).toBe(false);
  });
});

describe("kiosk TTS tab split", () => {
  it("speaks check-in only on checkin tab", () => {
    expect(shouldSpeakCheckInForKioskTab("checkin")).toBe(true);
    expect(shouldSpeakCheckInForKioskTab("late")).toBe(false);
  });

  it("speaks payment only on late tab", () => {
    expect(shouldSpeakPaymentForKioskTab("late")).toBe(true);
    expect(shouldSpeakPaymentForKioskTab("checkin")).toBe(false);
  });
});

describe("shouldReloadKioskLateForEvent", () => {
  const workDate = "2026-09-10";

  it("reloads check-in/attendance for the viewed date, null scope reloads", () => {
    expect(
      shouldReloadKioskLateForEvent({ kind: "check-in-status", work_date: workDate }, workDate, []),
    ).toBe(true);
    expect(
      shouldReloadKioskLateForEvent({ kind: "check-in-status", work_date: "2026-09-09" }, workDate, []),
    ).toBe(false);
    expect(
      shouldReloadKioskLateForEvent({ kind: "check-in-status", work_date: null }, workDate, []),
    ).toBe(true);
    expect(
      shouldReloadKioskLateForEvent({ kind: "attendance-status", work_date: "2026-09-09" }, workDate, []),
    ).toBe(false);
  });

  it("reloads fine events for current date or known fine moving scope", () => {
    expect(
      shouldReloadKioskLateForEvent(
        { kind: "fine-status", work_date: workDate, fine_id: "fine-1" },
        workDate,
        [],
      ),
    ).toBe(true);
    expect(
      shouldReloadKioskLateForEvent(
        { kind: "fine-status", work_date: "2026-09-09", fine_id: "fine-x" },
        workDate,
        ["fine-1"],
      ),
    ).toBe(false);
    expect(
      shouldReloadKioskLateForEvent(
        { kind: "fine-status", work_date: "2026-09-09", fine_id: "fine-1" },
        workDate,
        ["fine-1"],
      ),
    ).toBe(true);
  });

  it("invalidates both old and new allocation scopes", () => {
    expect(
      shouldReloadKioskLateForEvent(
        { kind: "fine-allocation-status", work_date: workDate, old_work_date: null, fine_id: "f1" },
        workDate,
        [],
      ),
    ).toBe(true);
    expect(
      shouldReloadKioskLateForEvent(
        {
          kind: "fine-allocation-status",
          work_date: "2026-09-09",
          old_work_date: workDate,
          fine_id: "f2",
          old_fine_id: "f1",
        },
        workDate,
        [],
      ),
    ).toBe(true);
    expect(
      shouldReloadKioskLateForEvent(
        {
          kind: "fine-allocation-status",
          work_date: "2026-09-09",
          old_work_date: "2026-09-09",
          fine_id: "fx",
          old_fine_id: "fy",
        },
        workDate,
        ["f1"],
      ),
    ).toBe(false);
  });

  it("reloads fund events only when a related fine is on screen", () => {
    expect(
      shouldReloadKioskLateForEvent({ kind: "fund-status", related_fine_ids: ["f1"] }, workDate, ["f1"]),
    ).toBe(true);
    expect(
      shouldReloadKioskLateForEvent({ kind: "fund-status", related_fine_ids: ["fx"] }, workDate, ["f1"]),
    ).toBe(false);
    expect(
      shouldReloadKioskLateForEvent({ kind: "fund-status", related_fine_ids: [] }, workDate, ["f1"]),
    ).toBe(false);
  });
});
