import { getTenant } from "@/lib/tenant-server";
import { getOrderInvoiceData } from "@/lib/order-invoice";
import { renderOrderInvoicePdf } from "@/lib/order-invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getTenant();
  if (!tenant?.businessId) return new Response("Unauthorized", { status: 401 });

  const data = await getOrderInvoiceData(tenant.businessId, id);
  if (!data) return new Response("Not found", { status: 404 });

  const pdf = await renderOrderInvoicePdf(data);
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="invoice-${data.orderNumber}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
