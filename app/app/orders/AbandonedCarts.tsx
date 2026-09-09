"use client";

import { useState } from "react";
import { ShoppingCart, ChevronDown } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/money";
import type { AbandonedCartSummary, RecentCart } from "@/lib/storefront/abandoned-cart";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};

export function AbandonedCarts({
  currency,
  week,
  month,
  recent,
}: {
  currency: string;
  week: AbandonedCartSummary;
  month: AbandonedCartSummary;
  recent: RecentCart[];
}) {
  const [open, setOpen] = useState(false);

  if (!week.hasData && !month.hasData) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary" /> Abandoned carts
          </span>
        </CardTitle>
        <span className="text-xs text-fg-subtle">Shoppers who added to cart but didn&apos;t order</span>
      </CardHeader>

      <CardBody className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Abandoned · 7 days" value={week.abandonedCarts} />
          <Metric
            label="Cart abandon rate"
            value={week.cartAbandonRate != null ? `${week.cartAbandonRate}%` : "—"}
            tone={week.cartAbandonRate != null && week.cartAbandonRate >= 70 ? "danger" : undefined}
          />
          <Metric label="Left at checkout · 7d" value={week.abandonedCheckouts} />
          <Metric label="Est. value left · 7d" value={money(week.estimatedLostValue, currency)} />
        </div>

        <p className="text-xs text-fg-subtle">
          Last 30 days: {month.abandonedCarts.toLocaleString("en-US")} abandoned of{" "}
          {month.cartSessions.toLocaleString("en-US")} carts
          {month.cartAbandonRate != null ? ` (${month.cartAbandonRate}%)` : ""} · {money(month.estimatedLostValue, currency)}{" "}
          estimated value left behind.
        </p>

        {recent.length > 0 && (
          <div>
            <button
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-1 text-sm font-medium text-primary"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
              Recent carts ({recent.length})
            </button>
            {open && (
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border text-sm">
                {recent.map((c) => (
                  <li key={c.session} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-fg-subtle">#{c.session}</span>
                      <span className="text-fg">{c.items} item{c.items === 1 ? "" : "s"}</span>
                      {c.value > 0 && <span className="text-fg-muted">· {money(c.value, currency)}</span>}
                      {c.reachedCheckout && <Badge tone="warning">reached checkout</Badge>}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-fg-subtle">
                      {ago(c.lastActivity)}
                      {c.likelyAbandoned ? (
                        <Badge tone="danger">abandoned</Badge>
                      ) : (
                        <Badge tone="neutral">active</Badge>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "danger" }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <p className="text-xs text-fg-subtle">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${tone === "danger" ? "text-danger" : "text-fg"}`}>
        {typeof value === "number" ? value.toLocaleString("en-US") : value}
      </p>
    </div>
  );
}
