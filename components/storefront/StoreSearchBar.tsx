"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";

export function StoreSearchBar({ basePath, initial }: { basePath: string; initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  const go = (value: string) => {
    const t = value.trim();
    router.push(`${basePath}/products${t ? `?q=${encodeURIComponent(t)}` : ""}`);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go(q);
      }}
      className="flex items-center gap-2"
    >
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sf-muted)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="What are you looking for?"
          aria-label="Search products"
          className="h-11 w-full rounded-full border border-[var(--sf-line)] bg-[var(--sf-card)] pl-10 pr-9 text-sm outline-none focus:border-[var(--sf-accent)]"
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              go("");
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--sf-muted)]"
            aria-label="Clear"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <button
        type="submit"
        aria-label="Search"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--sf-accent)] text-white"
      >
        <SlidersHorizontal className="h-4 w-4" />
      </button>
    </form>
  );
}
