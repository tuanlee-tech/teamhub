"use client";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";

export type RealtimeEventType =
  | "check-in-status"
  | "attendance-status"
  | "fine-status"
  | "fine-allocation-status"
  | "fund-status"
  | "tts-settings-status";

export type OrganizationRealtimeEvent = {
  event_id?: string;
  organization_id?: string;
  event_type?: RealtimeEventType;
  entity_id?: string;
  user_id?: string | null;
  work_date?: string | null;
  occurred_at?: string;
};

export type CheckInStatusEvent = OrganizationRealtimeEvent & {
  event_type?: "check-in-status";
  attempt_id: number;
  user_id: string;
  display_name: string | null;
  method: "gps" | "qr" | "otp";
  succeeded: boolean;
  rejection_reason: string | null;
  server_received_at: string;
  attendance_state?: "on_time" | "late" | null;
  late_minutes?: number | null;
  fine_id?: string | null;
  fine_code?: string | null;
};

export type AttendanceStatusEvent = OrganizationRealtimeEvent & {
  event_type?: "attendance-status";
  entity_id: string;
  user_id: string;
  work_date: string;
  attendance_state: "pending" | "on_time" | "late" | "excused";
  late_minutes: number | null;
  checked_in_at: string | null;
};

export type FineStatusEvent = OrganizationRealtimeEvent & {
  event_type?: "fine-status";
  fine_id: string;
  user_id: string;
  work_date?: string | null;
  fine_code?: string | null;
  status: "unpaid" | "paid" | "waived";
  amount_vnd: number;
  updated_at: string;
};

export type FineAllocationStatusEvent = OrganizationRealtimeEvent & {
  event_type?: "fine-allocation-status";
  allocation_id: string;
  fine_id: string;
  fine_code?: string | null;
  old_fine_id?: string | null;
  old_user_id?: string | null;
  old_work_date?: string | null;
  amount_vnd: number;
  fund_transaction_id: string;
  action: "insert" | "update" | "delete";
};

export type FundStatusEvent = OrganizationRealtimeEvent & {
  event_type?: "fund-status";
  transaction_id: string;
  direction: "incoming" | "outgoing";
  amount_vnd: number;
  reconciliation_status: string;
  updated_at: string;
  voided_at?: string | null;
  related_fine_ids?: string[];
};

export type TtsSettingsStatusEvent = OrganizationRealtimeEvent & {
  event_type?: "tts-settings-status";
  entity_id: string;
  user_id?: null;
  work_date?: null;
  updated_at: string;
};

export type CheckInRealtimeEvent = CheckInStatusEvent;
export type FineRealtimeEvent = FineStatusEvent;
export type FundRealtimeEvent = FundStatusEvent;

type RealtimeEventMap = {
  "check-in-status": CheckInStatusEvent;
  "attendance-status": AttendanceStatusEvent;
  "fine-status": FineStatusEvent;
  "fine-allocation-status": FineAllocationStatusEvent;
  "fund-status": FundStatusEvent;
  "tts-settings-status": TtsSettingsStatusEvent;
};

type Handlers = {
  onCheckIn?: (event: CheckInStatusEvent) => void;
  onAttendance?: (event: AttendanceStatusEvent) => void;
  onFine?: (event: FineStatusEvent) => void;
  onFineAllocation?: (event: FineAllocationStatusEvent) => void;
  onFund?: (event: FundStatusEvent) => void;
  onTtsSettings?: (event: TtsSettingsStatusEvent) => void;
};

type OrganizationRealtimeOptions = {
  onSnapshotReady?: () => void;
};

type DedupEntry = {
  eventId: string;
  expiresAt: number;
};

export const REALTIME_EVENT_DEDUP_TTL_MS = 5 * 60 * 1000;
export const REALTIME_EVENT_DEDUP_MAX_ENTRIES = 500;

