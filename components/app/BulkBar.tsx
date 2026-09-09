"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

/** Floating action bar shown while rows are selected in a DataGrid. */
export function BulkBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-full border border-border-strong bg-surface px-3 py-2 shadow-lg">
        <span className="pl-1 pr-1 text-sm font-semibold text-fg">{count} selected</span>
        <span className="h-4 w-px bg-border" />
        {children}
        <button onClick={onClear} aria-label="Clear selection" className="ml-1 rounded-full p-1 text-fg-subtle hover:text-fg">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
