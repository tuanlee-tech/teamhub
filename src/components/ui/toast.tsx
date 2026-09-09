"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";

type ToastVariant = "success" | "error";

type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  toast: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

type ToastState = {
  error?: string | null;
  success?: string | null;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const nextId = useRef(0);
  const timers = useRef(new Map<number, number>());
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = "success") => {
    const id = nextId.current++;
    setItems((current) => [...current.slice(-3), { id, message, variant }]);
    const timer = window.setTimeout(() => dismiss(id), 4500);
    timers.current.set(id, timer);
  }, [dismiss]);

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
  }, []);

  const success = useCallback((message: string) => toast(message, "success"), [toast]);
  const error = useCallback((message: string) => toast(message, "error"), [toast]);

  return (
    <ToastContext.Provider value={{ error, success, toast }}>
      {children}
      <div
        aria-label="Thông báo"
        className="pointer-events-none fixed inset-x-4 bottom-[max(env(safe-area-inset-bottom),2.5rem)] z-[100] flex flex-col items-center gap-3 sm:inset-x-auto sm:right-6 sm:bottom-10 sm:w-[min(24rem,calc(100vw-3rem))]"
      >
        {items.map((item) => (
          <div
            className={`pointer-events-auto flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold shadow-[0_16px_40px_rgba(0,0,0,0.55)] ${
              item.variant === "error"
                ? "border-red-900 bg-red-900 text-red-50"
                : "border-emerald-900 bg-emerald-900 text-emerald-50"
            }`}
            key={item.id}
            role={item.variant === "error" ? "alert" : "status"}
          >
            {item.variant === "error" ? (
              <CircleAlert aria-hidden="true" className="size-5 shrink-0 text-red-100" />
            ) : (
              <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-emerald-100" />
            )}
            <span className="flex-1">{item.message}</span>
            <button
              aria-label="Đóng thông báo"
              className="shrink-0 rounded-full p-1 text-current opacity-80 transition hover:bg-black/10 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
              onClick={() => dismiss(item.id)}
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

export function useToastFeedback(state: ToastState, options?: { error?: boolean; success?: boolean }) {
  const { error: showError, success: showSuccess } = useToast();
  const showErrors = options?.error !== false;
  const showSuccesses = options?.success !== false;

  useEffect(() => {
    if (showErrors && state.error) {
      showError(state.error);
    } else if (showSuccesses && state.success) {
      showSuccess(state.success);
    }
    // The action state values are the event that should produce a toast.
  }, [showErrors, showSuccesses, state.error, state.success, showError, showSuccess]);
}
