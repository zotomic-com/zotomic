"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/Logo";
import type { NavItem } from "./nav";

interface Props {
  nav: NavItem[];
  variant?: "app" | "admin";
  title?: string;
  bottom?: React.ReactNode;
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ nav, variant = "app", title, bottom, mobileOpen, onClose }: Props) {
  const pathname = usePathname();
  const dark = variant === "admin";

  const isActive = (href: string) =>
    href === "/app" || href === "/admin"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          dark
            ? "border-[#1c3350] bg-[#0c1a2e] text-slate-300"
            : "border-border bg-[var(--sidebar)] text-[var(--sidebar-fg)]",
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center justify-between px-4",
            dark ? "border-b border-white/10" : "border-b border-border",
          )}
        >
          <Link href={variant === "admin" ? "/admin" : "/app"} className="flex items-center gap-2">
            <Logo showText={false} size={26} />
            <span className={cn("text-sm font-extrabold tracking-tight", dark ? "text-white" : "text-navy")}>
              {title ?? "ZOTOMIC"}
            </span>
          </Link>
          <button onClick={onClose} className="rounded-sm p-1.5 hover:bg-white/10 lg:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {nav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-fg)]"
                    : dark
                      ? "text-slate-300 hover:bg-white/5 hover:text-white"
                      : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {bottom && (
          <div className={cn("p-3", dark ? "border-t border-white/10" : "border-t border-border")}>
            {bottom}
          </div>
        )}
      </aside>
    </>
  );
}
