"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, CheckCircle2, XCircle, Loader2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { addToCart, cartCount, type DomainCartItem } from "@/lib/domains/cart-store";

interface PricedDomain {
  domain: string;
  available: boolean;
  wholesaleUsd: number | null;
  priceBDT: number | null;
  renewalPriceBDT: number | null;
}

export function DomainsClient() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<PricedDomain[] | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(0);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferDomain, setTransferDomain] = useState("");
  const [transferAuth, setTransferAuth] = useState("");
  const [transferAdded, setTransferAdded] = useState(false);

  useEffect(() => {
    setCount(cartCount());
  }, []);

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

  const queue = (r: PricedDomain) => {
    const item: DomainCartItem = {
      id: `register:${r.domain}`,
      type: "register",
      domainName: r.domain,
      pointTo: "self",
      priceBDT: r.priceBDT,
    };
    addToCart(item);
    setAdded((s) => new Set(s).add(r.domain));
    setCount(cartCount());
  };

  const buyNow = (r: PricedDomain) => {
    queue(r);
    router.push("/cart");
  };

  const addTransfer = () => {
    if (!transferDomain.trim() || !transferAuth.trim()) return;
    const item: DomainCartItem = {
      id: `transfer:${transferDomain.trim().toLowerCase()}`,
      type: "transfer",
      domainName: transferDomain.trim().toLowerCase(),
      authCode: transferAuth.trim(),
      pointTo: "self",
      priceBDT: null,
    };
    addToCart(item);
    setTransferAdded(true);
    setCount(cartCount());
  };

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
                <span>
                  <span className="font-medium text-fg">{r.domain}</span>
                  {r.available && r.priceBDT != null && (
                    <span className="block text-xs text-fg-subtle">
                      Register ৳{r.priceBDT}/yr
                      {r.renewalPriceBDT != null && r.renewalPriceBDT !== r.priceBDT && ` · Renews at ৳${r.renewalPriceBDT}/yr`}
                    </span>
                  )}
                </span>
              </span>
              {r.available && r.priceBDT != null ? (
                <span className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => queue(r)} disabled={added.has(r.domain)}>
                    {added.has(r.domain) ? "Added" : "Add to cart"}
                  </Button>
                  <Button size="sm" onClick={() => buyNow(r)}>
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

      <div className="mt-10 rounded-lg border border-border bg-surface p-5">
        <button
          onClick={() => setTransferOpen((o) => !o)}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Transfer a domain you already own →
        </button>
        {transferOpen && (
          <div className="mt-4 space-y-3">
            <Field label="Domain name">
              <Input value={transferDomain} onChange={(e) => setTransferDomain(e.target.value)} placeholder="yourdomain.com" />
            </Field>
            <Field label="Auth / EPP code" hint="Get this from your current registrar — transfers take about a week.">
              <Input value={transferAuth} onChange={(e) => setTransferAuth(e.target.value)} placeholder="e.g. aB3xY9zQ" />
            </Field>
            <Button size="sm" onClick={addTransfer} disabled={transferAdded || !transferDomain.trim() || !transferAuth.trim()}>
              {transferAdded ? "Added to cart" : "Add transfer to cart"}
            </Button>
          </div>
        )}
      </div>

      {count > 0 && (
        <div className="mt-6 flex items-center justify-between rounded-lg border border-primary bg-primary-soft p-4">
          <span className="flex items-center gap-2 text-sm font-semibold text-navy">
            <ShoppingCart className="h-4 w-4" /> {count} item{count > 1 ? "s" : ""} in your cart
          </span>
          <Link href="/cart">
            <Button size="sm">View cart</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
