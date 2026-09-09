"use client";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";

export type CheckInRealtimeEvent = {
  attempt_id: number;
  user_id: string;
  display_name: string | null;
  method: "gps" | "qr" | "otp";
  succeeded: boolean;
  rejection_reason: string | null;
  server_received_at: string;
};

export type FineRealtimeEvent = {
  fine_id: string;
  user_id: string;
  status: "unpaid" | "paid" | "waived";
  amount_vnd: number;
  updated_at: string;
};

export type FundRealtimeEvent = {
  transaction_id: string;
  direction: "incoming" | "outgoing";
  amount_vnd: number;
  reconciliation_status: string;
  updated_at: string;
};

type Handlers = {
  onCheckIn?: (event: CheckInRealtimeEvent) => void;
  onFine?: (event: FineRealtimeEvent) => void;
  onFund?: (event: FundRealtimeEvent) => void;
};

export function useOrganizationRealtime(organizationId: string, handlers: Handlers) {
  const supabase = createClient();
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    let disposed = false;
    const channel = supabase
      .channel(`organization:${organizationId}`, { config: { private: true } })
      .on("broadcast", { event: "check-in-status" }, ({ payload }: { payload: unknown }) => {
        handlersRef.current.onCheckIn?.(payload as CheckInRealtimeEvent);
      })
      .on("broadcast", { event: "fine-status" }, ({ payload }: { payload: unknown }) => {
        handlersRef.current.onFine?.(payload as FineRealtimeEvent);
      })
      .on("broadcast", { event: "fund-status" }, ({ payload }: { payload: unknown }) => {
        handlersRef.current.onFund?.(payload as FundRealtimeEvent);
      });

    supabase.realtime.setAuth().then(() => {
      if (!disposed) channel.subscribe();
    }).catch(() => {
      // A signed-out tab cannot receive organization events.
    });

    return () => {
      disposed = true;
      supabase.removeChannel(channel);
    };
  }, [organizationId, supabase]);
}
