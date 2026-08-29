"use client";

import { useState } from "react";
import { addToCart } from "./cart-store";
import { pixel } from "@/components/tracking/Pixel";
import { storefrontEvent } from "./StorefrontTracker";

export function AddToCartButton({
  product,
  soldOut,
  currency,
  storeSlug,
}: {
  product: { id: string; name: string; price: number; image: string | null; slug: string };
  soldOut: boolean;
  currency: string;
  storeSlug: string;
}) {
  const [added, setAdded] = useState(false);
  void currency;

  if (soldOut) {
    return (
      <button
        disabled
        className="w-full cursor-not-allowed rounded-[var(--sf-radius)] border border-[var(--sf-line)] px-5 py-3 text-sm font-semibold text-[var(--sf-muted)]"
      >
        Sold out
      </button>
    );
  }

  return (
    <button
      onClick={() => {
        addToCart(storeSlug, product);
        pixel.track("AddToCart", { content_name: product.name, value: product.price, currency });
        storefrontEvent(storeSlug, "add_to_cart", { productId: product.id, value: product.price });
        setAdded(true);
        setTimeout(() => setAdded(false), 1600);
      }}
      className="w-full rounded-[var(--sf-radius)] bg-[var(--sf-accent)] px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
    >
      {added ? "Added to cart ✓" : "Add to cart"}
    </button>
  );
}
