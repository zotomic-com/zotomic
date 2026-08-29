"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import { ADMIN_NAV } from "@/components/app-shell/nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user?.role === "admin") setReady(true);
        else router.replace(d?.user ? "/app" : "/login");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <Sidebar
        nav={ADMIN_NAV}
        variant="admin"
        title="ZOTOMIC ADMIN"
        mobileOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
      <div className="min-h-screen bg-app lg:pl-64">
        <Topbar
          onMenuClick={() => setMenuOpen(true)}
          searchPlaceholder="Search users, businesses, orders…"
          right={
            <button
              onClick={logout}
              className="rounded-sm p-2 text-fg-subtle hover:bg-surface-2 hover:text-danger"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          }
        />
        <main className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
      </div>
    </>
  );
}
