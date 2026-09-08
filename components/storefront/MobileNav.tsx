"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Home, Search, ShoppingBag, User } from "lucide-react";
import { cartCount } from "./cart-store";
import { readWishlist } from "./wishlist-store";

/** Floating pill bottom-nav for mobile storefront visitors. Hidden ≥ sm. */
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
  const side = [
    { href: b("/"), label: "Home", icon: Home, exact: true },
    { href: b("/products"), label: "Shop", icon: Search },
    { href: b("/wishlist"), label: "Saved", icon: Heart, count: wish },
    { href: b("/account"), label: "Account", icon: User },
  ];
  const cartHref = b("/cart");
  const cartActive = pathname.startsWith(cartHref);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
      <div className="relative flex w-full max-w-sm items-center justify-around rounded-full border border-[var(--sf-line)] bg-[var(--sf-bg)]/95 px-2 py-1.5 shadow-[var(--sf-shadow)] backdrop-blur">
        {side.slice(0, 2).map((it) => (
          <NavItem key={it.label} {...it} active={it.exact ? pathname === it.href : pathname.startsWith(it.href)} />
        ))}

        {/* raised centre cart */}
        <Link
          href={cartHref}
          aria-label="Cart"
          className="relative -mt-6 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--sf-accent)] text-white shadow-lg ring-4 ring-[var(--sf-bg)]"
        >
          <ShoppingBag className="h-5 w-5" />
          {cart > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
              {cart}
            </span>
          )}
          <span className="sr-only">{cartActive ? "(current)" : ""}</span>
        </Link>

        {side.slice(2).map((it) => (
          <NavItem key={it.label} {...it} active={pathname.startsWith(it.href)} />
        ))}
      </div>
    </nav>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  count,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  count?: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`relative flex flex-1 flex-col items-center gap-0.5 py-1 text-[10px] font-medium ${
        active ? "text-[var(--sf-accent)]" : "text-[var(--sf-muted)]"
      }`}
    >
      <span className="relative">
        <Icon className="h-5 w-5" />
        {count ? (
          <span className="absolute -right-2 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--sf-accent)] px-1 text-[8px] font-bold text-white">
            {count}
          </span>
        ) : null}
      </span>
      {label}
    </Link>
  );
}
