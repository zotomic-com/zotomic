"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Lock, TriangleAlert } from "lucide-react";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import { APP_NAV } from "@/components/app-shell/nav";
import { AppContext, type AppBusiness, type AppUser } from "./context";

interface Billing {
  status: string;
  readOnly: boolean;
  hardLocked: boolean;
  daysOverdue: number | null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AppUser | null>(null);
  const [businesses, setBusinesses] = useState<AppBusiness[]>([]);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const onBilling = pathname === "/app/billing";

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
        setBilling(d.billing ?? null);
        if (d.user.role === "owner" && (!d.businesses || d.businesses.length === 0)) {
          router.replace("/onboarding");
        }
      })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (billing?.hardLocked && !onBilling) router.replace("/app/billing");
  }, [billing, onBilling, router]);

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
          billing && billing.status !== "active" ? (
            <Link href="/app/billing" className="block rounded-sm border border-danger/30 bg-danger-soft p-3 text-xs">
              <p className="flex items-center gap-1 font-bold text-danger">
                <Lock className="h-3.5 w-3.5" /> Payment due
              </p>
              <p className="mt-0.5 text-fg-muted">Reactivate your account.</p>
            </Link>
          ) : (
            <Link href="/app/billing" className="block rounded-sm border border-primary-soft bg-primary-soft p-3 text-xs">
              <p className="font-bold text-primary">Plans &amp; billing</p>
              <p className="mt-0.5 text-fg-muted">Manage your subscription.</p>
            </Link>
          )
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

        {billing && (billing.status === "grace" || billing.status === "soft_lock") && !onBilling && (
          <div className="flex items-center gap-2 border-b border-warning/30 bg-warning-soft px-4 py-2 text-sm text-warning sm:px-6">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            {billing.status === "soft_lock"
              ? "Your account is read-only until payment is confirmed."
              : `Payment overdue by ${billing.daysOverdue} day(s).`}{" "}
            <Link href="/app/billing" className="font-semibold underline">
              Pay now
            </Link>
          </div>
        )}

        <main className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
      </div>
    </AppContext.Provider>
  );
}
