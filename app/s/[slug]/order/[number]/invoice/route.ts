import { getStoreBySlug } from "@/lib/storefront/store";
import { getOrderInvoiceData } from "@/lib/order-invoice";
import { renderOrderInvoicePdf } from "@/lib/order-invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public order invoice PDF — same visibility as the order confirmation page. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; number: string }> }) {
  const { slug, number } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return new Response("Not found", { status: 404 });

  const data = await getOrderInvoiceData(store.businessId, number);
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
