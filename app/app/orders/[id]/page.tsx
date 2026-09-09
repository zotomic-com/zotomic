import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { FileText } from "lucide-react";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { money } from "@/lib/money";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusBadge } from "@/components/app/OrderStatusBadge";
import { DetailShell, FactList } from "@/components/app/DetailShell";
import { Timeline, type TimelineEvent } from "@/components/app/Timeline";
import { OrderStatusControl } from "./OrderStatusControl";
import { CourierControl } from "./CourierControl";
import { listIntegrations, COURIER_PROVIDERS } from "@/lib/adapters/registry";

export const dynamic = "force-dynamic";

const FLOW = ["pending", "confirmed", "processing", "shipped", "delivered"];

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId) redirect("/onboarding");
  const db = getAdminSupabase();

  const { data: order } = await db
    .from("orders")
    .select(
      "id, order_number, status, payment_method, payment_status, subtotal, shipping, discount, total, currency, placed_at, address, cancel_reason, cancelled_at, customer_id, customers(id, name, phone, email, city, total_orders, total_spent), order_items(name, qty, unit_price, line_total)",
    )
    .eq("business_id", tenant.businessId)
    .eq("id", id)
    .maybeSingle();
  if (!order) notFound();

  const [integrations, { data: shipmentRow }, { data: audit }] = await Promise.all([
    listIntegrations(tenant.businessId),
    db.from("shipments").select("provider, status, tracking_code, consignment_id").eq("order_id", id).maybeSingle(),
    db
      .from("audit_logs")
      .select("id, action, summary, created_at")
      .eq("business_id", tenant.businessId)
      .eq("target_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const couriers = integrations
    .filter((i) => i.category === "courier" && i.status === "connected")
    .map((i) => ({ id: i.provider, name: COURIER_PROVIDERS[i.provider]?.name ?? i.provider }));
  const shipment = shipmentRow
    ? {
        provider: shipmentRow.provider as string,
        status: shipmentRow.status as string,
        trackingCode: (shipmentRow.tracking_code as string) ?? null,
        consignmentId: (shipmentRow.consignment_id as string) ?? null,
      }
    : null;

  const cust = (Array.isArray(order.customers) ? order.customers[0] : order.customers) as
    | { id?: string; name?: string; phone?: string; email?: string; city?: string; total_orders?: number; total_spent?: number }
    | null;
  const items = (order.order_items ?? []) as { name: string; qty: number; unit_price: number; line_total: number }[];
  const addr = (order.address ?? {}) as { line?: string; city?: string; note?: string };
  const cur = order.currency as string;
  const status = order.status as string;
  const flowIdx = FLOW.indexOf(status);

  const events: TimelineEvent[] = [
    ...(audit ?? []).map((a) => ({
      id: a.id as string,
      action: a.action as string,
      summary: (a.summary as string) ?? null,
      at: a.created_at as string,
    })),
    { id: "placed", action: "order.placed", summary: "Order placed", at: order.placed_at as string },
  ];

  return (
    <DetailShell
      backHref="/app/orders"
      backLabel="Orders"
      title={`Order #${order.order_number}`}
      meta={new Date(order.placed_at as string).toLocaleString("en-US")}
      status={<OrderStatusBadge status={status} />}
      actions={
        <>
          <Link
            href={`/app/orders/${order.id}/invoice`}
            className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-sm font-semibold text-fg hover:bg-surface-2"
          >
            <FileText className="h-4 w-4" /> Invoice
          </Link>
          <OrderStatusControl orderId={order.id as string} status={status} />
        </>
      }
      sidebar={
        <>
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardBody className="space-y-1 text-sm">
              {cust?.id ? (
                <Link href={`/app/customers/${cust.id}`} className="font-medium text-primary hover:underline">
                  {cust.name ?? "Guest"}
                </Link>
              ) : (
                <p className="font-medium text-fg">{cust?.name ?? "Guest"}</p>
              )}
              {cust?.phone && <p className="text-fg-muted">{cust.phone}</p>}
              {cust?.email && <p className="text-fg-muted">{cust.email}</p>}
              {cust && (cust.total_orders ?? 0) > 1 && (
                <p className="pt-1 text-xs text-fg-subtle">
                  {cust.total_orders} orders · {money(Number(cust.total_spent ?? 0), cur)} lifetime
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Delivery address</CardTitle>
            </CardHeader>
            <CardBody className="text-sm text-fg-muted">
              <p>
                {addr.line}
                {addr.city ? `, ${addr.city}` : ""}
              </p>
              {addr.note && <p className="mt-1 text-xs text-fg-subtle">Note: {addr.note}</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardBody>
              <FactList
                items={[
                  { label: "Method", value: order.payment_method === "cod" ? "Cash on delivery" : (order.payment_method as string) },
                  {
                    label: "Status",
                    value: (
                      <span className={order.payment_status === "paid" ? "text-success" : "text-warning"}>
                        {order.payment_status as string}
                      </span>
                    ),
                  },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardBody>
              <Timeline events={events} />
            </CardBody>
          </Card>
        </>
      }
    >
      {status === "cancelled" && (
        <div className="rounded-sm border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          Cancelled{order.cancelled_at ? ` on ${new Date(order.cancelled_at as string).toLocaleDateString("en-US")}` : ""}
          {order.cancel_reason ? ` — ${order.cancel_reason}` : ""}
        </div>
      )}

      {/* fulfilment progress */}
      {flowIdx >= 0 && (
        <div className="flex items-center gap-1.5">
          {FLOW.map((s, i) => (
            <div key={s} className="flex flex-1 flex-col items-center gap-1">
              <div className={`h-1.5 w-full rounded-full ${i <= flowIdx ? "bg-primary" : "bg-border"}`} />
              <span className={`text-[10px] capitalize ${i <= flowIdx ? "text-fg" : "text-fg-subtle"}`}>{s}</span>
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="divide-y divide-border">
            {items.map((i, idx) => (
              <li key={idx} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 text-fg">
                  {i.name}
                  <span className="text-fg-subtle">
                    {" "}
                    — {i.qty} × {money(i.unit_price, cur)}
                  </span>
                </span>
                <span className="shrink-0 font-medium">{money(i.line_total, cur)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-fg-muted">Subtotal</dt>
              <dd>{money(Number(order.subtotal), cur)}</dd>
            </div>
            {Number(order.discount ?? 0) > 0 && (
              <div className="flex justify-between text-success">
                <dt>Discount</dt>
                <dd>−{money(Number(order.discount), cur)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-fg-muted">Shipping</dt>
              <dd>{money(Number(order.shipping), cur)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1 text-base font-bold">
              <dt>Total</dt>
              <dd>{money(Number(order.total), cur)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery / courier</CardTitle>
        </CardHeader>
        <CardBody>
          <CourierControl orderId={order.id as string} couriers={couriers} shipment={shipment} />
        </CardBody>
      </Card>
    </DetailShell>
  );
}
