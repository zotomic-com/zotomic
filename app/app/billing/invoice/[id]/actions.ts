"use server";

import { requireBusiness } from "@/lib/app-actions";
import { getInvoiceData, renderInvoiceHtml } from "@/lib/invoice";
import { sendEmail, emailConfigured } from "@/lib/email";

export async function emailInvoice(
  invoiceId: string,
  toOverride?: string,
): Promise<{ error: string } | { ok: true; to: string }> {
  const { businessId, user } = await requireBusiness({ allowReadOnly: true });
  const data = await getInvoiceData(businessId, invoiceId);
  if (!data) return { error: "Invoice not found" };

  const to = (toOverride || data.business.email || user.email || "").trim();
  if (!to) return { error: "Add a contact email in Settings or enter one." };
  if (!emailConfigured()) return { error: "Email isn't configured yet — use Print / Save as PDF for now." };

  const ok = await sendEmail({
    to,
    subject: `Invoice ${data.invoiceNumber} — Zotomic`,
    html: `<div style="background:#f1f5f9;padding:24px">${renderInvoiceHtml(data)}</div>`,
    text: `Invoice ${data.invoiceNumber} for ${data.planLabel} plan — ${data.amount} ${data.currency}. Status: ${data.status}.`,
  });
  if (!ok) return { error: "Could not send the email. Try again shortly." };
  return { ok: true, to };
}
