import Link from "next/link";
import { ShoppingCart, Lock, ArrowRight } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { money } from "@/lib/money";
import type { AbandonedCartSummary } from "@/lib/storefront/abandoned-cart";

export function AbandonedCartsCard({
  currency,
  week,
  isPaid,
}: {
  currency: string;
  week: AbandonedCartSummary;
  isPaid: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary" /> Abandoned carts
          </span>
        </CardTitle>
        <Link href="/app/orders/abandoned" className="flex items-center gap-1 text-xs font-semibold text-primary">
          Open <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>

      <CardBody>
        {!isPaid ? (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-4">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
            <div className="text-sm">
              <p className="font-medium text-fg">Recover lost sales — on the Business plan</p>
              <p className="mt-0.5 text-fg-muted">
                See who added to cart but didn&apos;t buy, with the shopper&apos;s name and contact when they were signed in.{" "}
                <Link href="/app/billing" className="font-semibold text-primary">
                  Upgrade
                </Link>
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Abandoned · 7d" value={week.abandonedCarts} />
            <Metric
              label="Abandon rate"
              value={week.cartAbandonRate != null ? `${week.cartAbandonRate}%` : "—"}
              danger={week.cartAbandonRate != null && week.cartAbandonRate >= 70}
            />
            <Metric label="Left at checkout" value={week.abandonedCheckouts} />
            <Metric label="Value left · 7d" value={money(week.estimatedLostValue, currency)} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Metric({ label, value, danger }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <p className="text-xs text-fg-subtle">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${danger ? "text-danger" : "text-fg"}`}>
        {typeof value === "number" ? value.toLocaleString("en-US") : value}
      </p>
    </div>
  );
}
