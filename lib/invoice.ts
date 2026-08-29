import { getAdminSupabase } from "@/lib/supabase";
import { money } from "@/lib/money";
import { planName } from "@/lib/billing";
import type { PlanId } from "@/lib/plans";

export interface InvoiceData {
  invoiceNumber: string;
  status: string;
  issuedOn: string;
  dueOn: string | null;
  paidOn: string | null;
  amount: number;
  currency: string;
  planLabel: string;
  periodEnd: string | null;
  paymentReference: string | null;
  txnId: string | null;
  business: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
  };
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** Load one invoice + its business for the store owner. Returns null if not theirs. */
export async function getInvoiceData(businessId: string, invoiceId: string): Promise<InvoiceData | null> {
  const db = getAdminSupabase();
  const [{ data: inv }, { data: biz }, { data: sub }] = await Promise.all([
    db
      .from("invoices")
      .select("id, invoice_number, amount, currency, status, due_date, paid_at, created_at, payment_reference, txn_id")
      .eq("business_id", businessId)
      .eq("id", invoiceId)
      .maybeSingle(),
    db
      .from("businesses")
      .select("name, logo_url, invoice_address, contact_email, contact_phone")
      .eq("id", businessId)
      .maybeSingle(),
    db.from("subscriptions").select("plan, current_period_end").eq("business_id", businessId).maybeSingle(),
  ]);
  if (!inv || !biz) return null;

  const fmt = (d: string | null) =>
    d ? new Date(d.length <= 10 ? d + "T00:00:00Z" : d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

  return {
    invoiceNumber: inv.invoice_number as string,
    status: inv.status as string,
    issuedOn: fmt(inv.created_at as string) ?? "",
    dueOn: fmt(inv.due_date as string | null),
    paidOn: fmt(inv.paid_at as string | null),
    amount: Number(inv.amount),
    currency: (inv.currency as string) ?? "BDT",
    planLabel: planName((sub?.plan ?? "free") as PlanId),
    periodEnd: fmt((sub?.current_period_end as string) ?? null),
    paymentReference: (inv.payment_reference as string) ?? null,
    txnId: (inv.txn_id as string) ?? null,
    business: {
      name: biz.name as string,
      logoUrl: (biz.logo_url as string) ?? null,
      address: (biz.invoice_address as string) ?? null,
      email: (biz.contact_email as string) ?? null,
      phone: (biz.contact_phone as string) ?? null,
    },
  };
}

/** Self-contained invoice HTML (inline styles → safe for email + print). */
export function renderInvoiceHtml(d: InvoiceData): string {
  const paid = d.status === "paid";
  const b = d.business;
  const line = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#64748b;font-size:13px">${esc(label)}</td>` +
    `<td style="padding:6px 0;text-align:right;font-size:13px;color:#0f172a">${esc(value)}</td></tr>`;

  return `
<div style="max-width:640px;margin:0 auto;background:#fff;color:#0f172a;font-family:Inter,Arial,sans-serif;padding:32px;border:1px solid #e8edf2;border-radius:14px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
    <div>
      ${b.logoUrl ? `<img src="${esc(b.logoUrl)}" alt="${esc(b.name)}" style="max-height:52px;max-width:200px;margin-bottom:8px" />` : `<div style="font-size:20px;font-weight:800">${esc(b.name)}</div>`}
      <div style="font-size:12px;color:#64748b;white-space:pre-line">${esc([b.address, b.email, b.phone].filter(Boolean).join("\n"))}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.02em">INVOICE</div>
      <div style="font-size:13px;color:#64748b">${esc(d.invoiceNumber)}</div>
      <div style="margin-top:6px;display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;${
        paid ? "background:#dcfce7;color:#15803d" : "background:#fef9c3;color:#a16207"
      }">${paid ? "PAID" : esc(d.status.toUpperCase())}</div>
    </div>
  </div>

  <div style="margin-top:24px;padding:16px;background:#f8fafc;border-radius:12px">
    <table style="width:100%;border-collapse:collapse">
      ${line("Issued", d.issuedOn)}
      ${d.dueOn ? line("Due", d.dueOn) : ""}
      ${d.paidOn ? line("Paid on", d.paidOn) : ""}
      ${d.paymentReference ? line("Reference", d.paymentReference) : ""}
      ${d.txnId ? line("Transaction ID", d.txnId) : ""}
    </table>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-top:20px">
    <thead>
      <tr style="border-bottom:2px solid #e8edf2">
        <th style="text-align:left;padding:8px 0;font-size:12px;color:#64748b;text-transform:uppercase">Description</th>
        <th style="text-align:right;padding:8px 0;font-size:12px;color:#64748b;text-transform:uppercase">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr style="border-bottom:1px solid #e8edf2">
        <td style="padding:12px 0;font-size:14px">
          Zotomic ${esc(d.planLabel)} plan — monthly subscription
          ${d.periodEnd ? `<div style="font-size:12px;color:#64748b">Service period ending ${esc(d.periodEnd)}</div>` : ""}
        </td>
        <td style="padding:12px 0;text-align:right;font-size:14px">${esc(money(d.amount, d.currency))}</td>
      </tr>
    </tbody>
  </table>

  <div style="display:flex;justify-content:flex-end;margin-top:16px">
    <table style="border-collapse:collapse;min-width:220px">
      <tr>
        <td style="padding:6px 16px 6px 0;color:#64748b;font-size:13px">Subtotal</td>
        <td style="padding:6px 0;text-align:right;font-size:13px">${esc(money(d.amount, d.currency))}</td>
      </tr>
      <tr style="border-top:2px solid #0f172a">
        <td style="padding:8px 16px 0 0;font-weight:800">Total</td>
        <td style="padding:8px 0 0;text-align:right;font-weight:800">${esc(money(d.amount, d.currency))}</td>
      </tr>
    </table>
  </div>

  <p style="margin-top:28px;font-size:12px;color:#94a3b8;text-align:center">
    Billed by Zotomic on behalf of your subscription. Questions? Reply to this email.
  </p>
</div>`.trim();
}
