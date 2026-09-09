"use client";

import { useState, useMemo } from "react";
import { Phone, Mail, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/money";
import type { RecentCart } from "@/lib/storefront/abandoned-cart";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};

type Filter = "all" | "abandoned" | "registered" | "checkout";

export function AbandonedCartsView({ carts, currency }: { carts: RecentCart[]; currency: string }) {
  const [filter, setFilter] = useState<Filter>("abandoned");

  const counts = useMemo(
    () => ({
      all: carts.length,
      abandoned: carts.filter((c) => c.likelyAbandoned).length,
      registered: carts.filter((c) => c.shopper.type === "registered").length,
      checkout: carts.filter((c) => c.reachedCheckout && c.likelyAbandoned).length,
    }),
    [carts],
  );

  const shown = carts.filter((c) => {
    if (filter === "abandoned") return c.likelyAbandoned;
    if (filter === "registered") return c.shopper.type === "registered";
    if (filter === "checkout") return c.reachedCheckout && c.likelyAbandoned;
    return true;
  });

  const chips: { key: Filter; label: string }[] = [
    { key: "abandoned", label: `Abandoned (${counts.abandoned})` },
    { key: "checkout", label: `Left at checkout (${counts.checkout})` },
    { key: "registered", label: `Signed-in shopper (${counts.registered})` },
    { key: "all", label: `All carts (${counts.all})` },
  ];

  return (
    <Card className="p-0">
      <div className="flex flex-wrap gap-1.5 border-b border-border p-3">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === c.key ? "bg-primary text-primary-fg" : "border border-border text-fg-muted hover:text-fg"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="p-6 text-center text-sm text-fg-subtle">No carts match.</p>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((c) => (
            <li key={c.session} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                {c.shopper.type === "registered" ? (
                  <>
                    <p className="flex items-center gap-1.5 font-medium text-fg">
                      <User className="h-3.5 w-3.5 text-fg-subtle" />
                      {c.shopper.name}
                      <Badge tone="primary">registered</Badge>
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-muted">
                      {c.shopper.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {c.shopper.phone}
                        </span>
                      )}
                      {c.shopper.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {c.shopper.email}
                        </span>
                      )}
                    </p>
                  </>
                ) : (
                  <p className="flex items-center gap-1.5 font-medium text-fg">
                    Guest <span className="font-mono text-xs text-fg-subtle">#{c.session}</span>
                  </p>
                )}
                <p className="mt-1 text-xs text-fg-subtle">
                  {c.items} item{c.items === 1 ? "" : "s"}
                  {c.value > 0 ? ` · ${money(c.value, currency)}` : ""} · last active {ago(c.lastActivity)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {c.likelyAbandoned ? <Badge tone="danger">abandoned</Badge> : <Badge tone="neutral">active</Badge>}
                {c.reachedCheckout && <Badge tone="warning">reached checkout</Badge>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
