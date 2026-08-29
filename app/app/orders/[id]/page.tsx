import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { money } from "@/lib/money";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusControl } from "./OrderStatusControl";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId) redirect("/onboarding");

  const db = getAdminSupabase();
  const { data: order } = await db
    .from("orders")
    .select(
      "id, order_number, status, payment_method, payment_status, subtotal, shipping, total, currency, placed_at, address, customers(name, phone, email, city), order_items(name, qty, unit_price, line_total)",
    )
    .eq("business_id", tenant.businessId)
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  const cust = (Array.isArray(order.customers) ? order.customers[0] : order.customers) as
    | { name?: string; phone?: string; email?: string; city?: string }
    | null;
  const items = (order.order_items ?? []) as { name: string; qty: number; unit_price: number; line_total: number }[];
  const addr = (order.address ?? {}) as { line?: string; city?: string; note?: string };
  const cur = order.currency as string;

  return (
    <div className="space-y-5">
      <Link href="/app/orders" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Orders
      </Link>
      <PageHeader
        title={`Order #${order.order_number}`}
        subtitle={new Date(order.placed_at as string).toLocaleString("en-US")}
        action={<OrderStatusControl orderId={order.id as string} status={order.status as string} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-border">
              {items.map((i, idx) => (
                <li key={idx} className="flex justify-between py-2.5 text-sm">
                  <span className="text-fg">
                    {i.name} <span className="text-fg-subtle">× {i.qty}</span>
                  </span>
                  <span>{money(i.line_total, cur)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-fg-muted">Subtotal</dt>
                <dd>{money(Number(order.subtotal), cur)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg-muted">Shipping</dt>
                <dd>{money(Number(order.shipping), cur)}</dd>
              </div>
              <div className="flex justify-between font-bold">
                <dt>Total</dt>
                <dd>{money(Number(order.total), cur)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <p className="font-medium text-fg">{cust?.name ?? "Guest"}</p>
            {cust?.phone && <p className="text-fg-muted">{cust.phone}</p>}
            {cust?.email && <p className="text-fg-muted">{cust.email}</p>}
            <p className="border-t border-border pt-2 text-fg-muted">
              {addr.line}
              {addr.city ? `, ${addr.city}` : ""}
            </p>
            {addr.note && <p className="text-xs text-fg-subtle">Note: {addr.note}</p>}
            <p className="border-t border-border pt-2 text-fg-muted">
              Payment: {order.payment_method === "cod" ? "Cash on delivery" : order.payment_method} ·{" "}
              {order.payment_status as string}
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
