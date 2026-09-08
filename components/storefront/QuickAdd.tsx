"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addToCart } from "./cart-store";
import { pixel } from "@/components/tracking/Pixel";
import { storefrontEvent } from "./StorefrontTracker";

interface V {
  id: string;
  name: string;
  price: number;
  salePrice: number | null;
  soldOut: boolean;
}

/** Card-level "Buy now" (add-to-cart is the floating + on the image). */
export function QuickAdd({
  product,
  currency,
  storeSlug,
  basePath = "",
  hasVariants,
  soldOut,
}: {
  product: { id: string; name: string; price: number; image: string | null; slug: string };
  currency: string;
  storeSlug: string;
  basePath?: string;
  hasVariants: boolean;
  soldOut: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [variants, setVariants] = useState<V[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState("");

  const goCheckout = () => router.push(`${basePath}/checkout`);

  const buySimple = () => {
    addToCart(storeSlug, {
      id: product.id,
      productId: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      slug: product.slug,
    });
    pixel.track("AddToCart", { content_name: product.name, value: product.price, currency });
    storefrontEvent(storeSlug, "add_to_cart", { productId: product.id, value: product.price });
    goCheckout();
  };

  const openPicker = async () => {
    setOpen(true);
    if (variants) return;
    setLoading(true);
    try {
      const r = await fetch(
        `/api/storefront/variants?store=${encodeURIComponent(storeSlug)}&handle=${encodeURIComponent(product.slug)}`,
      );
      const d = await r.json();
      setVariants(Array.isArray(d.variants) ? d.variants : []);
    } catch {
      setVariants([]);
    } finally {
      setLoading(false);
    }
  };

  const buyVariant = () => {
    const v = variants?.find((x) => x.id === chosen);
    if (!v) return;
    const unit = v.salePrice ?? v.price;
    addToCart(storeSlug, {
      id: v.id,
      productId: product.id,
      variantId: v.id,
      variantLabel: v.name,
      name: `${product.name} — ${v.name}`,
      price: unit,
      image: product.image,
      slug: product.slug,
    });
    pixel.track("AddToCart", { content_name: product.name, value: unit, currency });
    storefrontEvent(storeSlug, "add_to_cart", { productId: product.id, value: unit });
    goCheckout();
  };

  if (soldOut) {
    return <span className="block text-center text-xs font-semibold text-[var(--sf-muted)]">Sold out</span>;
  }

  const btn =
    "w-full rounded-[var(--sf-radius)] bg-[var(--sf-accent)] py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90";

  if (open && hasVariants) {
    return (
      <div className="space-y-1.5">
        {loading ? (
          <p className="text-center text-xs text-[var(--sf-muted)]">Loading…</p>
        ) : (
          <>
            <select
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
              className="w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-bg)] px-2 py-1.5 text-xs"
            >
              <option value="">Select…</option>
              {(variants ?? []).map((v) => (
                <option key={v.id} value={v.id} disabled={v.soldOut}>
                  {v.name}
                  {v.soldOut ? " — sold out" : ""}
                </option>
              ))}
            </select>
            <button onClick={buyVariant} disabled={!chosen} className={`${btn} disabled:opacity-50`}>
              Buy now
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <button onClick={() => (hasVariants ? openPicker() : buySimple())} className={btn}>
      Buy now
    </button>
  );
}
