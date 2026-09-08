"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

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

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const nextId = useRef(0);
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = "success") => {
    const id = nextId.current++;
    setItems((current) => [...current.slice(-3), { id, message, variant }]);
    window.setTimeout(() => dismiss(id), 4500);
  }, [dismiss]);

  const success = useCallback((message: string) => toast(message, "success"), [toast]);
  const error = useCallback((message: string) => toast(message, "error"), [toast]);

  return (
    <ToastContext.Provider value={{ error, success, toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-end gap-3 sm:left-auto sm:max-w-sm" aria-label="Thông báo">
        {items.map((item) => (
          <div
            className={`pointer-events-auto flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-bold shadow-xl sm:w-96 ${
              item.variant === "error"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
            key={item.id}
            role={item.variant === "error" ? "alert" : "status"}
          >
            <span className="flex-1">{item.message}</span>
            <button
              aria-label="Đóng thông báo"
              className="shrink-0 rounded-full px-1 text-lg leading-none opacity-70 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal)]"
              onClick={() => dismiss(item.id)}
              type="button"
            >
              ×
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
