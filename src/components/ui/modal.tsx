"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { CloseButton } from "@/components/ui/close-button";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  panelClassName?: string;
};

export function Modal({ open, onClose, children, eyebrow, title, description, panelClassName = "" }: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      openerRef.current?.focus();
      openerRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      aria-label={title}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(16,42,44,0.42)] p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        className={`paper-panel w-full max-w-2xl overflow-hidden !bg-[var(--paper)] shadow-2xl outline-none ${panelClassName}`}
        ref={panelRef}
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-6 py-5 sm:px-8">
          <div>
            {eyebrow ? <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--signal)]">{eyebrow}</p> : null}
            <h2 className="display-type mt-1 text-2xl" id={titleId}>{title}</h2>
          </div>
          <CloseButton aria-label="Đóng modal" onClick={onClose} />
        </div>
        {description ? <p className="px-6 pt-5 text-sm leading-relaxed text-[var(--ink-soft)] sm:px-8" id={descriptionId}>{description}</p> : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
