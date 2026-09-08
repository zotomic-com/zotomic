"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Search, SlidersHorizontal, X } from "lucide-react";

const SORTS = [
  { value: "", label: "Relevance" },
  { value: "new", label: "Newest first" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "rating", label: "Top rated" },
] as const;

export function StoreSearchBar({
  basePath,
  initial,
  initialSort = "",
  initialInStock = false,
}: {
  basePath: string;
  initial: string;
  initialSort?: string;
  initialInStock?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState(initialSort);
  const [inStock, setInStock] = useState(initialInStock);
  const wrapRef = useRef<HTMLDivElement>(null);

  const go = (value: string, opts?: { sort?: string; inStock?: boolean }) => {
    const params = new URLSearchParams();
    const t = value.trim();
    if (t) params.set("q", t);
    const sv = opts?.sort ?? sort;
    if (sv) params.set("sort", sv);
    const inS = opts?.inStock ?? inStock;
    if (inS) params.set("stock", "1");
    const qs = params.toString();
    router.push(`${basePath}/products${qs ? `?${qs}` : ""}`);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const filtersActive = Boolean(sort) || inStock;

  return (
    <div ref={wrapRef} className="relative">
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
          type="button"
          aria-label="Search filters"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white ${
            open ? "bg-[var(--sf-fg)]" : "bg-[var(--sf-accent)]"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {filtersActive && !open && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--sf-bg)] bg-red-500" />
          )}
        </button>
      </form>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] bg-[var(--sf-elevated)] p-3 shadow-[var(--sf-shadow)]">
          <p className="px-1 pb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--sf-muted)]">Sort by</p>
          <div className="space-y-0.5">
            {SORTS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setSort(o.value)}
                className={`flex w-full items-center justify-between rounded-[var(--sf-radius)] px-2.5 py-1.5 text-left text-sm ${
                  sort === o.value ? "bg-[var(--sf-accent-soft)] font-semibold text-[var(--sf-fg)]" : "text-[var(--sf-muted)] hover:bg-[var(--sf-card)]"
                }`}
              >
                {o.label}
                {sort === o.value && <Check className="h-4 w-4 text-[var(--sf-accent)]" />}
              </button>
            ))}
          </div>

          <label className="mt-2 flex cursor-pointer items-center justify-between rounded-[var(--sf-radius)] px-2.5 py-1.5 text-sm text-[var(--sf-fg)] hover:bg-[var(--sf-card)]">
            In stock only
            <input
              type="checkbox"
              checked={inStock}
              onChange={(e) => setInStock(e.target.checked)}
              className="h-4 w-4 accent-[var(--sf-accent)]"
            />
          </label>

          <div className="mt-2.5 flex gap-2 border-t border-[var(--sf-line)] pt-2.5">
            <button
              type="button"
              onClick={() => {
                setSort("");
                setInStock(false);
                setOpen(false);
                go(q, { sort: "", inStock: false });
              }}
              className="flex-1 rounded-full border border-[var(--sf-line)] px-3 py-1.5 text-xs font-semibold text-[var(--sf-muted)]"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                go(q);
              }}
              className="flex-1 rounded-full bg-[var(--sf-accent)] px-3 py-1.5 text-xs font-bold text-white"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
