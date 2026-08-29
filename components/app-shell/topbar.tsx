"use client";

import Link from "next/link";
import { Bell, Menu, Search } from "lucide-react";

interface Props {
  onMenuClick: () => void;
  searchPlaceholder?: string;
  right?: React.ReactNode;
  notificationsHref?: string;
  unread?: number;
}

export function Topbar({ onMenuClick, searchPlaceholder = "Search…", right, notificationsHref, unread = 0 }: Props) {
  const bell = (
    <span className="relative block rounded-sm p-2 text-fg-muted hover:bg-surface-2">
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </span>
  );

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
        {notificationsHref ? (
          <Link href={notificationsHref} aria-label="Notifications">
            {bell}
          </Link>
        ) : (
          <button aria-label="Notifications">{bell}</button>
        )}
        {right}
      </div>
    </header>
  );
}
