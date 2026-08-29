"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { MARKETING_NAV } from "./marketing-nav";
import { SiteFooter } from "./SiteFooter";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-col gap-0.5">
      {MARKETING_NAV.map((item, i) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const prevGroup = MARKETING_NAV[i - 1]?.group;
        return (
          <div key={item.href}>
            {prevGroup === "primary" && item.group === "secondary" && (
              <div className="my-2 border-t border-border" />
            )}
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary-soft text-primary"
                  : "text-fg-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-surface p-4 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <Logo />
        </Link>
        <NavList />
        <div className="mt-auto flex flex-col gap-2 pt-4">
          <Button href="/login" variant="ghost" size="sm" className="justify-start">
            Log in
          </Button>
          <Button href="/signup" size="sm">
            Start free <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-surface px-4 lg:hidden">
        <Link href="/" aria-label="Zotomic home">
          <Logo size={24} />
        </Link>
        <div className="flex items-center gap-2">
          <Button href="/signup" size="sm">
            Start free
          </Button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-sm p-2 text-fg-muted hover:bg-surface-2"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-x-0 top-14 z-40 border-b border-border bg-surface p-4 lg:hidden">
          <NavList onNavigate={() => setOpen(false)} />
          <Button href="/login" variant="outline" className="mt-3 w-full">
            Log in
          </Button>
        </div>
      )}

      <div className="flex min-h-screen flex-col">
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}
