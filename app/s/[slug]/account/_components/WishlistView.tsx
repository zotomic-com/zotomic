"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Heart, X } from "lucide-react";
import { money } from "@/lib/money";
import { cldUrl } from "@/lib/cloudinary";
import { addToCart } from "@/components/storefront/cart-store";
import { readWishlist, setWishlist, type WishItem } from "@/components/storefront/wishlist-store";
import type { WishlistRow } from "@/lib/storefront/wishlist";
import { toggleWishlistAction } from "../actions";

export function WishlistView({
  slug,
  basePath,
  currency,
  items: initial,
}: {
  slug: string;
  basePath: string;
  currency: string;
  items: WishlistRow[];
}) {
  const [items, setItems] = useState(initial);
  const [, start] = useTransition();

  // reconcile the on-device wishlist with the server list (server wins)
  useEffect(() => {
    const local = readWishlist(slug);
    const merged: WishItem[] = initial.map((r) => ({
      id: r.productId,
      name: r.name,
      price: r.salePrice ?? r.price,
      image: r.image,
      slug: r.slug,
    }));
    const localExtra = local.filter((l) => !initial.some((r) => r.productId === l.id));
    setWishlist(slug, [...merged, ...localExtra]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const remove = (productId: string) => {
    setItems((cur) => cur.filter((i) => i.productId !== productId));
    setWishlist(
      slug,
      readWishlist(slug).filter((i) => i.id !== productId),
    );
    start(() => {
      void toggleWishlistAction(slug, productId, false);
    });
  };

  if (items.length === 0) {
    return (
      <div className="rounded-[var(--sf-radius-lg)] border border-dashed border-[var(--sf-line)] p-10 text-center">
        <Heart className="mx-auto h-8 w-8 text-[var(--sf-muted)]" />
        <p className="mt-3 text-sm text-[var(--sf-muted)]">Nothing saved yet.</p>
        <Link
          href={`${basePath}/products`}
          className="mt-4 inline-block rounded-full bg-[var(--sf-accent)] px-5 py-2.5 text-sm font-semibold text-white"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((i) => (
        <div key={i.productId} className="overflow-hidden rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)]">
          <Link href={`${basePath}/products/${i.slug}`} className="block">
            <div className="relative aspect-square bg-[var(--sf-card)]">
              {i.image && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={cldUrl(i.image, 400)} alt={i.name} className="h-full w-full object-cover" loading="lazy" />
              )}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  remove(i.productId);
                }}
                aria-label="Remove"
                className="absolute right-1.5 top-1.5 rounded-full bg-[var(--sf-bg)]/90 p-1 text-[var(--sf-muted)] shadow"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="p-2.5">
              <p className="line-clamp-1 text-sm font-medium">{i.name}</p>
              <p className="text-sm font-semibold">
                {money(i.salePrice ?? i.price, currency)}
                {i.salePrice != null && (
                  <span className="ml-1.5 text-xs font-normal text-[var(--sf-muted)] line-through">
                    {money(i.price, currency)}
                  </span>
                )}
              </p>
            </div>
          </Link>
          <div className="px-2.5 pb-2.5">
            <button
              disabled={!i.inStock}
              onClick={() =>
                addToCart(slug, {
                  id: i.productId,
                  productId: i.productId,
                  name: i.name,
                  price: i.salePrice ?? i.price,
                  image: i.image,
                  slug: i.slug,
                })
              }
              className="w-full rounded-full bg-[var(--sf-accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {i.inStock ? "Add to cart" : "Out of stock"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
