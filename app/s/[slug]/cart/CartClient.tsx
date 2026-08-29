"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { money } from "@/lib/money";
import { readCart, writeCart, type CartItem } from "@/components/storefront/cart-store";

export function CartClient({
  storeSlug,
  basePath,
  currency,
  shipping,
  freeOver,
}: {
  storeSlug: string;
  basePath: string;
  currency: string;
  shipping: number;
  freeOver: number | null;
}) {
  const [items, setItems] = useState<CartItem[] | null>(null);

  useEffect(() => {
    setItems(readCart(storeSlug));
  }, [storeSlug]);

  const update = (id: string, qty: number) => {
    const next = readCart(storeSlug)
      .map((i) => (i.id === id ? { ...i, qty: Math.max(0, qty) } : i))
      .filter((i) => i.qty > 0);
    writeCart(storeSlug, next);
    setItems(next);
  };

  if (items === null) return <p className="text-sm text-[var(--sf-muted)]">Loading…</p>;

  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-[var(--sf-muted)]">Your cart is empty.</p>
        <Link
          href={`${basePath}/products`}
          className="mt-4 inline-block rounded-[var(--sf-radius)] bg-[var(--sf-accent)] px-5 py-2.5 text-sm font-semibold text-white"
        >
          Browse products
        </Link>
      </div>
    );
  }

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const ship = freeOver && subtotal >= freeOver ? 0 : shipping;
  const total = subtotal + ship;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <ul className="divide-y divide-[var(--sf-line)]">
        {items.map((i) => (
          <li key={i.id} className="flex gap-4 py-4">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[var(--sf-radius)] bg-[var(--sf-card)]">
              {i.image && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={i.image} alt={i.name} className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{i.name}</p>
              <p className="mt-0.5 text-sm text-[var(--sf-muted)]">{money(i.price, currency)}</p>
              <div className="mt-2 flex items-center gap-2">
                <button onClick={() => update(i.id, i.qty - 1)} className="h-7 w-7 rounded-[var(--sf-radius)] border border-[var(--sf-line)]">−</button>
                <span className="w-8 text-center text-sm">{i.qty}</span>
                <button onClick={() => update(i.id, i.qty + 1)} className="h-7 w-7 rounded-[var(--sf-radius)] border border-[var(--sf-line)]">+</button>
                <button onClick={() => update(i.id, 0)} className="ml-auto text-xs text-[var(--sf-muted)] underline">
                  Remove
                </button>
              </div>
            </div>
            <p className="text-sm font-semibold">{money(i.price * i.qty, currency)}</p>
          </li>
        ))}
      </ul>

      <div className="h-fit rounded-[var(--sf-radius)] border border-[var(--sf-line)] p-5">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--sf-muted)]">Subtotal</span>
            <span>{money(subtotal, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--sf-muted)]">Shipping</span>
            <span>{ship === 0 ? "Free" : money(ship, currency)}</span>
          </div>
          <div className="flex justify-between border-t border-[var(--sf-line)] pt-2 font-bold">
            <span>Total</span>
            <span>{money(total, currency)}</span>
          </div>
        </div>
        <Link
          href={`${basePath}/checkout`}
          className="mt-4 block rounded-[var(--sf-radius)] bg-[var(--sf-accent)] px-5 py-3 text-center text-sm font-semibold text-white"
        >
          Checkout
        </Link>
      </div>
    </div>
  );
}
