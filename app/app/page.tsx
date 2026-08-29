import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  FileText,
  ListChecks,
  PlusCircle,
  ShoppingCart,
  Store,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { getTenant } from "@/lib/tenant-server";
import { getDashboardData } from "@/lib/metrics";
import { getAdminSupabase } from "@/lib/supabase";
import { money, pluralize } from "@/lib/money";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { LineChart, DonutChart } from "@/components/charts";
import { AskZotomicPanel } from "@/components/app/AskZotomicPanel";
import { OrderStatusBadge } from "@/components/app/OrderStatusBadge";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function periodLabel(start: Date, end: Date) {
  const f = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${f(start)} – ${f(new Date(end.getTime() - 1))}, ${end.getFullYear()}`;
}

function InsightBanner({
  revenueDelta,
  profitDelta,
  hasData,
}: {
  revenueDelta: number | null;
  profitDelta: number | null;
  hasData: boolean;
}) {
  if (!hasData) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-surface p-4 shadow-sm">
        <p className="text-sm text-fg-muted">
          Not enough data yet — connect a data source or import orders to see your weekly intelligence.
        </p>
        <Link href="/onboarding" className="text-sm font-semibold text-primary">
          Set up data →
        </Link>
      </div>
    );
  }

  const dir = (n: number | null) =>
    n == null ? "flat" : n > 0 ? `up ${n}%` : n < 0 ? `down ${Math.abs(n)}%` : "flat";
  const diverging =
    revenueDelta != null && profitDelta != null && Math.sign(revenueDelta) !== Math.sign(profitDelta);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-primary-soft bg-primary-soft p-4">
      <div className="flex items-center gap-2 text-sm">
        {(revenueDelta ?? 0) >= 0 ? (
          <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
        ) : (
          <TrendingDown className="h-4 w-4 shrink-0 text-danger" />
        )}
        <p className="font-medium text-fg">
          Revenue is {dir(revenueDelta)} compared to last week
          {profitDelta != null && diverging ? (
            <>
              {" "}
              — but <span className="font-semibold">profit is {dir(profitDelta)}</span>.
            </>
          ) : (
            "."
          )}
        </p>
      </div>
      <Link href="/app/intelligence" className="shrink-0 text-sm font-semibold text-primary">
        View insights →
      </Link>
    </div>
  );
}

const QUICK_ACTIONS = [
  { icon: PlusCircle, label: "Add product", href: "/app/products" },
  { icon: ShoppingCart, label: "View orders", href: "/app/orders" },
  { icon: Store, label: "Edit storefront", href: "/app/storefront" },
  { icon: FileText, label: "Weekly report", href: "/app/intelligence" },
];

export default async function DashboardPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");

  const { business, businessId, user } = tenant;
  const currency = business.currency ?? "BDT";

  const data = await getDashboardData(businessId);
  const db = getAdminSupabase();

  const [{ data: recentOrders }, { data: tasks }] = await Promise.all([
    db
      .from("orders")
      .select("id, order_number, total, status, placed_at, customers(name)")
      .eq("business_id", businessId)
      .order("placed_at", { ascending: false })
      .limit(5),
    db
      .from("tasks")
      .select("id, title, priority")
      .eq("business_id", businessId)
      .eq("status", "open")
      .order("priority", { ascending: false })
      .limit(5),
  ]);

  const hasData = data.current.orders_count > 0;
  const revenueDelta = data.lines.find((l) => l.key === "revenue")?.delta ?? null;
  const profitDelta = data.lines.find((l) => l.key === "profit")?.delta ?? null;

  const orderRows = (recentOrders ?? []).map((o) => ({
    id: o.id as string,
    number: o.order_number as string,
    customer:
      ((Array.isArray(o.customers) ? o.customers[0] : o.customers) as { name?: string } | null)
        ?.name ?? "Guest",
    total: Number(o.total),
    status: o.status as string,
  }));

  const orderCols: Column<(typeof orderRows)[number]>[] = [
    { key: "number", header: "Order", render: (r) => <span className="font-medium text-fg">#{r.number}</span> },
    { key: "customer", header: "Customer", render: (r) => r.customer },
    { key: "total", header: "Amount", align: "right", render: (r) => money(r.total, currency) },
    { key: "status", header: "Status", align: "right", render: (r) => <OrderStatusBadge status={r.status} /> },
  ];

  const topRows = data.topProducts.map((p, i) => ({ ...p, rank: i + 1 }));
  const topCols: Column<(typeof topRows)[number]>[] = [
    { key: "name", header: "Product", render: (r) => <span className="font-medium text-fg">{r.name}</span> },
    { key: "units", header: "Units", align: "right", render: (r) => r.units.toLocaleString("en-US") },
    { key: "revenue", header: "Revenue", align: "right", render: (r) => money(r.revenue, currency) },
  ];

  const priorityTone = { high: "danger", medium: "warning", low: "neutral" } as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-fg">
            {greeting()}, {user.name.split(" ")[0]} 👋
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            Here&apos;s what&apos;s happening with {business.name} this week.
          </p>
        </div>
        <span className="rounded-sm border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted">
          This week · {periodLabel(data.periodStart, data.periodEnd)}
        </span>
      </div>

      <InsightBanner revenueDelta={revenueDelta} profitDelta={profitDelta} hasData={hasData} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {data.lines.map((l) => (
          <StatCard
            key={l.key}
            label={l.label}
            value={
              l.value == null
                ? "—"
                : l.key === "returns"
                  ? `${l.value.toFixed(1)}%`
                  : l.key === "revenue" || l.key === "profit"
                    ? money(l.value, currency)
                    : Math.round(l.value).toLocaleString("en-US")
            }
            delta={l.delta}
            deltaLabel="vs last week"
            invert={l.invert}
            unavailableReason={l.value == null ? l.unavailableReason : undefined}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue trend</CardTitle>
            <span className="text-xs text-fg-subtle">Last 7 days</span>
          </CardHeader>
          <CardBody>
            {hasData ? (
              <LineChart data={data.dailyRevenue} xKey="day" yKey="revenue" currency={currency} />
            ) : (
              <EmptyState title="No revenue yet" description="Orders will show up here once they start coming in." />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sales by category</CardTitle>
          </CardHeader>
          <CardBody>
            {data.salesByCategory.length ? (
              <>
                <DonutChart
                  data={data.salesByCategory}
                  centerValue={money(data.current.revenue, currency)}
                  centerLabel="total"
                />
                <ul className="mt-4 space-y-1.5">
                  {data.salesByCategory.slice(0, 4).map((c, i) => (
                    <li key={c.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-fg-muted">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: `var(--chart-${(i % 5) + 1})` }}
                        />
                        {c.name}
                      </span>
                      <span className="font-medium text-fg">{money(c.value, currency)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState title="No sales yet" />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top products</CardTitle>
            <Link href="/app/products" className="text-xs font-semibold text-primary">
              View all
            </Link>
          </CardHeader>
          <DataTable
            columns={topCols}
            rows={topRows}
            rowKey={(r) => r.productId ?? r.name}
            empty={{ title: "No product sales in this period" }}
          />
        </Card>

        <div className="lg:row-span-2">
          <AskZotomicPanel />
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent orders</CardTitle>
            <Link href="/app/orders" className="text-xs font-semibold text-primary">
              View all
            </Link>
          </CardHeader>
          <DataTable
            columns={orderCols}
            rows={orderRows}
            rowKey={(r) => r.id}
            empty={{ title: "No orders yet", description: "Your storefront and manual orders will appear here." }}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>What to do next</CardTitle>
            <Link href="/app/tasks" className="text-xs font-semibold text-primary">
              All tasks
            </Link>
          </CardHeader>
          <CardBody>
            {tasks && tasks.length ? (
              <ul className="space-y-2">
                {tasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded-sm border border-border px-3 py-2.5"
                  >
                    <span className="text-sm text-fg">{t.title}</span>
                    <Badge tone={priorityTone[(t.priority as keyof typeof priorityTone) ?? "medium"]}>
                      {t.priority}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={ListChecks}
                title="Nothing on your list"
                description="Recommendations from your weekly report land here as tasks."
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTIONS.map((a) => (
                <Link
                  key={a.label}
                  href={a.href}
                  className="flex flex-col items-center gap-2 rounded-sm border border-border p-3 text-center text-xs font-medium text-fg-muted transition-colors hover:border-primary hover:bg-primary-soft hover:text-fg"
                >
                  <a.icon className="h-5 w-5 text-primary" />
                  {a.label}
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <p className="flex items-center justify-center gap-1 text-center text-xs text-fg-subtle">
        <Boxes className="h-3.5 w-3.5" />
        {pluralize(data.current.orders_count, "order")} · {pluralize(data.current.units, "unit")} sold
        this week
        <ArrowRight className="h-3 w-3" />
      </p>
    </div>
  );
}
