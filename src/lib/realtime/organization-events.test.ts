import { describe, expect, it, vi } from "vitest";

import {
  createRealtimeEventDeduper,
  dispatchOrganizationRealtimeEvent,
  REALTIME_EVENT_DEDUP_MAX_ENTRIES,
  REALTIME_EVENT_DEDUP_TTL_MS,
  type AttendanceStatusEvent,
  type CheckInStatusEvent,
  type FineAllocationStatusEvent,
  type FineStatusEvent,
  type FundStatusEvent,
  type TtsSettingsStatusEvent,
} from "./organization-events";

describe("createRealtimeEventDeduper", () => {
  it("delivers payloads without event_id for backward compatibility", () => {
    const deduper = createRealtimeEventDeduper();

    expect(deduper.shouldDeliver({ fine_id: "fine-1" })).toBe(true);
    expect(deduper.shouldDeliver({ fine_id: "fine-1" })).toBe(true);
  });

  it("deduplicates repeated event_id values", () => {
    const deduper = createRealtimeEventDeduper();

    expect(deduper.shouldDeliver({ event_id: "event-1" })).toBe(true);
    expect(deduper.shouldDeliver({ event_id: "event-1" })).toBe(false);
  });

  it("allows an event_id again after the ttl", () => {
    let now = 1_000;
    const deduper = createRealtimeEventDeduper(() => now);

    expect(deduper.shouldDeliver({ event_id: "event-1" })).toBe(true);
    now += REALTIME_EVENT_DEDUP_TTL_MS + 1;

    expect(deduper.shouldDeliver({ event_id: "event-1" })).toBe(true);
  });

  it("bounds the dedup cache", () => {
    const deduper = createRealtimeEventDeduper();

    for (let index = 0; index < REALTIME_EVENT_DEDUP_MAX_ENTRIES + 20; index += 1) {
      expect(deduper.shouldDeliver({ event_id: `event-${index}` })).toBe(true);
    }

    expect(deduper.size()).toBeLessThanOrEqual(REALTIME_EVENT_DEDUP_MAX_ENTRIES);
  });
});

describe("dispatchOrganizationRealtimeEvent", () => {
  it("routes check-in events", () => {
    const onCheckIn = vi.fn();
    const payload: CheckInStatusEvent = {
      event_id: "event-1",
      attempt_id: 1,
      user_id: "user-1",
      display_name: "Thanh",
      method: "qr",
      succeeded: true,
      rejection_reason: null,
      server_received_at: "2026-09-10T01:00:00Z",
    };

    expect(dispatchOrganizationRealtimeEvent("check-in-status", payload, { onCheckIn }, createRealtimeEventDeduper())).toBe(true);
    expect(onCheckIn).toHaveBeenCalledWith(payload);
  });

  it("routes attendance events", () => {
    const onAttendance = vi.fn();
    const payload: AttendanceStatusEvent = {
      event_id: "event-1",
      entity_id: "attendance-1",
      user_id: "user-1",
      work_date: "2026-09-10",
      attendance_state: "late",
      late_minutes: 5,
      checked_in_at: "2026-09-10T01:00:00Z",
    };

    dispatchOrganizationRealtimeEvent("attendance-status", payload, { onAttendance }, createRealtimeEventDeduper());
    expect(onAttendance).toHaveBeenCalledWith(payload);
  });

  it("routes fine events", () => {
    const onFine = vi.fn();
    const payload: FineStatusEvent = {
      event_id: "event-1",
      fine_id: "fine-1",
      user_id: "user-1",
      status: "paid",
      amount_vnd: 10000,
      updated_at: "2026-09-10T01:00:00Z",
    };

    dispatchOrganizationRealtimeEvent("fine-status", payload, { onFine }, createRealtimeEventDeduper());
    expect(onFine).toHaveBeenCalledWith(payload);
  });

  it("routes fine allocation events", () => {
    const onFineAllocation = vi.fn();
    const payload: FineAllocationStatusEvent = {
      event_id: "event-1",
      allocation_id: "allocation-1",
      fine_id: "fine-1",
      amount_vnd: 10000,
      fund_transaction_id: "fund-1",
      action: "insert",
    };

    dispatchOrganizationRealtimeEvent("fine-allocation-status", payload, { onFineAllocation }, createRealtimeEventDeduper());
    expect(onFineAllocation).toHaveBeenCalledWith(payload);
  });

  it("routes fund events", () => {
    const onFund = vi.fn();
    const payload: FundStatusEvent = {
      event_id: "event-1",
      transaction_id: "fund-1",
      direction: "incoming",
      amount_vnd: 10000,
      reconciliation_status: "matched",
      updated_at: "2026-09-10T01:00:00Z",
    };

    dispatchOrganizationRealtimeEvent("fund-status", payload, { onFund }, createRealtimeEventDeduper());
    expect(onFund).toHaveBeenCalledWith(payload);
  });

  it("routes tts settings events", () => {
    const onTtsSettings = vi.fn();
    const payload: TtsSettingsStatusEvent = {
      event_id: "event-1",
      entity_id: "org-1",
      updated_at: "2026-09-10T01:00:00Z",
    };

    dispatchOrganizationRealtimeEvent("tts-settings-status", payload, { onTtsSettings }, createRealtimeEventDeduper());
    expect(onTtsSettings).toHaveBeenCalledWith(payload);
  });

  it("does not call handlers for duplicate event_id values", () => {
    const onFine = vi.fn();
    const deduper = createRealtimeEventDeduper();
    const payload: FineStatusEvent = {
      event_id: "event-1",
      fine_id: "fine-1",
      user_id: "user-1",
      status: "paid",
      amount_vnd: 10000,
      updated_at: "2026-09-10T01:00:00Z",
    };

    expect(dispatchOrganizationRealtimeEvent("fine-status", payload, { onFine }, deduper)).toBe(true);
    expect(dispatchOrganizationRealtimeEvent("fine-status", payload, { onFine }, deduper)).toBe(false);
    expect(onFine).toHaveBeenCalledTimes(1);
  });
});
