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

export function QuickAdd({
  product,
  currency,
  storeSlug,
  basePath = "",
  hasVariants,
  soldOut,
  showBuyNow = true,
}: {
  product: { id: string; name: string; price: number; image: string | null; slug: string };
  currency: string;
  storeSlug: string;
  basePath?: string;
  hasVariants: boolean;
  soldOut: boolean;
  showBuyNow?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<"cart" | "buy">("cart");
  const [variants, setVariants] = useState<V[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState("");
  const [done, setDone] = useState(false);

  const flash = () => {
    setDone(true);
    setTimeout(() => setDone(false), 1400);
  };

  const goCheckout = () => router.push(`${basePath}/checkout`);

  const addSimple = (buy: boolean) => {
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
    if (buy) goCheckout();
    else flash();
  };

  const openPicker = async (buy: boolean) => {
    setIntent(buy ? "buy" : "cart");
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

  const addVariant = () => {
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
    setOpen(false);
    if (intent === "buy") goCheckout();
    else flash();
  };

  if (soldOut) {
    return <span className="mt-2 block text-center text-xs font-semibold text-[var(--sf-muted)]">Sold out</span>;
  }

  const btn =
    "mt-2 w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)] py-2 text-xs font-semibold hover:border-[var(--sf-accent)] hover:text-[var(--sf-accent)]";
  const buyBtn =
    "mt-1.5 w-full rounded-[var(--sf-radius)] bg-[var(--sf-accent)] py-2 text-xs font-semibold text-white hover:opacity-90";

  if (open) {
    return (
      <div className="mt-2 space-y-1.5">
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
            <button onClick={addVariant} disabled={!chosen} className={`${btn} mt-0 disabled:opacity-50`}>
              {intent === "buy" ? "Buy now" : "Add to cart"}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <button onClick={() => (hasVariants ? openPicker(false) : addSimple(false))} className={btn}>
        {done ? "Added ✓" : hasVariants ? "Choose options" : "Add to cart"}
      </button>
      {showBuyNow && (
        <button onClick={() => (hasVariants ? openPicker(true) : addSimple(true))} className={buyBtn}>
          Buy now
        </button>
      )}
    </>
  );
}
