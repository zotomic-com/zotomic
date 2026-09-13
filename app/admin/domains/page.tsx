import Link from "next/link";
import { Settings2 } from "lucide-react";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { getPlatformSettings } from "@/lib/platform-settings";
import { OrdersTable } from "./OrdersTable";

export const dynamic = "force-dynamic";

export default async function AdminDomainsPage() {
  await requireAdmin();
  const [settings, { data }] = await Promise.all([
    getPlatformSettings(),
    adminDb()
      .from("domain_cart_items")
      .select("*, domain_cart_orders(order_number, customer_name, customer_phone, payment_method, invoice_amount, status)")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const enabled = settings.domain_reseller_enabled === "true";
  const sandbox = settings.dynadot_use_sandbox === "true";
  const orders = (data ?? []).map((row) => {
    const order = (row.domain_cart_orders ?? {}) as Record<string, unknown>;
    return {
      id: row.id as string,
      cartOrderId: row.cart_order_id as string,
      orderNumber: (order.order_number as string) ?? "",
      domainName: row.domain_name as string,
      itemType: row.item_type as string,
      customerName: (order.customer_name as string) ?? "",
      customerPhone: (order.customer_phone as string) ?? "",
      status: row.status as string,
      orderStatus: (order.status as string) ?? "",
      paymentMethod: (order.payment_method as string) ?? "",
      retailPrice: Number(row.retail_price),
      invoiceAmount: Number(order.invoice_amount ?? 0),
      expiresAt: (row.expires_at as string) ?? null,
      lastError: (row.last_error as string) ?? null,
      createdAt: row.created_at as string,
    };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Domain orders"
        subtitle="Every domain sold through /domains, from invoice to renewal."
        action={
          <Link href="/admin/domains/settings" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <Settings2 className="h-4 w-4" /> Settings
          </Link>
        }
      />
      <div className="flex items-center gap-3 text-sm">
        <span className="flex items-center gap-2">
          <span className="text-fg-subtle">/domains is</span>
          <Badge tone={enabled ? "success" : "neutral"}>{enabled ? "Published" : "Unpublished"}</Badge>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-fg-subtle">Dynadot mode</span>
          <Badge tone={sandbox ? "warning" : "danger"}>{sandbox ? "Sandbox" : "Live"}</Badge>
        </span>
      </div>
      <OrdersTable orders={orders} />
    </div>
  );
}
