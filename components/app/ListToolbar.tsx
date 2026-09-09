"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface FilterGroup {
  key: string;
  label?: string;
  options: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
}

/** Search box + one or more filter chip groups + right-side actions. */
export function ListToolbar({
  search,
  onSearch,
  searchPlaceholder = "Search…",
  filters = [],
  actions,
}: {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  filters?: FilterGroup[];
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={searchPlaceholder} className="pl-9" />
        </div>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {filters.map((g) => (
        <div key={g.key} className="flex flex-wrap items-center gap-1.5">
          {g.label && <span className="mr-1 text-xs font-semibold text-fg-subtle">{g.label}</span>}
          {g.options.map((o) => (
            <button
              key={o.value}
              onClick={() => g.onChange(o.value)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                g.value === o.value
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border text-fg-muted hover:border-border-strong"
              }`}
            >
              {o.label}
              {o.count != null && <span className="ml-1 opacity-60">{o.count}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
