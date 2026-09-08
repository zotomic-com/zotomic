import Link from "next/link";
import { cldUrl } from "@/lib/cloudinary";
import type { StoreCategory } from "@/lib/storefront/store";

/** Photo-chip category row (mockup "Categories" pattern). Falls back to text
 *  pills when categories have no image. Horizontal scroll on mobile. */
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
  if (!categories.length) return null;
  const hasPhotos = variant === "photo" && categories.some((c) => c.imageUrl);

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
              active === c.name ? "border-[var(--sf-accent)] bg-[var(--sf-accent)] text-white" : "border-[var(--sf-line)] text-[var(--sf-muted)] hover:text-[var(--sf-fg)]"
            }`}
          >
            {c.name}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="no-scrollbar -mx-1 flex gap-4 overflow-x-auto px-1 py-1 sm:flex-wrap">
      {categories.map((c) => (
        <Link
          key={c.slug}
          href={`${basePath}/products?category=${encodeURIComponent(c.name)}`}
          className="group flex w-16 shrink-0 flex-col items-center gap-1.5 sm:w-20"
        >
          <span
            className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 bg-[var(--sf-card)] sm:h-20 sm:w-20 ${
              active === c.name ? "border-[var(--sf-accent)]" : "border-transparent"
            }`}
          >
            {c.imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={cldUrl(c.imageUrl, 160)} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
            ) : (
              <span className="text-lg font-bold text-[var(--sf-muted)]">{c.name[0]}</span>
            )}
          </span>
          <span className="line-clamp-1 text-center text-[11px] font-medium text-[var(--sf-muted)]">{c.name}</span>
        </Link>
      ))}
    </div>
  );
}
