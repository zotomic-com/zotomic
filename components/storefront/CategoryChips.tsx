"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { cldUrl } from "@/lib/cloudinary";
import type { StoreCategory } from "@/lib/storefront/store";

/** Category carousel — rounded photo+label chips that auto-scroll and can be
 *  swiped. Falls back to plain text pills when no category has an image. */
export function CategoryChips({
  categories,
  basePath,
  active,
  variant = "photo",
}: {
  categories: StoreCategory[];
  basePath: string;
  active?: string;
  variant?: "photo" | "pill";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const hasPhotos = variant === "photo" && categories.some((c) => c.imageUrl);

  useEffect(() => {
    if (!hasPhotos || categories.length < 3) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      const el = ref.current;
      if (!el || paused.current || el.scrollWidth <= el.clientWidth + 8) return;
      const max = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= max - 4) el.scrollTo({ left: 0, behavior: "smooth" });
      else el.scrollBy({ left: 150, behavior: "smooth" });
    }, 3000);
    return () => clearInterval(id);
  }, [hasPhotos, categories.length]);

  if (!categories.length) return null;

  if (!hasPhotos) {
    return (
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
        <Link
          href={`${basePath}/products`}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
            !active ? "border-[var(--sf-accent)] bg-[var(--sf-accent)] text-white" : "border-[var(--sf-line)] text-[var(--sf-muted)]"
          }`}
        >
          All
        </Link>
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={`${basePath}/products?category=${encodeURIComponent(c.name)}`}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              active === c.name
                ? "border-[var(--sf-accent)] bg-[var(--sf-accent)] text-white"
                : "border-[var(--sf-line)] text-[var(--sf-muted)] hover:text-[var(--sf-fg)]"
            }`}
          >
            {c.name}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 py-1"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onTouchStart={() => (paused.current = true)}
      onTouchEnd={() => setTimeout(() => (paused.current = false), 4000)}
    >
      {categories.map((c) => (
        <Link
          key={c.slug}
          href={`${basePath}/products?category=${encodeURIComponent(c.name)}`}
          className={`flex shrink-0 items-center gap-2.5 rounded-[var(--sf-radius-lg)] border bg-[var(--sf-bg)] p-1.5 pr-3.5 shadow-[var(--sf-shadow)] transition-colors ${
            active === c.name ? "border-[var(--sf-accent)]" : "border-[var(--sf-line)] hover:border-[var(--sf-accent)]"
          }`}
        >
          <span className="h-10 w-10 shrink-0 overflow-hidden rounded-[calc(var(--sf-radius)_-_2px)] bg-[var(--sf-card)]">
            {c.imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={cldUrl(c.imageUrl, 120)} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-sm font-bold text-[var(--sf-muted)]">
                {c.name[0]}
              </span>
            )}
          </span>
          <span className="whitespace-nowrap text-xs font-semibold">{c.name}</span>
        </Link>
      ))}
    </div>
  );
}
