import { NextRequest } from "next/server";
import { buildInvoicePdf, getInvoice, renderInvoiceHtml } from "@/lib/admin-invoices";

export const dynamic = "force-dynamic";

// TEMP debug route — remove after diagnosing the invoice page crash.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const steps: Record<string, string> = {};
  try {
    const inv = await getInvoice(id);
    steps.getInvoice = inv ? "ok" : "null";
    if (!inv) return Response.json(steps);
    try {
      const html = renderInvoiceHtml(inv);
      steps.renderInvoiceHtml = `ok (${html.length})`;
    } catch (e) {
      steps.renderInvoiceHtml = `THREW: ${(e as Error).stack}`;
    }
    try {
      const pdf = await buildInvoicePdf(inv);
      steps.buildInvoicePdf = `ok (${pdf.length})`;
    } catch (e) {
      steps.buildInvoicePdf = `THREW: ${(e as Error).stack}`;
    }
    return Response.json({ steps, inv });
  } catch (e) {
    steps.getInvoice = `THREW: ${(e as Error).stack}`;
    return Response.json(steps);
  }
}
