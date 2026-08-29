import { notFound, redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getOrderInvoiceData, renderOrderInvoiceHtml } from "@/lib/order-invoice";
import { InvoiceActions } from "./InvoiceActions";

export const dynamic = "force-dynamic";

export default async function OrderInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId) redirect("/onboarding");

  const data = await getOrderInvoiceData(tenant.businessId, id);
  if (!data) notFound();

  return (
    <div className="space-y-4">
      <InvoiceActions
        orderId={id}
        orderNumber={data.orderNumber}
        customerEmail={data.buyer.email ?? ""}
        branded={data.branded}
      />
      <div
        className="print-sheet mx-auto max-w-[680px] rounded-lg"
        dangerouslySetInnerHTML={{ __html: renderOrderInvoiceHtml(data) }}
      />
    </div>
  );
}
