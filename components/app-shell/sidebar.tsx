"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/Logo";
import { useSiteLogo } from "@/components/SiteBranding";
import type { NavItem } from "./nav";

interface Props {
  nav: NavItem[];
  variant?: "app" | "admin";
  title?: string;
  bottom?: React.ReactNode;
  mobileOpen: boolean;
  onClose: () => void;
  /** Desktop only: collapse the rail to icons (mobile keeps the full drawer). */
  collapsed?: boolean;
}

export function Sidebar({ nav, variant = "app", title, bottom, mobileOpen, onClose, collapsed = false }: Props) {
  const pathname = usePathname();
  const logoUrl = useSiteLogo();
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
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r transition-[width,transform] duration-200 lg:translate-x-0",
          collapsed ? "lg:w-16" : "lg:w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          dark
            ? "border-[#1c3350] bg-[#0c1a2e] text-slate-300"
            : "border-border bg-[var(--sidebar)] text-[var(--sidebar-fg)]",
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center justify-between gap-2 px-4",
            dark ? "border-b border-white/10" : "border-b border-border",
            collapsed && "lg:justify-center lg:px-2",
          )}
        >
          <Link
            href={variant === "admin" ? "/admin" : "/app"}
            className="flex min-w-0 items-center gap-2"
            title={title ?? "ZOTOMIC"}
          >
            {/* Same admin-managed logo as the public site header. */}
            <Logo
              showText={false}
              size={26}
              src={logoUrl || undefined}
              className="overflow-hidden rounded-md"
            />
            <span
              className={cn(
                "truncate text-sm font-extrabold tracking-tight",
                dark ? "text-white" : "text-navy",
                collapsed && "lg:hidden",
              )}
            >
              {title ?? "ZOTOMIC"}
            </span>
          </Link>
          <button
            onClick={onClose}
            className="rounded-sm p-1.5 hover:bg-white/10 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden p-3">
          {nav.map((item, i) => {
            const active = isActive(item.href);
            const prev = nav[i - 1];
            const startsGroup = !!item.group && item.group !== prev?.group;
            return (
              <div key={item.href}>
                {startsGroup &&
                  (collapsed ? (
                    <div
                      className={cn(
                        "mx-1 my-2 hidden border-t lg:block",
                        dark ? "border-white/10" : "border-border",
                      )}
                    />
                  ) : (
                    <p
                      className={cn(
                        "mb-1 mt-4 px-3 text-[10px] font-bold uppercase tracking-widest",
                        dark ? "text-slate-500" : "text-fg-subtle",
                      )}
                    >
                      {item.group}
                    </p>
                  ))}
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                    collapsed && "lg:justify-center lg:px-2",
                    active
                      ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-fg)]"
                      : dark
                        ? "text-slate-300 hover:bg-white/5 hover:text-white"
                        : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className={cn("truncate", collapsed && "lg:hidden")}>{item.label}</span>
                </Link>
              </div>
            );
          })}
        </nav>

        {bottom && (
          <div
            className={cn(
              "p-3",
              collapsed && "lg:hidden",
              dark ? "border-t border-white/10" : "border-t border-border",
            )}
          >
            {bottom}
          </div>
        )}
      </aside>
    </>
  );
}