export function createRealtimeEventDeduper(now: () => number = Date.now) {
  const seen = new Map<string, DedupEntry>();

  function prune(currentTime = now()) {
    for (const [eventId, entry] of seen) {
      if (entry.expiresAt <= currentTime) seen.delete(eventId);
    }

    while (seen.size > REALTIME_EVENT_DEDUP_MAX_ENTRIES) {
      const oldestKey = seen.keys().next().value as string | undefined;
      if (!oldestKey) break;
      seen.delete(oldestKey);
    }
  }

  return {
    shouldDeliver(payload: unknown) {
      const currentTime = now();
      prune(currentTime);

      if (!isRecord(payload) || typeof payload.event_id !== "string" || payload.event_id.length === 0) {
        return true;
      }

      if (seen.has(payload.event_id)) return false;

      seen.set(payload.event_id, {
        eventId: payload.event_id,
        expiresAt: currentTime + REALTIME_EVENT_DEDUP_TTL_MS,
      });

      prune(currentTime);
      return true;
    },
    size() {
      prune();
      return seen.size;
    },
  };
}

export function dispatchOrganizationRealtimeEvent<TEvent extends RealtimeEventType>(
  eventType: TEvent,
  payload: unknown,
  handlers: Handlers,
  deduper: ReturnType<typeof createRealtimeEventDeduper>,
) {
  if (!deduper.shouldDeliver(payload)) return false;

  switch (eventType) {
    case "check-in-status":
      handlers.onCheckIn?.(payload as RealtimeEventMap[TEvent] & CheckInStatusEvent);
      break;
    case "attendance-status":
      handlers.onAttendance?.(payload as RealtimeEventMap[TEvent] & AttendanceStatusEvent);
      break;
    case "fine-status":
      handlers.onFine?.(payload as RealtimeEventMap[TEvent] & FineStatusEvent);
      break;
    case "fine-allocation-status":
      handlers.onFineAllocation?.(payload as RealtimeEventMap[TEvent] & FineAllocationStatusEvent);
      break;
    case "fund-status":
      handlers.onFund?.(payload as RealtimeEventMap[TEvent] & FundStatusEvent);
      break;
    case "tts-settings-status":
      handlers.onTtsSettings?.(payload as RealtimeEventMap[TEvent] & TtsSettingsStatusEvent);
      break;
  }

  return true;
}

export function useOrganizationRealtime(
  organizationId: string,
  handlers: Handlers,
  options: OrganizationRealtimeOptions = {},
) {
  const supabase = createClient();
  const handlersRef = useRef(handlers);
  const optionsRef = useRef(options);
  const deduperRef = useRef(createRealtimeEventDeduper());

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    let disposed = false;
    const channel = supabase
      .channel(`organization:${organizationId}`, { config: { private: true } })
      .on("broadcast", { event: "check-in-status" }, ({ payload }: { payload: unknown }) => {
        dispatchOrganizationRealtimeEvent("check-in-status", payload, handlersRef.current, deduperRef.current);
      })
      .on("broadcast", { event: "attendance-status" }, ({ payload }: { payload: unknown }) => {
        dispatchOrganizationRealtimeEvent("attendance-status", payload, handlersRef.current, deduperRef.current);
      })
      .on("broadcast", { event: "fine-status" }, ({ payload }: { payload: unknown }) => {
        dispatchOrganizationRealtimeEvent("fine-status", payload, handlersRef.current, deduperRef.current);
      })
      .on("broadcast", { event: "fine-allocation-status" }, ({ payload }: { payload: unknown }) => {
        dispatchOrganizationRealtimeEvent("fine-allocation-status", payload, handlersRef.current, deduperRef.current);
      })
      .on("broadcast", { event: "fund-status" }, ({ payload }: { payload: unknown }) => {
        dispatchOrganizationRealtimeEvent("fund-status", payload, handlersRef.current, deduperRef.current);
      })
      .on("broadcast", { event: "tts-settings-status" }, ({ payload }: { payload: unknown }) => {
        dispatchOrganizationRealtimeEvent("tts-settings-status", payload, handlersRef.current, deduperRef.current);
      });

    supabase.realtime.setAuth().then(() => {
      if (!disposed) {
        channel.subscribe((status: string) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") {
            optionsRef.current.onSnapshotReady?.();
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn(`Organization realtime ${status.toLowerCase()} for ${organizationId}`);
          }
        });
      }
    }).catch((error: unknown) => {
      // A signed-out tab cannot receive organization events.
      console.warn("Organization realtime auth failed", error);
    });

    return () => {
      disposed = true;
      supabase.removeChannel(channel);
    };
  }, [organizationId, supabase]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
