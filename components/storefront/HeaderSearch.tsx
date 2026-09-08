"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

/** Compact search in the storefront header. Expands on desktop, icon-only link on mobile. */
export function HeaderSearch({ basePath }: { basePath: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const go = () => {
    const t = q.trim();
    router.push(`${basePath}/products${t ? `?q=${encodeURIComponent(t)}` : ""}`);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      className="relative hidden lg:block"
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sf-muted)]" />
      <input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search"
        className="h-9 w-44 rounded-full border border-[var(--sf-line)] bg-[var(--sf-card)] pl-8 pr-3 text-sm outline-none transition-[width] focus:w-60"
        aria-label="Search products"
      />
    </form>
  );
}
