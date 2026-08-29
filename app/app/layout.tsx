"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import { APP_NAV } from "@/components/app-shell/nav";
import { AppContext, type AppBusiness, type AppUser } from "./context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [businesses, setBusinesses] = useState<AppBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.user) {
          router.replace("/login");
          return;
        }
        setUser(d.user);
        setBusinesses(d.businesses ?? []);
        if (d.user.role === "owner" && (!d.businesses || d.businesses.length === 0)) {
          router.replace("/onboarding");
        }
      })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  const business = businesses[0] ?? null;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ user, business, businesses, logout }}>
      <Sidebar
        nav={APP_NAV}
        variant="app"
        mobileOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        bottom={
          <Link
            href="/app/billing"
            className="block rounded-sm border border-primary-soft bg-primary-soft p-3 text-xs"
          >
            <p className="font-bold text-primary">Upgrade to Pro</p>
            <p className="mt-0.5 text-fg-muted">More insights, higher limits, automation.</p>
          </Link>
        }
      />

      <div className="lg:pl-64">
        <Topbar
          onMenuClick={() => setMenuOpen(true)}
          searchPlaceholder="Search anything…"
          right={
            <div className="flex items-center gap-2">
              <div className="hidden text-right sm:block">
                <p className="text-xs font-semibold text-fg">{user?.name}</p>
                <p className="text-[11px] text-fg-subtle">{business?.name ?? "No business"}</p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-fg">
                {user?.name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <button
                onClick={logout}
                className="rounded-sm p-2 text-fg-subtle hover:bg-surface-2 hover:text-danger"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          }
        />
        <main className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
      </div>
    </AppContext.Provider>
  );
}
