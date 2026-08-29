"use client";

import { Bell, Menu, Search } from "lucide-react";

interface Props {
  onMenuClick: () => void;
  searchPlaceholder?: string;
  right?: React.ReactNode;
}

export function Topbar({ onMenuClick, searchPlaceholder = "Search…", right }: Props) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
      <button
        onClick={onMenuClick}
        className="rounded-sm p-2 text-fg-muted hover:bg-surface-2 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative hidden max-w-sm flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <input
          type="search"
          placeholder={searchPlaceholder}
          className="h-9 w-full rounded-sm border border-border bg-app pl-9 pr-3 text-sm text-fg placeholder:text-fg-subtle focus-visible:border-accent"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button className="relative rounded-sm p-2 text-fg-muted hover:bg-surface-2" aria-label="Notifications">
          <Bell className="h-5 w-5" />
        </button>
        {right}
      </div>
    </header>
  );
}
