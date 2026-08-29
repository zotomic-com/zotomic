import { redirect } from "next/navigation";
import Link from "next/link";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { money } from "@/lib/money";
import { PageHeader } from "@/components/app/PageHeader";
import { OrderStatusBadge } from "@/components/app/OrderStatusBadge";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";

export const dynamic = "force-dynamic";

const STATUSES = ["all", "pending", "confirmed", "processing", "shipped", "delivered", "returned", "cancelled"];

interface Row {
  id: string;
  number: string;
  customer: string;
  total: number;
  status: string;
  payment: string;
  placed: string;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");

  const { status = "all" } = await searchParams;
  const currency = tenant.business.currency ?? "BDT";
  const db = getAdminSupabase();

  let query = db
    .from("orders")
    .select("id, order_number, total, status, payment_method, placed_at, customers(name)")
    .eq("business_id", tenant.businessId)
    .order("placed_at", { ascending: false })
    .limit(100);
  if (status !== "all") query = query.eq("status", status);

  const [{ data }, { count: total }, { data: agg }] = await Promise.all([
    query,
    db.from("orders").select("id", { count: "exact", head: true }).eq("business_id", tenant.businessId),
    db
      .from("orders")
      .select("total, status")
      .eq("business_id", tenant.businessId)
      .gte("placed_at", new Date(Date.now() - 7 * 86400000).toISOString()),
  ]);

  const rows: Row[] = (data ?? []).map((o) => ({
    id: o.id as string,
    number: o.order_number as string,
    customer:
      ((Array.isArray(o.customers) ? o.customers[0] : o.customers) as { name?: string } | null)?.name ??
      "Guest",
    total: Number(o.total),
    status: o.status as string,
    payment: o.payment_method as string,
    placed: new Date(o.placed_at as string).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  const week = agg ?? [];
  const weekRevenue = week.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total), 0);
  const weekReturns = week.filter((o) => o.status === "returned").length;

  const cols: Column<Row>[] = [
    {
      key: "number",
      header: "Order",
      render: (r) => (
        <Link href={`/app/orders/${r.id}`} className="font-medium text-primary">
          #{r.number}
        </Link>
      ),
    },
    { key: "customer", header: "Customer", render: (r) => r.customer },
    { key: "placed", header: "Date", render: (r) => r.placed },
    { key: "payment", header: "Payment", render: (r) => (r.payment === "cod" ? "COD" : r.payment) },
    { key: "total", header: "Amount", align: "right", render: (r) => money(r.total, currency) },
    { key: "status", header: "Status", align: "right", render: (r) => <OrderStatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Orders" subtitle={`${total ?? 0} total`} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Revenue · 7 days" value={money(weekRevenue, currency)} />
        <StatCard label="Orders · 7 days" value={week.length.toLocaleString("en-US")} />
        <StatCard label="Returns · 7 days" value={weekReturns.toLocaleString("en-US")} invert />
      </div>

      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/app/orders" : `/app/orders?status=${s}`}
            className={`shrink-0 rounded-sm px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              status === s ? "bg-primary-soft text-primary" : "text-fg-muted hover:bg-surface-2"
            }`}
          >
            {s}
          </Link>
        ))}
      </div>

      <Card>
        <DataTable
          columns={cols}
          rows={rows}
          rowKey={(r) => r.id}
          empty={{ title: "No orders", description: "Storefront and manual orders appear here." }}
        />
      </Card>
    </div>
  );
}
