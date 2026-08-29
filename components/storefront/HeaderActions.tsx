"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, ShoppingBag } from "lucide-react";
import { cartCount } from "./cart-store";
import { readWishlist } from "./wishlist-store";

/** Cart + wishlist counters in the storefront header. */
export function HeaderActions({ storeSlug, basePath }: { storeSlug: string; basePath: string }) {
  const [cart, setCart] = useState(0);
  const [wish, setWish] = useState(0);

  useEffect(() => {
    const sync = () => {
      setCart(cartCount(storeSlug));
      setWish(readWishlist(storeSlug).length);
    };
    sync();
    const onCart = () => setCart(cartCount(storeSlug));
    const onWish = () => setWish(readWishlist(storeSlug).length);
    window.addEventListener("zotomic-cart", onCart);
    window.addEventListener("zotomic-wishlist", onWish);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("zotomic-cart", onCart);
      window.removeEventListener("zotomic-wishlist", onWish);
      window.removeEventListener("storage", sync);
    };
  }, [storeSlug]);

  const badge = (n: number) =>
    n > 0 ? (
      <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--sf-accent)] px-1 text-[10px] font-bold text-white">
        {n}
      </span>
    ) : null;

  return (
    <div className="flex items-center gap-1">
      <Link href={`${basePath}/wishlist`} className="relative rounded-[var(--sf-radius)] p-2" aria-label="Wishlist">
        <Heart className="h-5 w-5" />
        {badge(wish)}
      </Link>
      <Link href={`${basePath}/cart`} className="relative rounded-[var(--sf-radius)] p-2" aria-label="Cart">
        <ShoppingBag className="h-5 w-5" />
        {badge(cart)}
      </Link>
    </div>
  );
}
