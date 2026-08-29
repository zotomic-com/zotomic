"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { User } from "lucide-react";

/** Header account icon. Checks session client-side so storefront pages stay cacheable. */
export function AccountLink({ storeSlug, basePath }: { storeSlug: string; basePath: string }) {
  const [name, setName] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/storefront/account/session?store=${encodeURIComponent(storeSlug)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setLoggedIn(!!d.loggedIn);
        setName(d.name ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [storeSlug]);

  return (
    <Link
      href={`${basePath}${loggedIn ? "/account" : "/account/login"}`}
      className="rounded-[var(--sf-radius)] p-2"
      aria-label={loggedIn ? "My account" : "Sign in"}
      title={loggedIn ? name || "My account" : "Sign in"}
    >
      <User className="h-5 w-5" />
    </Link>
  );
}
