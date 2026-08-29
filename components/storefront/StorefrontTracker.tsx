"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

function sessionId(): string {
  try {
    let s = localStorage.getItem("zt_sid");
    if (!s) {
      s = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem("zt_sid", s);
    }
    return s;
  } catch {
    return "";
  }
}

export function storefrontEvent(
  storeSlug: string,
  type: "page_view" | "product_view" | "add_to_cart" | "add_to_wishlist" | "begin_checkout",
  extra: { path?: string; productId?: string; value?: number } = {},
) {
  try {
    const body = JSON.stringify({ storeSlug, type, sessionId: sessionId(), ...extra });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/storefront/events", body);
    else fetch("/api/storefront/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  } catch {
    /* ignore */
  }
}

/** Fires one specific storefront event on mount. */
export function StorefrontEvent({
  storeSlug,
  type,
  productId,
  value,
}: {
  storeSlug: string;
  type: "product_view" | "begin_checkout";
  productId?: string;
  value?: number;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    storefrontEvent(storeSlug, type, { productId, value });
  }, [storeSlug, type, productId, value]);
  return null;
}

/** Fires page_view on every storefront route change. */
export function StorefrontTracker({ storeSlug }: { storeSlug: string }) {
  const pathname = usePathname();
  const last = useRef<string>("");
  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    storefrontEvent(storeSlug, "page_view", { path: pathname });
  }, [pathname, storeSlug]);
  return null;
}
