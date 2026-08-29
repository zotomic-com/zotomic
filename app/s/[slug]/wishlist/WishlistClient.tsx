"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { money } from "@/lib/money";
import { cldUrl } from "@/lib/cloudinary";
import { readWishlist, removeWish, type WishItem } from "@/components/storefront/wishlist-store";
import { addToCart } from "@/components/storefront/cart-store";

export function WishlistClient({
  storeSlug,
  basePath,
  currency,
}: {
  storeSlug: string;
  basePath: string;
  currency: string;
}) {
  const [items, setItems] = useState<WishItem[] | null>(null);

  useEffect(() => {
    setItems(readWishlist(storeSlug));
    const sync = () => setItems(readWishlist(storeSlug));
    window.addEventListener("zotomic-wishlist", sync);
    return () => window.removeEventListener("zotomic-wishlist", sync);
  }, [storeSlug]);

  if (items === null) return <p className="text-sm text-[var(--sf-muted)]">Loading…</p>;

  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-[var(--sf-muted)]">Your wishlist is empty.</p>
        <Link
          href={`${basePath}/products`}
          className="mt-4 inline-block rounded-[var(--sf-radius)] bg-[var(--sf-accent)] px-5 py-2.5 text-sm font-semibold text-white"
        >
          Browse products
        </Link>
      </div>
    );
  }

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${basePath}/wishlist?items=${items.map((i) => i.slug).join(",")}`
      : "";

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {items.map((i) => (
          <div key={i.id} className="rounded-[var(--sf-radius)] border border-[var(--sf-line)] p-3">
            <Link href={`${basePath}/products/${i.slug}`} className="block">
              <div className="relative aspect-square overflow-hidden rounded-[var(--sf-radius)] bg-[var(--sf-card)]">
                {i.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={cldUrl(i.image, 500)} alt={i.name} className="h-full w-full object-cover" loading="lazy" />
                ) : null}
              </div>
              <p className="mt-2 line-clamp-1 text-sm font-medium">{i.name}</p>
              <p className="text-sm font-semibold">{money(i.price, currency)}</p>
            </Link>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => {
                  addToCart(storeSlug, i);
                }}
                className="flex-1 rounded-[var(--sf-radius)] bg-[var(--sf-accent)] px-2 py-1.5 text-xs font-semibold text-white"
              >
                Add to cart
              </button>
              <button
                onClick={() => removeWish(storeSlug, i.id)}
                className="rounded-[var(--sf-radius)] border border-[var(--sf-line)] p-1.5"
                aria-label="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {shareUrl && (
        <button
          onClick={() => navigator.clipboard?.writeText(shareUrl)}
          className="mt-6 rounded-[var(--sf-radius)] border border-[var(--sf-line)] px-4 py-2 text-sm"
        >
          Copy shareable link
        </button>
      )}
    </div>
  );
}
