import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { money } from "@/lib/money";
import { PageHeader } from "@/components/app/PageHeader";
import { ReturnsClient, type ReturnRow, type OrderOption } from "./ReturnsClient";

export const dynamic = "force-dynamic";

export default async function ReturnsPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");

  const currency = tenant.business.currency ?? "BDT";
  const db = getAdminSupabase();

  const [{ data: returns }, { data: orders }] = await Promise.all([
    db
      .from("returns")
      .select("id, return_number, order_id, status, reason, refund_amount, restock, created_at, orders(order_number)")
      .eq("business_id", tenant.businessId)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("orders")
      .select("id, order_number, total, placed_at, status, customers(name)")
      .eq("business_id", tenant.businessId)
      .in("status", ["delivered", "shipped", "confirmed", "processing"])
      .order("placed_at", { ascending: false })
      .limit(60),
  ]);

  const orderIds = (orders ?? []).map((o) => o.id as string);
  const { data: items } = orderIds.length
    ? await db
        .from("order_items")
        .select("id, order_id, name, qty, unit_price")
        .eq("business_id", tenant.businessId)
        .in("order_id", orderIds)
    : { data: [] as { id: string; order_id: string; name: string; qty: number; unit_price: number }[] };

  const itemsByOrder = new Map<string, OrderOption["items"]>();
  for (const it of items ?? []) {
    const list = itemsByOrder.get(it.order_id as string) ?? [];
    list.push({
      id: it.id as string,
      name: it.name as string,
      qty: Number(it.qty),
      unitPrice: Number(it.unit_price),
    });
    itemsByOrder.set(it.order_id as string, list);
  }

  const orderOptions: OrderOption[] = (orders ?? [])
    .map((o) => ({
      id: o.id as string,
      number: o.order_number as string,
      customer:
        ((Array.isArray(o.customers) ? o.customers[0] : o.customers) as { name?: string } | null)?.name ??
        "Guest",
      total: money(Number(o.total), currency),
      items: itemsByOrder.get(o.id as string) ?? [],
    }))
    .filter((o) => o.items.length > 0);

  const rows: ReturnRow[] = (returns ?? []).map((r) => ({
    id: r.id as string,
    number: r.return_number as string,
    orderNumber:
      ((Array.isArray(r.orders) ? r.orders[0] : r.orders) as { order_number?: string } | null)
        ?.order_number ?? "—",
    status: r.status as string,
    reason: (r.reason as string) ?? "",
    refund: money(Number(r.refund_amount), currency),
    restock: !!r.restock,
    date: new Date(r.created_at as string).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  return (
    <div className="space-y-5">
      <PageHeader title="Returns" subtitle={`${rows.length} return${rows.length === 1 ? "" : "s"}`} />
      <ReturnsClient rows={rows} orders={orderOptions} currency={currency} />
    </div>
  );
}
