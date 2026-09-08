"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { StoreProduct } from "@/lib/storefront/store";
import { ProductCard } from "./ProductCard";

/** Auto-playing horizontal product carousel. Pauses on hover / touch.
 *  Falls back to a plain row when everything already fits. */
export function ProductCarousel({
  products,
  currency,
  basePath,
  storeSlug,
  interval = 3800,
}: {
  products: StoreProduct[];
  currency: string;
  basePath: string;
  storeSlug?: string;
  interval?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const paused = useRef(false);

  const step = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = (el.firstElementChild as HTMLElement | null)?.clientWidth ?? 240;
    const amount = card + 16;
    const max = el.scrollWidth - el.clientWidth;
    if (dir === 1 && el.scrollLeft >= max - 4) el.scrollTo({ left: 0, behavior: "smooth" });
    else if (dir === -1 && el.scrollLeft <= 4) el.scrollTo({ left: max, behavior: "smooth" });
    else el.scrollBy({ left: dir * amount, behavior: "smooth" });
  };

  useEffect(() => {
    if (products.length < 2) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = setInterval(() => {
      if (paused.current) return;
      const el = ref.current;
      if (!el || el.scrollWidth <= el.clientWidth + 8) return; // everything fits — don't loop
      step(1);
    }, interval);
    return () => clearInterval(t);
  }, [products.length, interval]);

  if (!products.length) return <p className="text-sm text-[var(--sf-muted)]">No products published yet.</p>;

  return (
    <div
      className="group/carousel relative"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onTouchStart={() => (paused.current = true)}
      onTouchEnd={() => setTimeout(() => (paused.current = false), 4000)}
    >
      <div ref={ref} className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
        {products.map((p) => (
          <div key={p.id} className="w-[47%] shrink-0 snap-start sm:w-[31%] lg:w-[23.5%]">
            <ProductCard product={p} currency={currency} basePath={basePath} storeSlug={storeSlug} />
          </div>
        ))}
      </div>

      {products.length > 2 && (
        <>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous"
            className="absolute -left-3 top-[35%] hidden h-9 w-9 items-center justify-center rounded-full border border-[var(--sf-line)] bg-[var(--sf-bg)] text-[var(--sf-fg)] shadow-md transition-opacity group-hover/carousel:opacity-100 sm:flex sm:opacity-0"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next"
            className="absolute -right-3 top-[35%] hidden h-9 w-9 items-center justify-center rounded-full border border-[var(--sf-line)] bg-[var(--sf-bg)] text-[var(--sf-fg)] shadow-md transition-opacity group-hover/carousel:opacity-100 sm:flex sm:opacity-0"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  );
}
