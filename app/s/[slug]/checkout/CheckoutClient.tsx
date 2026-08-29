"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { money } from "@/lib/money";
import { readCart, writeCart, type CartItem } from "@/components/storefront/cart-store";

export function CheckoutClient({
  storeSlug,
  basePath,
  currency,
  shipping,
  freeOver,
  paymentOptions,
}: {
  storeSlug: string;
  basePath: string;
  currency: string;
  shipping: number;
  freeOver: number | null;
  paymentOptions: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[] | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", city: "", note: "" });
  const [method, setMethod] = useState(paymentOptions[0]?.id ?? "cod");
  const [status, setStatus] = useState<"idle" | "placing" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => setItems(readCart(storeSlug)), [storeSlug]);

  if (items === null) return <p className="text-sm text-[var(--sf-muted)]">Loading…</p>;
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--sf-muted)]">
        Your cart is empty. <Link href={`${basePath}/products`} className="underline">Browse products</Link>.
      </p>
    );
  }

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const ship = freeOver && subtotal >= freeOver ? 0 : shipping;
  const total = subtotal + ship;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("placing");
    setError("");
    try {
      const res = await fetch("/api/storefront/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeSlug,
          items: items.map((i) => ({ id: i.id, qty: i.qty })),
          customer: form,
          paymentMethod: method,
        }),
      });
      const d = await res.json();
      if (res.ok && d.ok && d.redirectUrl) {
        // keep the cart until payment succeeds (cleared on the order page)
        window.location.href = d.redirectUrl;
        return;
      }
      if (res.ok && d.ok) {
        writeCart(storeSlug, []);
        router.push(`${basePath}/order/${d.orderNumber}`);
      } else {
        setError(d.error ?? "Could not place the order.");
        setStatus("error");
      }
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  };

  const field = "h-10 w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-bg)] px-3 text-sm";

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <input required placeholder="Full name" className={field} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <input required placeholder="Phone number" className={field} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        <input type="email" placeholder="Email (optional)" className={field} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        <textarea required placeholder="Delivery address" rows={3} className={`${field} h-auto py-2`} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
        <input placeholder="City / area" className={field} value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
        <textarea placeholder="Order note (optional)" rows={2} className={`${field} h-auto py-2`} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />

        <div className="rounded-[var(--sf-radius)] border border-[var(--sf-line)] p-3 text-sm">
          <p className="mb-2 font-medium">Payment</p>
          <div className="space-y-1.5">
            {paymentOptions.map((o) => (
              <label key={o.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="method"
                  value={o.id}
                  checked={method === o.id}
                  onChange={() => setMethod(o.id)}
                />
                {o.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="h-fit rounded-[var(--sf-radius)] border border-[var(--sf-line)] p-5">
        <ul className="space-y-2 text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between">
              <span className="text-[var(--sf-muted)]">{i.name} × {i.qty}</span>
              <span>{money(i.price * i.qty, currency)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-[var(--sf-line)] pt-3 text-sm">
          <div className="flex justify-between"><span className="text-[var(--sf-muted)]">Subtotal</span><span>{money(subtotal, currency)}</span></div>
          <div className="flex justify-between"><span className="text-[var(--sf-muted)]">Shipping</span><span>{ship === 0 ? "Free" : money(ship, currency)}</span></div>
          <div className="flex justify-between font-bold"><span>Total</span><span>{money(total, currency)}</span></div>
        </div>
        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={status === "placing"}
          className="mt-4 w-full rounded-[var(--sf-radius)] bg-[var(--sf-accent)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {status === "placing" ? "Placing order…" : "Place order"}
        </button>
      </div>
    </form>
  );
}
