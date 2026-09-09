import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { money } from "@/lib/money";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/ui/stat-card";
import { getAbandonedCartSummary } from "@/lib/storefront/abandoned-cart";
import { OrdersGrid, type OrderRow } from "./OrdersGrid";
import { AbandonedCartsCard } from "./AbandonedCartsCard";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");
  const currency = tenant.business.currency ?? "BDT";
  const db = getAdminSupabase();

  const now = Date.now();
  const isPaid = tenant.billing.plan !== "free";
  const [{ data }, { data: week }, cart7d] = await Promise.all([
    db
      .from("orders")
      .select("id, order_number, total, status, payment_method, payment_status, placed_at, customers(name), order_items(qty)")
      .eq("business_id", tenant.businessId)
      .order("placed_at", { ascending: false })
      .limit(200),
    db
      .from("orders")
      .select("total, status")
      .eq("business_id", tenant.businessId)
      .gte("placed_at", new Date(now - 7 * 86400000).toISOString()),
    getAbandonedCartSummary(tenant.businessId, new Date(now - 7 * 86400000), new Date(now)),
  ]);

  const rows: OrderRow[] = (data ?? []).map((o) => ({
    id: o.id as string,
    number: o.order_number as string,
    customer: ((Array.isArray(o.customers) ? o.customers[0] : o.customers) as { name?: string } | null)?.name ?? "Guest",
    items: (o.order_items ?? []).reduce((n: number, i: { qty: number }) => n + Number(i.qty), 0),
    total: Number(o.total),
    status: o.status as string,
    payment: o.payment_method as string,
    paid: o.payment_status === "paid",
    placed: new Date(o.placed_at as string).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;

  const w = week ?? [];
  const weekRevenue = w.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total), 0);
  const pending = rows.filter((o) => o.status === "pending").length;

  return (
    <div className="space-y-5">
      <PageHeader title="Orders" subtitle={`${rows.length} shown`} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Revenue · 7 days" value={money(weekRevenue, currency)} />
        <StatCard label="Orders · 7 days" value={w.length.toLocaleString("en-US")} />
        <StatCard label="Awaiting confirmation" value={pending.toLocaleString("en-US")} invert />
      </div>

      <AbandonedCartsCard currency={currency} week={cart7d} isPaid={isPaid} />

      <OrdersGrid orders={rows} currency={currency} counts={counts} />
    </div>
  );
}
