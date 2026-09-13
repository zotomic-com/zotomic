"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, ShoppingCart } from "lucide-react";
import { PageHero } from "@/components/site/marketing";
import { Button } from "@/components/ui/button";
import { readCart, removeFromCart, type DomainCartItem } from "@/lib/domains/cart-store";

export default function CartPage() {
  const [items, setItems] = useState<DomainCartItem[]>([]);

  useEffect(() => {
    setItems(readCart());
  }, []);

  const remove = (id: string) => {
    removeFromCart(id);
    setItems(readCart());
  };

  const subtotal = items.reduce((sum, i) => sum + (i.priceBDT ?? 0), 0);

  return (
    <>
      <PageHero eyebrow="Cart" title="Your cart" subtitle="Review your domains before checking out." />
      <div className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
        {items.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-8 text-center">
            <ShoppingCart className="mx-auto h-8 w-8 text-fg-subtle" />
            <p className="mt-3 text-sm text-fg-muted">Your cart is empty.</p>
            <Link href="/domains" className="mt-4 inline-block">
              <Button size="sm">Search a domain</Button>
            </Link>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {items.map((i) => (
                <li key={i.id} className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 shadow-sm">
                  <div>
                    <p className="font-medium text-fg">{i.domainName}</p>
                    <p className="text-xs text-fg-subtle uppercase">{i.type === "transfer" ? "Transfer in" : "New registration"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-navy">{i.priceBDT != null ? `৳${i.priceBDT}` : "at checkout"}</span>
                    <button onClick={() => remove(i.id)} className="text-fg-subtle hover:text-danger" aria-label="Remove">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-center justify-between rounded-lg border border-primary bg-primary-soft p-4">
              <span className="font-semibold text-navy">Subtotal (estimate)</span>
              <span className="font-bold text-navy">৳{subtotal}</span>
            </div>
            <Link href="/checkout" className="mt-4 block">
              <Button className="w-full">Checkout</Button>
            </Link>
          </>
        )}
      </div>
    </>
  );
}
