"use client";

import { cn } from "@/lib/cn";

interface Props<T extends string> {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: Props<T>) {
  return (
    <div
      className={cn("inline-flex gap-1 rounded-sm border border-border bg-surface-2 p-1", className)}
      role="tablist"
    >
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
          className={cn(
            "rounded-[8px] px-3 py-1.5 text-sm font-medium transition-colors",
            t.value === value
              ? "bg-surface text-fg shadow-sm"
              : "text-fg-muted hover:text-fg",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
