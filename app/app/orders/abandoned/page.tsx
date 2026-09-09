import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { getTenant } from "@/lib/tenant-server";
import { money } from "@/lib/money";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAbandonedCartSummary, getRecentCarts } from "@/lib/storefront/abandoned-cart";
import { AbandonedCartsView } from "./AbandonedCartsView";

export const dynamic = "force-dynamic";

export default async function AbandonedCartsPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");
  const currency = tenant.business.currency ?? "BDT";
  const isPaid = tenant.billing.plan !== "free";
  const now = Date.now();

  const back = (
    <Link href="/app/orders" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
      <ArrowLeft className="h-4 w-4" /> Orders
    </Link>
  );

  if (!isPaid) {
    return (
      <div className="space-y-5">
        {back}
        <div>
          <h1 className="text-xl font-extrabold text-fg">Abandoned carts</h1>
        </div>
        <Card>
          <CardBody className="flex flex-col items-start gap-3 p-6">
            <Lock className="h-5 w-5 text-fg-subtle" />
            <div>
              <p className="text-base font-semibold text-fg">Recover lost sales with the Business plan</p>
              <p className="mt-1 max-w-lg text-sm text-fg-muted">
                See every shopper who added to cart but didn&apos;t check out — including their name, phone and email
                when they were signed in — so you can follow up. Free plans see the summary only.
              </p>
            </div>
            <Button href="/app/billing" size="sm">
              Upgrade to Business
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  const [week, month, recent] = await Promise.all([
    getAbandonedCartSummary(tenant.businessId, new Date(now - 7 * 86400000), new Date(now)),
    getAbandonedCartSummary(tenant.businessId, new Date(now - 30 * 86400000), new Date(now)),
    getRecentCarts(tenant.businessId, 14, 60, true),
  ]);

  return (
    <div className="space-y-5">
      {back}
      <div>
        <h1 className="text-xl font-extrabold text-fg">Abandoned carts</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Shoppers who added to cart but didn&apos;t place an order. Carts live in the shopper&apos;s browser, so this
          is estimated from storefront activity.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Abandoned · 7 days" value={week.abandonedCarts.toLocaleString("en-US")} />
        <StatCard
          label="Abandon rate · 7d"
          value={week.cartAbandonRate != null ? `${week.cartAbandonRate}%` : "—"}
        />
        <StatCard label="Left at checkout · 7d" value={week.abandonedCheckouts.toLocaleString("en-US")} />
        <StatCard label="Est. value left · 7d" value={money(week.estimatedLostValue, currency)} />
      </div>

      <p className="text-xs text-fg-subtle">
        Last 30 days: {month.abandonedCarts.toLocaleString("en-US")} abandoned of{" "}
        {month.cartSessions.toLocaleString("en-US")} carts
        {month.cartAbandonRate != null ? ` (${month.cartAbandonRate}%)` : ""} ·{" "}
        {month.registeredCartSessions.toLocaleString("en-US")} from signed-in shoppers ·{" "}
        {money(month.estimatedLostValue, currency)} estimated value left behind.
      </p>

      <AbandonedCartsView carts={recent} currency={currency} />
    </div>
  );
}
