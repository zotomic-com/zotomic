import Link from "next/link";
import { Network, MessageSquareText, CreditCard, Coins } from "lucide-react";
import { requireAdmin } from "@/lib/admin-server";
import { getOrdersOverview } from "@/lib/admin-orders";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const TYPE_ICON = {
  domain: Network,
  service_inquiry: MessageSquareText,
  subscription_payment: CreditCard,
  credit_topup: Coins,
  chat_topup: Coins,
} as const;

export default async function AdminOrdersPage() {
  await requireAdmin();
  const { counts, feed } = await getOrdersOverview();

  const cards = [
    { label: "Domain orders", value: counts.domainOrders, href: "/admin/domains" },
    { label: "Subscription payments to confirm", value: counts.pendingSubscriptionPayments, href: "/admin/subscriptions" },
    { label: "Credit top-ups to confirm", value: counts.pendingCreditTopups, href: "/admin/credits" },
    { label: "New service inquiries", value: counts.newServiceInquiries, href: "/admin/service-inquiries" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Orders" subtitle="Every domain, hosting inquiry, subscription payment, and credit top-up in one place." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="block">
            <Card className="p-5 transition-colors hover:border-primary">
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{c.label}</p>
              <p className="mt-2 text-2xl font-extrabold tracking-tight text-fg">{c.value}</p>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {feed.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No orders yet" description="Domain sales, service inquiries, and payments will show up here." />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {feed.map((item) => {
                const Icon = TYPE_ICON[item.type];
                return (
                  <li key={item.id}>
                    <Link href={item.href} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <Icon className="h-4 w-4 shrink-0 text-fg-subtle" />
                        <div className="overflow-hidden">
                          <p className="truncate text-sm font-medium text-fg">{item.title}</p>
                          <p className="truncate text-xs text-fg-subtle">{item.subtitle}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {item.amount && <span className="text-sm font-semibold text-fg">{item.amount}</span>}
                        <Badge tone={item.statusTone}>{item.statusLabel}</Badge>
                        <span className="hidden text-xs text-fg-subtle sm:inline">
                          {new Date(item.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
