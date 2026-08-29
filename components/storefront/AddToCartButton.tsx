"use client";

import { useMemo, useState } from "react";
import { addToCart } from "./cart-store";
import { pixel } from "@/components/tracking/Pixel";
import { storefrontEvent } from "./StorefrontTracker";

interface Variant {
  id: string;
  name: string;
  options: Record<string, string>;
  price: number;
  salePrice: number | null;
  stockQty: number;
  soldOut: boolean;
}

export function AddToCartButton({
  product,
  soldOut,
  currency,
  storeSlug,
  options = [],
  variants = [],
}: {
  product: { id: string; name: string; price: number; image: string | null; slug: string };
  soldOut: boolean;
  currency: string;
  storeSlug: string;
  options?: { name: string; values: string[] }[];
  variants?: Variant[];
}) {
  const hasVariants = options.length > 0 && variants.length > 0;
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [added, setAdded] = useState(false);

  const selected = useMemo(() => {
    if (!hasVariants) return null;
    return (
      variants.find((v) => options.every((o) => v.options[o.name] === choice[o.name])) ?? null
    );
  }, [hasVariants, variants, options, choice]);

  const disabled = hasVariants ? !selected || selected.soldOut : soldOut;
  const label = hasVariants
    ? !selected
      ? "Select options"
      : selected.soldOut
        ? "Sold out"
        : added
          ? "Added to cart ✓"
          : "Add to cart"
    : soldOut
      ? "Sold out"
      : added
        ? "Added to cart ✓"
        : "Add to cart";

  const add = () => {
    const unit = hasVariants
      ? (selected!.salePrice ?? selected!.price)
      : product.price;
    addToCart(storeSlug, {
      id: selected?.id ?? product.id,
      productId: product.id,
      variantId: selected?.id,
      variantLabel: selected?.name,
      name: hasVariants ? `${product.name} — ${selected!.name}` : product.name,
      price: unit,
      image: product.image,
      slug: product.slug,
    });
    pixel.track("AddToCart", { content_name: product.name, value: unit, currency });
    storefrontEvent(storeSlug, "add_to_cart", { productId: product.id, value: unit });
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };

  return (
    <div className="space-y-3">
      {hasVariants &&
        options.map((o) => (
          <div key={o.name}>
            <p className="mb-1 text-xs font-semibold text-[var(--sf-muted)]">{o.name}</p>
            <div className="flex flex-wrap gap-2">
              {o.values.map((val) => {
                const active = choice[o.name] === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setChoice((c) => ({ ...c, [o.name]: val }))}
                    className={`rounded-[var(--sf-radius)] border px-3 py-1.5 text-sm ${
                      active
                        ? "border-[var(--sf-accent)] bg-[var(--sf-accent)] text-white"
                        : "border-[var(--sf-line)] text-[var(--sf-fg)]"
                    }`}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

      <button
        onClick={add}
        disabled={disabled}
        className={`w-full rounded-[var(--sf-radius)] px-5 py-3 text-sm font-semibold transition-opacity ${
          disabled
            ? "cursor-not-allowed border border-[var(--sf-line)] text-[var(--sf-muted)]"
            : "bg-[var(--sf-accent)] text-white hover:opacity-90"
        }`}
      >
        {label}
      </button>
    </div>
  );
}
