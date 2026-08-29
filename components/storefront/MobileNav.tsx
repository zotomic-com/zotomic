"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Home, Phone, ShoppingBag, Store } from "lucide-react";
import { cartCount } from "./cart-store";
import { readWishlist } from "./wishlist-store";

/** Icon bottom-nav for mobile storefront visitors. Hidden ≥ sm. */
export function MobileNav({ storeSlug, basePath }: { storeSlug: string; basePath: string }) {
  const pathname = usePathname();
  const [cart, setCart] = useState(0);
  const [wish, setWish] = useState(0);

  useEffect(() => {
    const sync = () => {
      setCart(cartCount(storeSlug));
      setWish(readWishlist(storeSlug).length);
    };
    sync();
    window.addEventListener("zotomic-cart", sync);
    window.addEventListener("zotomic-wishlist", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("zotomic-cart", sync);
      window.removeEventListener("zotomic-wishlist", sync);
      window.removeEventListener("storage", sync);
    };
  }, [storeSlug]);

  const b = (h: string) => `${basePath}${h === "/" ? "" : h}` || "/";
  const items = [
    { href: b("/"), label: "Home", icon: Home, exact: true },
    { href: b("/products"), label: "Shop", icon: Store },
    { href: b("/wishlist"), label: "Saved", icon: Heart, count: wish },
    { href: b("/cart"), label: "Cart", icon: ShoppingBag, count: cart },
    { href: b("/contact"), label: "Contact", icon: Phone },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--sf-line)] bg-[var(--sf-bg)]/95 backdrop-blur sm:hidden">
      <ul className="mx-auto flex max-w-md">
        {items.map((it) => {
          const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
          const Icon = it.icon;
          return (
            <li key={it.label} className="flex-1">
              <Link
                href={it.href}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                  active ? "text-[var(--sf-accent)]" : "text-[var(--sf-muted)]"
                }`}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {it.count ? (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--sf-accent)] px-1 text-[9px] font-bold text-white">
                      {it.count}
                    </span>
                  ) : null}
                </span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
