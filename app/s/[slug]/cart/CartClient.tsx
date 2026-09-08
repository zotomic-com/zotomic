"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { money } from "@/lib/money";
import { cldUrl } from "@/lib/cloudinary";
import { readCart, writeCart, type CartItem } from "@/components/storefront/cart-store";
import { QtyStepper } from "@/components/storefront/QtyStepper";

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
      <div className="py-16 text-center">
        <p className="text-sm text-[var(--sf-muted)]">Your cart is empty.</p>
        <Link
          href={`${basePath}/products`}
          className="mt-4 inline-block rounded-full bg-[var(--sf-accent)] px-6 py-2.5 text-sm font-semibold text-white"
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
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <ul className="space-y-3">
        {items.map((i) => (
          <li key={i.id} className="flex gap-4 rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] p-3">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[var(--sf-radius)] bg-[var(--sf-card)]">
              {i.image && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={cldUrl(i.image, 200)} alt={i.name} className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="text-sm font-medium">{i.name}</p>
              <p className="mt-0.5 text-sm text-[var(--sf-muted)]">{money(i.price, currency)}</p>
              <div className="mt-auto flex items-center gap-3 pt-2">
                <QtyStepper qty={i.qty} onChange={(n) => update(i.id, n)} min={0} size="sm" />
                <button
                  onClick={() => update(i.id, 0)}
                  className="text-[var(--sf-muted)] hover:text-red-600"
                  aria-label="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <p className="text-sm font-semibold">{money(i.price * i.qty, currency)}</p>
          </li>
        ))}
      </ul>

      <div className="h-fit rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] bg-[var(--sf-card)] p-5 lg:sticky lg:top-24">
        <p className="text-sm font-bold">Order summary</p>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--sf-muted)]">Subtotal</span>
            <span>{money(subtotal, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--sf-muted)]">Shipping</span>
            <span>{ship === 0 ? "Free" : money(ship, currency)}</span>
          </div>
          {freeOver != null && ship > 0 && (
            <p className="text-xs text-[var(--sf-muted)]">
              Add {money(freeOver - subtotal, currency)} for free shipping
            </p>
          )}
          <div className="flex justify-between border-t border-[var(--sf-line)] pt-2 text-base font-bold">
            <span>Total</span>
            <span>{money(total, currency)}</span>
          </div>
        </div>
        <Link
          href={`${basePath}/checkout`}
          className="mt-4 block rounded-full bg-[var(--sf-accent)] px-5 py-3 text-center text-sm font-semibold text-white"
        >
          Checkout
        </Link>
        <Link
          href={`${basePath}/products`}
          className="mt-2 block text-center text-xs text-[var(--sf-muted)] hover:underline"
        >
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
