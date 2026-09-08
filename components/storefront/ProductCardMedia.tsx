"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Check, Eye, Flame, Plus, Star, X } from "lucide-react";
import { money } from "@/lib/money";
import { cldUrl } from "@/lib/cloudinary";
import { WishlistHeart } from "./WishlistHeart";
import { addToCart } from "./cart-store";
import { pixel } from "@/components/tracking/Pixel";
import { storefrontEvent } from "./StorefrontTracker";
import type { ProductBadge } from "@/lib/storefront/store";

const BADGE_STYLE: Record<Exclude<ProductBadge, null>, string> = {
  sale: "bg-[var(--sf-accent)] text-white",
  hot: "bg-red-600 text-white",
  best: "bg-amber-500 text-white",
  new: "bg-[var(--sf-fg)] text-[var(--sf-bg)]",
};
const BADGE_LABEL: Record<Exclude<ProductBadge, null>, string> = {
  sale: "Sale",
  hot: "Hot",
  best: "Best",
  new: "New",
};

export interface CardMediaProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  salePrice: number | null;
  image: string | null;
  description: string | null;
  rating: number;
  reviewCount: number;
  sold: number;
  stockLeft: number | null; // null = not tracked / not low
  badge: ProductBadge;
  hasVariants: boolean;
}

export function ProductCardMedia({
  product,
  currency,
  href,
  storeSlug,
}: {
  product: CardMediaProduct;
  currency: string;
  href: string;
  storeSlug?: string;
}) {
  const router = useRouter();
  const [quick, setQuick] = useState(false);
  const [added, setAdded] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!quick) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setQuick(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [quick]);

  const soldOut = product.stockLeft === 0;
  const price = product.salePrice ?? product.price;
  const lowStock = product.stockLeft != null && product.stockLeft > 0 && product.stockLeft <= 5;

  const iconBtn =
    "flex h-8 w-8 items-center justify-center rounded-full bg-[var(--sf-bg)]/90 text-[var(--sf-fg)] shadow-sm backdrop-blur transition-colors hover:text-[var(--sf-accent)]";

  const quickAdd = () => {
    if (soldOut) return;
    if (product.hasVariants) {
      router.push(href);
      return;
    }
    addToCart(storeSlug ?? "", {
      id: product.id,
      productId: product.id,
      name: product.name,
      price,
      image: product.image,
      slug: product.slug,
    });
    pixel.track("AddToCart", { content_name: product.name, value: price, currency });
    if (storeSlug) storefrontEvent(storeSlug, "add_to_cart", { productId: product.id, value: price });
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  };

  return (
    <div className="relative aspect-square">
      <div className="absolute inset-0 overflow-hidden rounded-[var(--sf-radius-lg)] bg-[var(--sf-card)]">
        <Link href={href} className="block h-full w-full">
          {product.image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={cldUrl(product.image, 600)}
              alt={product.name}
              width={600}
              height={600}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-[var(--sf-muted)]">No image</div>
          )}
        </Link>
      </div>

      {/* top-left: quick view, then wishlist */}
      <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
        <button type="button" aria-label="Quick view" className={iconBtn} onClick={() => setQuick(true)}>
          <Eye className="h-4 w-4" />
        </button>
        {storeSlug && (
          <WishlistHeart
            storeSlug={storeSlug}
            item={{ id: product.id, name: product.name, price, image: product.image, slug: product.slug }}
            size={16}
            className={iconBtn}
          />
        )}
      </div>

      {/* top-right: one badge (or sold-out) */}
      {soldOut ? (
        <span className="absolute right-2.5 top-2.5 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">
          Sold out
        </span>
      ) : product.badge ? (
        <span
          className={`absolute right-2.5 top-2.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${BADGE_STYLE[product.badge]}`}
        >
          {BADGE_LABEL[product.badge]}
        </span>
      ) : null}

      {/* bottom-left: rating · sold · low stock */}
      {(product.reviewCount > 0 || product.sold > 0 || lowStock) && (
        <div className="pointer-events-none absolute bottom-2.5 left-2.5 flex flex-wrap items-center gap-1.5">
          {product.reviewCount > 0 && (
            <span className="flex items-center gap-0.5 rounded-full bg-[var(--sf-bg)]/90 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--sf-fg)] backdrop-blur">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {product.rating.toFixed(1)}
            </span>
          )}
          {product.sold > 0 && (
            <span className="flex items-center gap-0.5 rounded-full bg-[var(--sf-bg)]/90 px-1.5 py-0.5 text-[11px] font-medium text-[var(--sf-muted)] backdrop-blur">
              <Flame className="h-3 w-3" />
              {product.sold}
            </span>
          )}
          {lowStock && (
            <span className="rounded-full bg-red-600/95 px-1.5 py-0.5 text-[11px] font-semibold text-white">
              {product.stockLeft} left
            </span>
          )}
        </div>
      )}

      {/* bottom-right: floating quick-add (overhangs the frame) */}
      {!soldOut && (
        <button
          type="button"
          onClick={quickAdd}
          aria-label={product.hasVariants ? "Choose options" : "Add to cart"}
          className="absolute -bottom-3 right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--sf-accent)] text-white shadow-lg ring-4 ring-[var(--sf-bg)] transition-transform hover:scale-105 active:scale-95"
        >
          {added ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        </button>
      )}

      {quick &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
            onMouseDown={(e) => e.target === e.currentTarget && setQuick(false)}
          >
            <div
              style={{ fontFamily: "inherit" }}
              className="w-full max-w-lg overflow-hidden rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] bg-[var(--sf-bg)] text-[var(--sf-fg)] shadow-[var(--sf-shadow)]"
            >
              <div className="flex items-center justify-between border-b border-[var(--sf-line)] px-4 py-2.5">
                <p className="text-sm font-semibold">Quick view</p>
                <button onClick={() => setQuick(false)} aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <div className="aspect-square overflow-hidden rounded-[var(--sf-radius)] bg-[var(--sf-card)]">
                  {product.image && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={cldUrl(product.image, 700)} alt={product.name} className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold">{product.name}</p>
                  <p className="mt-1 text-sm">
                    {product.salePrice != null ? (
                      <>
                        <span className="font-semibold">{money(product.salePrice, currency)}</span>{" "}
                        <span className="text-[var(--sf-muted)] line-through">{money(product.price, currency)}</span>
                      </>
                    ) : (
                      <span className="font-semibold">{money(product.price, currency)}</span>
                    )}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--sf-muted)]">
                    {product.reviewCount > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {product.rating.toFixed(1)} ({product.reviewCount})
                      </span>
                    )}
                    {product.sold > 0 && <span>{product.sold} sold</span>}
                    {lowStock && <span className="font-semibold text-red-600">Only {product.stockLeft} left</span>}
                  </div>
                  {product.description && (
                    <p className="mt-2 line-clamp-4 text-xs text-[var(--sf-muted)]">{product.description}</p>
                  )}
                  <Link
                    href={href}
                    className="mt-3 inline-block rounded-[var(--sf-radius)] bg-[var(--sf-accent)] px-4 py-2 text-xs font-semibold text-white"
                  >
                    View full details
                  </Link>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
