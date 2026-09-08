"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Swipe-down-to-dismiss bottom sheet. Also a modal panel on desktop. */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  useEffect(() => {
    if (open) setDrag(0);
  }, [open]);

  if (!open || !mounted) return null;

  const onTouchStart = (e: React.TouchEvent) => {
    // only start a drag-to-close when the panel is scrolled to top
    if ((panelRef.current?.scrollTop ?? 0) > 0) return;
    startY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) setDrag(dy);
  };
  const onTouchEnd = () => {
    if (drag > 110) onClose();
    else setDrag(0);
    startY.current = null;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
      style={{ fontFamily: "inherit" }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={panelRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transform: drag ? `translateY(${drag}px)` : undefined, transition: drag ? "none" : "transform .25s ease" }}
        className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border border-[var(--sf-line)] bg-[var(--sf-bg)] text-[var(--sf-fg)] shadow-2xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--sf-line)] bg-[var(--sf-bg)] px-4 pb-2.5 pt-3">
          <span aria-hidden className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-[var(--sf-line)] sm:hidden" />
          <h2 className="text-sm font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-[var(--sf-muted)] hover:text-[var(--sf-fg)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
