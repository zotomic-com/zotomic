"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Package, Heart, MapPin, UserRound } from "lucide-react";

interface Tab {
  href: string;
  label: string;
  icon: typeof Package;
  /** match this exact path only (overview) vs. prefix match */
  exact?: boolean;
}

export function AccountShell({
  basePath,
  name,
  children,
}: {
  basePath: string;
  name: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const root = `${basePath}/account`;

  const tabs: Tab[] = [
    { href: root, label: "Overview", icon: LayoutGrid, exact: true },
    { href: `${root}/orders`, label: "Orders", icon: Package },
    { href: `${root}/wishlist`, label: "Wishlist", icon: Heart },
    { href: `${root}/addresses`, label: "Addresses", icon: MapPin },
    { href: `${root}/profile`, label: "Profile", icon: UserRound },
  ];

  const isActive = (t: Tab) =>
    t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`) || pathname === t.href;

  return (
    <div className="min-h-[60vh] bg-[var(--sf-bg)]">
      <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--sf-muted)]">My account</p>
        <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight">
          {name ? `Hi, ${name.split(" ")[0]}` : "Hi there"}
        </h1>
      </div>

      {/* sticky section tabs — offset clears the storefront header (+ mobile search row) */}
      <div className="sticky top-[128px] z-30 mt-4 border-y border-[var(--sf-line)] bg-[var(--sf-bg)]/95 backdrop-blur sm:top-16">
        <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-3 py-2 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => {
            const active = isActive(t);
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[var(--sf-accent)] text-white"
                    : "text-[var(--sf-muted)] hover:bg-[var(--sf-card)] hover:text-[var(--sf-fg)]"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}
