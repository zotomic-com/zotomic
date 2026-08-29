"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

export function StoreSearchBar({ basePath, initial }: { basePath: string; initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  const go = (value: string) => {
    const params = new URLSearchParams();
    if (value.trim()) params.set("q", value.trim());
    router.push(`${basePath}/products${params.toString() ? `?${params}` : ""}`);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go(q);
      }}
      className="relative mt-4 max-w-md"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sf-muted)]" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search products…"
        className="h-10 w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-bg)] pl-9 pr-9 text-sm"
      />
      {q && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            go("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--sf-muted)]"
          aria-label="Clear"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
