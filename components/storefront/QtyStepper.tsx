"use client";

import { Minus, Plus } from "lucide-react";

/** Shared cart / checkout quantity control. */
export function QtyStepper({
  qty,
  onChange,
  min = 1,
  size = "md",
}: {
  qty: number;
  onChange: (next: number) => void;
  min?: number;
  size?: "sm" | "md";
}) {
  const btn =
    (size === "sm" ? "h-7 w-7" : "h-8 w-8") +
    " flex items-center justify-center rounded-[var(--sf-radius)] border border-[var(--sf-line)] text-[var(--sf-fg)] disabled:opacity-40";
  return (
    <div className="inline-flex items-center gap-2">
      <button type="button" aria-label="Decrease quantity" className={btn} disabled={qty <= min} onClick={() => onChange(qty - 1)}>
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-8 text-center text-sm tabular-nums">{qty}</span>
      <button type="button" aria-label="Increase quantity" className={btn} onClick={() => onChange(qty + 1)}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
