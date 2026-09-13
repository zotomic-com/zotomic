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
    adminDb().from("domain_orders").select("*").order("created_at", { ascending: false }).limit(200),
  ]);

  const enabled = settings.domain_reseller_enabled === "true";
  const orders = (data ?? []).map((o) => ({
    id: o.id as string,
    orderNumber: o.order_number as string,
    domainName: o.domain_name as string,
    customerName: o.customer_name as string,
    customerPhone: o.customer_phone as string,
    status: o.status as string,
    paymentMethod: o.payment_method as string,
    retailPrice: Number(o.retail_price),
    invoiceAmount: Number(o.invoice_amount),
    expiresAt: (o.expires_at as string) ?? null,
    lastError: (o.last_error as string) ?? null,
    createdAt: o.created_at as string,
  }));

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
      <div className="flex items-center gap-2 text-sm">
        <span className="text-fg-subtle">/domains is</span>
        <Badge tone={enabled ? "success" : "neutral"}>{enabled ? "Published" : "Unpublished"}</Badge>
      </div>
      <OrdersTable orders={orders} />
    </div>
  );
}
