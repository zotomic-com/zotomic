import { getSessionUser } from "@/lib/tenant-server";
import { buildInvoicePdf, getInvoice } from "@/lib/admin-invoices";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (user?.role !== "admin") return new Response("Forbidden", { status: 403 });

  const { id } = await params;
  const inv = await getInvoice(id);
  if (!inv) return new Response("Not found", { status: 404 });

  const pdf = await buildInvoicePdf(inv);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${inv.invoiceNumber}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
