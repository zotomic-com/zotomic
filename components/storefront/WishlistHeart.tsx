"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { inWishlist, toggleWishlist, type WishItem } from "./wishlist-store";
import { storefrontEvent } from "./StorefrontTracker";

export function WishlistHeart({
  storeSlug,
  item,
  className = "",
  size = 16,
}: {
  storeSlug: string;
  item: WishItem;
  className?: string;
  size?: number;
}) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(inWishlist(storeSlug, item.id)), [storeSlug, item.id]);

  return (
    <button
      type="button"
      aria-label={on ? "Remove from wishlist" : "Add to wishlist"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const now = toggleWishlist(storeSlug, item);
        setOn(now);
        if (now) storefrontEvent(storeSlug, "add_to_wishlist", { productId: item.id, value: item.price });
      }}
      className={className}
    >
      <Heart
        style={{ width: size, height: size }}
        fill={on ? "var(--sf-accent)" : "none"}
        stroke={on ? "var(--sf-accent)" : "currentColor"}
      />
    </button>
  );
}
