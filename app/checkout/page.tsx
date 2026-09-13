"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { PageHero } from "@/components/site/marketing";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { readCart, clearCart, type DomainCartItem } from "@/lib/domains/cart-store";

interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export default function CheckoutPage() {
  const [items, setItems] = useState<DomainCartItem[] | null>(null);
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined); // undefined = still loading
  const [form, setForm] = useState({ name: "", phone: "", email: "", paymentMethod: "bkash" as "bkash" | "nagad" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<{ orderNumber: string; invoiceAmount: number; payTo: string } | null>(null);

  useEffect(() => {
    setItems(readCart());
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setUser(d?.user ?? null);
        if (d?.user) {
          setForm((f) => ({ ...f, name: d.user.name ?? "", email: d.user.email ?? "" }));
        }
      })
      .catch(() => setUser(null));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!items || items.length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/domains/cart/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ type: i.type, domainName: i.domainName, authCode: i.authCode, pointTo: i.pointTo, forwardToEmail: i.forwardToEmail })),
          customerName: form.name,
          customerPhone: form.phone,
          customerEmail: form.email || undefined,
          paymentMethod: form.paymentMethod,
        }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        setConfirmation({ orderNumber: d.orderNumber, invoiceAmount: d.invoiceAmount, payTo: d.payTo });
        clearCart();
      } else {
        setError(d.error ?? "Could not place the order.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmation) {
    return (
      <>
        <PageHero eyebrow="Checkout" title="Order placed" />
        <div className="mx-auto max-w-lg px-4 pb-16 sm:px-6">
          <div className="rounded-lg border border-primary bg-primary-soft p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-3 text-lg font-extrabold text-navy">Order {confirmation.orderNumber} placed</p>
            <div className="mt-5 rounded-lg border border-border bg-surface p-4 text-left">
              <p className="text-sm text-fg-muted">
                Send exactly <span className="font-mono text-base font-bold text-navy">৳{confirmation.invoiceAmount.toFixed(2)}</span> via{" "}
                <span className="font-semibold uppercase">{form.paymentMethod}</span> Send Money to
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-navy">{confirmation.payTo}</p>
              <p className="mt-3 text-xs text-fg-subtle">
                Send the exact amount shown — it&apos;s how we match your payment automatically. Your domain(s) activate within a
                few minutes of payment.
              </p>
            </div>
            <Link href="/app/domains" className="mt-5 inline-block">
              <Button size="sm">Go to your domains</Button>
            </Link>
          </div>
        </div>
      </>
    );
  }

  if (items && items.length === 0) {
    return (
      <>
        <PageHero eyebrow="Checkout" title="Your cart is empty" />
        <div className="mx-auto max-w-lg px-4 pb-16 text-center sm:px-6">
          <Link href="/domains">
            <Button size="sm">Search a domain</Button>
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHero eyebrow="Checkout" title="Checkout" subtitle="Pay once for everything in your cart." />
      <div className="mx-auto max-w-lg px-4 pb-16 sm:px-6">
        {items === null || user === undefined ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-fg-subtle" />
          </div>
        ) : !user ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-center">
            <p className="text-sm text-fg-muted">You&apos;ll need a free Zotomic account to complete this purchase.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Link href="/login?next=/checkout">
                <Button size="sm" variant="outline">Log in</Button>
              </Link>
              <Link href="/signup?next=/checkout">
                <Button size="sm">Sign up</Button>
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-surface p-6 shadow-sm">
            <ul className="space-y-1 border-b border-border pb-3 text-sm">
              {items.map((i) => (
                <li key={i.id} className="flex justify-between">
                  <span>{i.domainName}</span>
                  <span>{i.priceBDT != null ? `৳${i.priceBDT}` : "quoted at review"}</span>
                </li>
              ))}
            </ul>
            <Field label="Your name">
              <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Phone number">
              <Input required value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="01XXXXXXXXX" />
            </Field>
            <Field label="Email (optional)">
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </Field>
            <Field label="Pay with">
              <Select value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value as "bkash" | "nagad" }))}>
                <option value="bkash">bKash</option>
                <option value="nagad">Nagad</option>
              </Select>
            </Field>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Placing order…" : "Place order"}
            </Button>
          </form>
        )}
      </div>
    </>
  );
}
