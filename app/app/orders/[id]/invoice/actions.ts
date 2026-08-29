"use server";

import { requireBusiness } from "@/lib/app-actions";
import { getOrderInvoiceData } from "@/lib/order-invoice";
import { renderOrderInvoicePdf } from "@/lib/order-invoice-pdf";
import { sendEmail, emailConfigured, emailLayout } from "@/lib/email";

export async function emailOrderInvoice(
  orderId: string,
  toOverride?: string,
): Promise<{ error: string } | { ok: true; to: string }> {
  const { businessId } = await requireBusiness({ allowReadOnly: true });

  const data = await getOrderInvoiceData(businessId, orderId);
  if (!data) return { error: "Order not found" };

  const to = (toOverride || data.buyer.email || "").trim();
  if (!to) return { error: "This order has no customer email — enter one to send it." };
  if (!emailConfigured()) return { error: "Email isn't set up yet — use Print / Save as PDF for now." };

  const pdf = await renderOrderInvoicePdf(data);
  const ok = await sendEmail({
    to,
    subject: `Invoice ${data.orderNumber} — ${data.seller.name}`,
    replyTo: data.seller.email || undefined,
    html: emailLayout(
      `<h1 style="font-size:18px;margin:0 0 6px">Your invoice</h1>
       <p style="color:#475569;margin:0">Invoice for order <b>${data.orderNumber}</b> from ${data.seller.name} is attached as a PDF.</p>`,
    ),
    text: `Invoice ${data.orderNumber} from ${data.seller.name} — attached as a PDF.`,
    attachments: [{ filename: `invoice-${data.orderNumber}.pdf`, content: pdf, contentType: "application/pdf" }],
  });
  if (!ok) return { error: "Could not send the email. Try again shortly." };
  return { ok: true, to };
}
