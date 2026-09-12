"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { money } from "@/lib/money";
import { cldUrl } from "@/lib/cloudinary";
import { readCart, writeCart, type CartItem } from "@/components/storefront/cart-store";
import { QtyStepper } from "@/components/storefront/QtyStepper";
import { StockLine, useLineStock } from "@/components/storefront/StockLine";
import type { DeliveryZone } from "@/lib/storefront/delivery";

export function CartClient({
  storeSlug,
  basePath,
  currency,
  deliveryZones,
  deliveryDefaultCharge,
  freeOver,
}: {
  storeSlug: string;
  basePath: string;
  currency: string;
  deliveryZones: DeliveryZone[];
  deliveryDefaultCharge: number;
  freeOver: number | null;
}) {
  const cheapestDelivery = Math.min(deliveryDefaultCharge, ...deliveryZones.map((z) => z.charge));
  const [items, setItems] = useState<CartItem[] | null>(null);
  const stock = useLineStock(storeSlug, (items ?? []).map((i) => i.variantId ?? i.productId));

  useEffect(() => {
    setItems(readCart(storeSlug));
  }, [storeSlug]);

  const update = (id: string, qty: number, cap?: number) => {
    const target = Math.max(0, cap != null ? Math.min(cap, qty) : qty);
    const next = readCart(storeSlug)
      .map((i) => (i.id === id ? { ...i, qty: target } : i))
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
  const freeShipping = !!(freeOver && subtotal >= freeOver);

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
              <StockLine info={stock[i.variantId ?? i.productId]} qty={i.qty} />
              <div className="mt-auto flex items-center gap-3 pt-2">
                {(() => {
                  const s = stock[i.variantId ?? i.productId];
                  const cap = s?.tracked ? Math.max(0, s.stock) : undefined;
                  return <QtyStepper qty={i.qty} onChange={(n) => update(i.id, n, cap)} min={0} max={cap} size="sm" />;
                })()}
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
            <span className="text-[var(--sf-muted)]">Delivery</span>
            <span>{freeShipping ? "Free" : `from ${money(cheapestDelivery, currency)}`}</span>
          </div>
          {!freeShipping && (
            <p className="text-xs text-[var(--sf-muted)]">
              Exact charge depends on your delivery area — shown at checkout.
              {freeOver != null && ` Add ${money(freeOver - subtotal, currency)} more for free delivery.`}
            </p>
          )}
          <div className="flex justify-between border-t border-[var(--sf-line)] pt-2 text-base font-bold">
            <span>Subtotal</span>
            <span>{money(subtotal, currency)}</span>
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
