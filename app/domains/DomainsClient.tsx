"use client";

import { useState } from "react";
import { Search, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface PricedDomain {
  domain: string;
  available: boolean;
  wholesaleUsd: number | null;
  priceBDT: number | null;
}

type View = "search" | "order" | "confirmation";

export function DomainsClient() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<PricedDomain[] | null>(null);
  const [view, setView] = useState<View>("search");
  const [chosen, setChosen] = useState<PricedDomain | null>(null);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    forwardEmail: "",
    pointTo: "self" as "self" | "zotomic",
    paymentMethod: "bkash" as "bkash" | "nagad",
  });
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ orderNumber: string; invoiceAmount: number; payTo: string; domain: string; method: string } | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError("");
    setResults(null);
    try {
      const res = await fetch("/api/domains/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const d = await res.json();
      if (res.ok && d.ok) setResults(d.results);
      else setError(d.error ?? "Search failed.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  const startOrder = (domain: PricedDomain) => {
    setChosen(domain);
    setView("order");
  };

  const submitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/domains/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: chosen.domain,
          customerName: form.name,
          customerPhone: form.phone,
          customerEmail: form.email || undefined,
          forwardToEmail: form.forwardEmail || undefined,
          pointTo: form.pointTo,
          paymentMethod: form.paymentMethod,
        }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        setConfirmation({ orderNumber: d.orderNumber, invoiceAmount: d.invoiceAmount, payTo: d.payTo, domain: chosen.domain, method: form.paymentMethod });
        setView("confirmation");
      } else {
        setError(d.error ?? "Could not place the order.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (view === "confirmation" && confirmation) {
    return (
      <div className="mx-auto max-w-lg px-4 pb-16 sm:px-6">
        <div className="rounded-lg border border-primary bg-primary-soft p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 text-lg font-extrabold text-navy">Order {confirmation.orderNumber} placed</p>
          <p className="mt-1 text-sm text-fg-muted">{confirmation.domain}</p>
          <div className="mt-5 rounded-lg border border-border bg-surface p-4 text-left">
            <p className="text-sm text-fg-muted">
              Send exactly <span className="font-mono text-base font-bold text-navy">৳{confirmation.invoiceAmount.toFixed(2)}</span> via{" "}
              <span className="font-semibold uppercase">{confirmation.method}</span> Send Money to
            </p>
            <p className="mt-1 font-mono text-lg font-bold text-navy">{confirmation.payTo}</p>
            <p className="mt-3 text-xs text-fg-subtle">
              Send the exact amount shown — it&apos;s how we match your payment automatically. Your domain activates within a
              few minutes of payment; you&apos;ll get a confirmation once it&apos;s live.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (view === "order" && chosen) {
    return (
      <div className="mx-auto max-w-lg px-4 pb-16 sm:px-6">
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <p className="text-sm font-bold text-fg">{chosen.domain}</p>
          <p className="mt-1 text-2xl font-extrabold text-navy">৳{chosen.priceBDT}</p>
          <form onSubmit={submitOrder} className="mt-5 space-y-4">
            <Field label="Your name">
              <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Phone number">
              <Input required value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="01XXXXXXXXX" />
            </Field>
            <Field label="Email (optional)">
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </Field>
            <Field label="Forward mail to (optional)">
              <Input
                type="email"
                value={form.forwardEmail}
                onChange={(e) => setForm((f) => ({ ...f, forwardEmail: e.target.value }))}
                placeholder="you@gmail.com"
              />
            </Field>
            <Field label="What should this domain point to?">
              <Select value={form.pointTo} onChange={(e) => setForm((f) => ({ ...f, pointTo: e.target.value as "self" | "zotomic" }))}>
                <option value="self">I&apos;ll manage the DNS myself</option>
                <option value="zotomic">A Zotomic store I own</option>
              </Select>
            </Field>
            <Field label="Pay with">
              <Select value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value as "bkash" | "nagad" }))}>
                <option value="bkash">bKash</option>
                <option value="nagad">Nagad</option>
              </Select>
            </Field>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setView("search")}>
                Back
              </Button>
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? "Placing order…" : "Place order"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
      <form onSubmit={search} className="flex gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="yourshop.com" className="flex-1" />
        <Button type="submit" disabled={searching}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
        </Button>
      </form>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {results && (
        <ul className="mt-6 space-y-2">
          {results.map((r) => (
            <li
              key={r.domain}
              className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 shadow-sm"
            >
              <span className="flex items-center gap-2.5">
                {r.available ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-fg-subtle" />}
                <span className="font-medium text-fg">{r.domain}</span>
              </span>
              {r.available && r.priceBDT != null ? (
                <span className="flex items-center gap-3">
                  <span className="font-bold text-navy">৳{r.priceBDT}/yr</span>
                  <Button size="sm" onClick={() => startOrder(r)}>
                    Buy
                  </Button>
                </span>
              ) : (
                <span className="text-sm text-fg-subtle">{r.available ? "Unavailable" : "Taken"}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
