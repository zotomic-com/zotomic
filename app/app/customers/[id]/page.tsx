import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { money } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusBadge } from "@/components/app/OrderStatusBadge";
import { DetailShell, FactList } from "@/components/app/DetailShell";
import { CustomerEditor } from "./CustomerEditor";

export const dynamic = "force-dynamic";

const d = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");
  const cur = tenant.business.currency ?? "BDT";
  const db = getAdminSupabase();

  const { data: c } = await db
    .from("customers")
    .select("id, name, phone, email, city, notes, total_orders, total_spent, first_order_at, last_order_at, created_at")
    .eq("business_id", tenant.businessId)
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  const [{ data: orders }, { data: returns }] = await Promise.all([
    db
      .from("orders")
      .select("id, order_number, total, status, placed_at")
      .eq("business_id", tenant.businessId)
      .eq("customer_id", id)
      .order("placed_at", { ascending: false })
      .limit(50),
    db
      .from("returns")
      .select("id, return_number, status, refund_amount, created_at, orders(customer_id)")
      .eq("business_id", tenant.businessId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const custReturns = (returns ?? []).filter((r) => {
    const o = (Array.isArray(r.orders) ? r.orders[0] : r.orders) as { customer_id?: string } | null;
    return o?.customer_id === id;
  });

  const orderList = (orders ?? []) as { id: string; order_number: string; total: number; status: string; placed_at: string }[];
  const aov = orderList.length ? Number(c.total_spent ?? 0) / orderList.length : 0;

  return (
    <DetailShell
      backHref="/app/customers"
      backLabel="Customers"
      title={(c.name as string) ?? "Guest"}
      meta={`${c.city ?? "Unknown city"} · customer since ${d(c.created_at as string)}`}
      status={Number(c.total_orders ?? 0) > 1 ? <Badge tone="primary">Repeat</Badge> : undefined}
      sidebar={
        <>
          <Card>
            <CardHeader>
              <CardTitle>Lifetime</CardTitle>
            </CardHeader>
            <CardBody>
              <FactList
                items={[
                  { label: "Orders", value: Number(c.total_orders ?? 0).toLocaleString("en-US") },
                  { label: "Total spent", value: money(Number(c.total_spent ?? 0), cur) },
                  { label: "Avg order", value: money(aov, cur) },
                  { label: "First order", value: d(c.first_order_at as string) },
                  { label: "Last order", value: d(c.last_order_at as string) },
                  { label: "Returns", value: custReturns.length.toLocaleString("en-US") },
                ]}
              />
            </CardBody>
          </Card>
        </>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Contact &amp; notes</CardTitle>
        </CardHeader>
        <CardBody>
          <CustomerEditor
            id={c.id as string}
            initial={{
              name: (c.name as string) ?? "",
              phone: (c.phone as string) ?? "",
              email: (c.email as string) ?? "",
              city: (c.city as string) ?? "",
              notes: (c.notes as string) ?? "",
            }}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order history</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="divide-y divide-border">
            {orderList.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <Link href={`/app/orders/${o.id}`} className="font-medium text-primary hover:underline">
                  #{o.order_number}
                </Link>
                <span className="flex items-center gap-3">
                  <span className="text-fg-subtle">{d(o.placed_at)}</span>
                  <OrderStatusBadge status={o.status} />
                  <span className="w-20 text-right font-medium text-fg">{money(Number(o.total), cur)}</span>
                </span>
              </li>
            ))}
            {orderList.length === 0 && <li className="py-2.5 text-sm text-fg-subtle">No orders yet.</li>}
          </ul>
        </CardBody>
      </Card>

      {custReturns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Returns</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-border">
              {custReturns.map((r) => (
                <li key={r.id as string} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <Link href={`/app/returns/${r.id}`} className="font-medium text-primary hover:underline">
                    {r.return_number as string}
                  </Link>
                  <span className="flex items-center gap-3">
                    <Badge tone="neutral">{r.status as string}</Badge>
                    <span className="w-20 text-right font-medium">{money(Number(r.refund_amount), cur)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </DetailShell>
  );
}
