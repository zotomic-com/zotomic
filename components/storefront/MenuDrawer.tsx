"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Menu, X } from "lucide-react";
import { logoutAction } from "@/app/s/[slug]/account/actions";

interface NavLink {
  label: string;
  href: string;
}

/** Slide-in nav drawer (right). Trigger + panel are self-contained.
 *  Shows the store nav menu plus account actions. */
export function MenuDrawer({
  nav,
  basePath,
  storeSlug,
  triggerClassName = "rounded-[var(--sf-radius)] p-2",
}: {
  nav: NavLink[];
  basePath: string;
  storeSlug?: string;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false); // drives the slide transition
  const [mounted, setMounted] = useState(false);
  const [account, setAccount] = useState<{ loggedIn: boolean; name?: string | null } | null>(null);

  useEffect(() => setMounted(true), []);

  const close = () => {
    setShown(false);
    setTimeout(() => setOpen(false), 260);
  };

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    if (storeSlug && !account) {
      fetch(`/api/storefront/account/session?store=${encodeURIComponent(storeSlug)}`)
        .then((r) => r.json())
        .then((d) => setAccount({ loggedIn: !!d.loggedIn, name: d.name ?? null }))
        .catch(() => setAccount({ loggedIn: false }));
    }
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open, storeSlug, account]);

  const href = (h: string) => (h.startsWith("/") ? `${basePath}${h === "/" ? "" : h}` || "/" : h);
  const go = (h: string) => {
    close();
    router.push(href(h));
  };

  const ghost =
    "w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)] px-4 py-2.5 text-sm font-semibold text-[var(--sf-fg)] hover:bg-[var(--sf-card)]";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Menu" className={triggerClassName}>
        <Menu className="h-5 w-5" />
      </button>

      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[85]">
            <div
              className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`}
              onClick={close}
            />
            <aside
              className={`absolute right-0 top-0 flex h-full w-72 max-w-[82vw] flex-col bg-[var(--sf-bg)] text-[var(--sf-fg)] shadow-2xl transition-transform duration-300 ease-out ${
                shown ? "translate-x-0" : "translate-x-full"
              }`}
            >
              <div className="flex items-center justify-between border-b border-[var(--sf-line)] px-4 py-3">
                <span className="text-sm font-bold">Menu</span>
                <button onClick={close} aria-label="Close">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto p-3">
                <ul className="space-y-0.5">
                  {nav.map((n) => (
                    <li key={n.href + n.label}>
                      <Link
                        href={href(n.href)}
                        onClick={close}
                        className="block rounded-[var(--sf-radius)] px-3 py-2.5 text-sm font-medium hover:bg-[var(--sf-card)]"
                      >
                        {n.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              {storeSlug && (
                <div className="space-y-2 border-t border-[var(--sf-line)] p-3">
                  {account?.loggedIn ? (
                    <>
                      <button className={ghost} onClick={() => go("/account")}>
                        {account.name ? `${account.name} · My account` : "My account"}
                      </button>
                      <button
                        className={ghost}
                        onClick={async () => {
                          try {
                            await logoutAction();
                          } catch {
                            /* ignore */
                          }
                          setOpen(false);
                          router.push(basePath || "/");
                          router.refresh();
                        }}
                      >
                        Sign out
                      </button>
                    </>
                  ) : (
                    <button className={ghost} onClick={() => go("/account/login")}>
                      Sign in
                    </button>
                  )}
                </div>
              )}
            </aside>
          </div>,
          document.body,
        )}
    </>
  );
}
