"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import { ADMIN_NAV } from "@/components/app-shell/nav";

const SIDEBAR_KEY = "zotomic:sidebar-collapsed";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      /* storage blocked — keep the default */
    }
  }, []);

  const toggleSidebar = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user?.role !== "admin") router.replace(d?.user ? "/app" : "/login");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  return (
    <>
      <Sidebar
        nav={ADMIN_NAV}
        variant="admin"
        title="ZOTOMIC ADMIN"
        mobileOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        collapsed={collapsed}
      />
      <div className={cn("min-h-dvh bg-app transition-[padding]", collapsed ? "lg:pl-16" : "lg:pl-64")}>
        <Topbar
          onMenuClick={() => setMenuOpen(true)}
          searchPlaceholder="Search users, businesses, orders…"
          collapsed={collapsed}
          onToggleSidebar={toggleSidebar}
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
