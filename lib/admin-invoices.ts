import { getAdminSupabase } from "@/lib/supabase";
import { money } from "@/lib/money";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface InvoiceLineItem {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface AdminInvoice {
  id: string;
  invoiceNumber: string;
  kind: string;
  status: string;
  currency: string;
  businessId: string | null;
  businessName: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  notes: string | null;
  issuedOn: string | null;
  dueDate: string | null;
  paidAt: string | null;
  sentAt: string | null;
  createdAt: string;
  amount: number;
  items: InvoiceLineItem[];
}

export const ZOTOMIC_BILLER = {
  name: "Zotomic",
  email: process.env.MAIL_INVOICE_USER || "invoice@zotomic.com",
  site: (process.env.NEXT_PUBLIC_SITE_URL || "https://zotomic.com").replace(/^https?:\/\//, ""),
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function invoiceTotal(items: { quantity: number; unitPrice: number }[]): number {
  return round2(items.reduce((n, it) => n + Number(it.quantity) * Number(it.unitPrice), 0));
}

/** ZINV-YYMM-NNNNNN, sequential within the month. */
export async function nextInvoiceNumber(): Promise<string> {
  const db = getAdminSupabase();
  const now = new Date();
  const yymm = `${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const prefix = `ZINV-${yymm}-`;
  const { data } = await db
    .from("invoices")
    .select("invoice_number")
    .like("invoice_number", `${prefix}%`)
    .order("invoice_number", { ascending: false })
    .limit(1);
  const last = (data?.[0]?.invoice_number as string | undefined) ?? null;
  const seq = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(6, "0")}`;
}

function mapInvoice(inv: Record<string, unknown>, items: InvoiceLineItem[]): AdminInvoice {
  const biz = (Array.isArray(inv.businesses) ? inv.businesses[0] : inv.businesses) as { name?: string } | null;
  return {
    id: inv.id as string,
    invoiceNumber: inv.invoice_number as string,
    kind: (inv.kind as string) ?? "subscription",
    status: inv.status as string,
    currency: (inv.currency as string) ?? "BDT",
    businessId: (inv.business_id as string) ?? null,
    businessName: biz?.name ?? null,
    recipientName: (inv.recipient_name as string) ?? null,
    recipientEmail: (inv.recipient_email as string) ?? null,
    notes: (inv.notes as string) ?? null,
    issuedOn: (inv.issued_on as string) ?? null,
    dueDate: (inv.due_date as string) ?? null,
    paidAt: (inv.paid_at as string) ?? null,
    sentAt: (inv.sent_at as string) ?? null,
    createdAt: inv.created_at as string,
    amount: Number(inv.amount ?? 0),
    items,
  };
}

export async function getInvoice(id: string): Promise<AdminInvoice | null> {
  const db = getAdminSupabase();
  const { data: inv } = await db.from("invoices").select("*, businesses(name)").eq("id", id).maybeSingle();
  if (!inv) return null;
  const { data: rows } = await db
    .from("invoice_line_items")
    .select("id, description, quantity, unit_price, position")
    .eq("invoice_id", id)
    .order("position");
  const items: InvoiceLineItem[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    description: r.description as string,
    quantity: Number(r.quantity),
    unitPrice: Number(r.unit_price),
  }));
  return mapInvoice(inv, items);
}

export interface InvoiceListRow {
  id: string;
  invoiceNumber: string;
  kind: string;
  status: string;
  billedTo: string;
  amount: string;
  amountRaw: number;
  currency: string;
  issuedOn: string | null;
  dueDate: string | null;
  sent: boolean;
}

export async function listInvoices(opts: {
  status?: string;
  kind?: string;
  q?: string;
} = {}): Promise<InvoiceListRow[]> {
  const db = getAdminSupabase();
  let query = db
    .from("invoices")
    .select("id, invoice_number, kind, status, amount, currency, issued_on, due_date, sent_at, recipient_name, businesses(name)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (opts.status && opts.status !== "all") query = query.eq("status", opts.status);
  if (opts.kind && opts.kind !== "all") query = query.eq("kind", opts.kind);
  const { data } = await query;

  const q = (opts.q ?? "").trim().toLowerCase();
  return (data ?? [])
    .map((inv) => {
      const biz = (Array.isArray(inv.businesses) ? inv.businesses[0] : inv.businesses) as { name?: string } | null;
      const billedTo = biz?.name ?? (inv.recipient_name as string) ?? "—";
      return {
        id: inv.id as string,
        invoiceNumber: inv.invoice_number as string,
        kind: (inv.kind as string) ?? "subscription",
        status: inv.status as string,
        billedTo,
        amount: money(Number(inv.amount ?? 0), (inv.currency as string) ?? "BDT"),
        amountRaw: Number(inv.amount ?? 0),
        currency: (inv.currency as string) ?? "BDT",
        issuedOn: (inv.issued_on as string) ?? null,
        dueDate: (inv.due_date as string) ?? null,
        sent: !!inv.sent_at,
      };
    })
    .filter((r) => !q || r.invoiceNumber.toLowerCase().includes(q) || r.billedTo.toLowerCase().includes(q));
}

/** The single line every invoice shows even if it has no explicit line items. */
export function effectiveItems(inv: AdminInvoice): InvoiceLineItem[] {
  if (inv.items.length) return inv.items;
  return [{ description: inv.kind === "subscription" ? "Zotomic subscription" : "Services", quantity: 1, unitPrice: inv.amount }];
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

const fmtDate = (d: string | null) =>
  d ? new Date(d.length <= 10 ? d + "T00:00:00Z" : d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

/** Invoice as self-contained HTML — Zotomic is the biller, business/recipient is billed. */
export function renderInvoiceHtml(inv: AdminInvoice): string {
  const items = effectiveItems(inv);
  const total = invoiceTotal(items);
  const paid = inv.status === "paid";
  const billedTo = inv.businessName ?? inv.recipientName ?? "—";
  const m = (n: number) => money(n, inv.currency);

  const rows = items
    .map(
      (it) => `
      <tr style="border-bottom:1px solid #e8edf2">
        <td style="padding:12px 0;font-size:14px">${esc(it.description)}</td>
        <td style="padding:12px 8px;text-align:right;font-size:14px;color:#64748b">${it.quantity}</td>
        <td style="padding:12px 8px;text-align:right;font-size:14px;color:#64748b">${esc(m(it.unitPrice))}</td>
        <td style="padding:12px 0;text-align:right;font-size:14px">${esc(m(round2(it.quantity * it.unitPrice)))}</td>
      </tr>`,
    )
    .join("");

  return `
<div style="max-width:640px;margin:0 auto;background:#fff;color:#0f172a;font-family:Inter,Arial,sans-serif;padding:32px;border:1px solid #e8edf2;border-radius:14px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
    <div>
      <div style="font-size:20px;font-weight:800">${esc(ZOTOMIC_BILLER.name)}</div>
      <div style="font-size:12px;color:#64748b">${esc(ZOTOMIC_BILLER.email)} · ${esc(ZOTOMIC_BILLER.site)}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.02em">INVOICE</div>
      <div style="font-size:13px;color:#64748b">${esc(inv.invoiceNumber)}</div>
      <div style="margin-top:6px;display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;${
        paid ? "background:#dcfce7;color:#15803d" : "background:#fef9c3;color:#a16207"
      }">${esc(inv.status.toUpperCase())}</div>
    </div>
  </div>

  <div style="margin-top:24px;display:flex;justify-content:space-between;gap:24px">
    <div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8">Billed to</div>
      <div style="margin-top:4px;font-size:14px;font-weight:600">${esc(billedTo)}</div>
      ${inv.recipientEmail ? `<div style="font-size:12px;color:#64748b">${esc(inv.recipientEmail)}</div>` : ""}
    </div>
    <div style="text-align:right;font-size:13px;color:#64748b">
      <div>Issued ${esc(fmtDate(inv.issuedOn) ?? fmtDate(inv.createdAt) ?? "")}</div>
      ${inv.dueDate ? `<div>Due ${esc(fmtDate(inv.dueDate) ?? "")}</div>` : ""}
      ${inv.paidAt ? `<div>Paid ${esc(fmtDate(inv.paidAt) ?? "")}</div>` : ""}
    </div>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-top:20px">
    <thead>
      <tr style="border-bottom:2px solid #e8edf2">
        <th style="text-align:left;padding:8px 0;font-size:12px;color:#64748b;text-transform:uppercase">Description</th>
        <th style="text-align:right;padding:8px;font-size:12px;color:#64748b;text-transform:uppercase">Qty</th>
        <th style="text-align:right;padding:8px;font-size:12px;color:#64748b;text-transform:uppercase">Unit</th>
        <th style="text-align:right;padding:8px 0;font-size:12px;color:#64748b;text-transform:uppercase">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div style="display:flex;justify-content:flex-end;margin-top:16px">
    <table style="border-collapse:collapse;min-width:220px">
      <tr style="border-top:2px solid #0f172a">
        <td style="padding:8px 16px 0 0;font-weight:800">Total</td>
        <td style="padding:8px 0 0;text-align:right;font-weight:800">${esc(m(total))}</td>
      </tr>
    </table>
  </div>

  ${inv.notes ? `<div style="margin-top:24px;font-size:13px;color:#475569;white-space:pre-line">${esc(inv.notes)}</div>` : ""}

  <p style="margin-top:28px;font-size:12px;color:#94a3b8;text-align:center">
    Issued by ${esc(ZOTOMIC_BILLER.name)} · ${esc(ZOTOMIC_BILLER.email)}
  </p>
</div>`.trim();
}

/** Invoice as a one-page PDF (pdf-lib, no headless browser). */
export async function buildInvoicePdf(inv: AdminInvoice): Promise<Uint8Array> {
  const items = effectiveItems(inv);
  const total = invoiceTotal(items);
  const m = (n: number) => money(n, inv.currency);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.06, 0.09, 0.16);
  const muted = rgb(0.39, 0.45, 0.55);
  const line = rgb(0.91, 0.93, 0.95);

  const M = 48;
  let y = 842 - M;
  const text = (s: string, x: number, yy: number, size = 10, f = font, color = ink) =>
    page.drawText(s, { x, y: yy, size, font: f, color });
  const right = (s: string, xEnd: number, yy: number, size = 10, f = font, color = ink) =>
    page.drawText(s, { x: xEnd - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color });

  text(ZOTOMIC_BILLER.name, M, y, 16, bold);
  right("INVOICE", 595 - M, y, 18, bold);
  y -= 16;
  text(`${ZOTOMIC_BILLER.email}  ·  ${ZOTOMIC_BILLER.site}`, M, y, 9, font, muted);
  right(inv.invoiceNumber, 595 - M, y, 10, font, muted);
  y -= 12;
  right(inv.status.toUpperCase(), 595 - M, y, 9, bold, inv.status === "paid" ? rgb(0.08, 0.5, 0.2) : muted);

  y -= 36;
  text("BILLED TO", M, y, 8, bold, muted);
  right(`Issued ${fmtDate(inv.issuedOn) ?? fmtDate(inv.createdAt) ?? ""}`, 595 - M, y, 9, font, muted);
  y -= 14;
  text(inv.businessName ?? inv.recipientName ?? "-", M, y, 11, bold);
  if (inv.dueDate) {
    right(`Due ${fmtDate(inv.dueDate)}`, 595 - M, y, 9, font, muted);
  }
  if (inv.recipientEmail) {
    y -= 12;
    text(inv.recipientEmail, M, y, 9, font, muted);
  }

  y -= 30;
  page.drawLine({ start: { x: M, y }, end: { x: 595 - M, y }, thickness: 1, color: line });
  y -= 14;
  text("DESCRIPTION", M, y, 8, bold, muted);
  right("QTY", 360, y, 8, bold, muted);
  right("UNIT", 460, y, 8, bold, muted);
  right("AMOUNT", 595 - M, y, 8, bold, muted);
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: 595 - M, y }, thickness: 1, color: line });

  for (const it of items) {
    y -= 20;
    text(it.description.slice(0, 60), M, y, 10);
    right(String(it.quantity), 360, y, 10, font, muted);
    right(m(it.unitPrice), 460, y, 10, font, muted);
    right(m(round2(it.quantity * it.unitPrice)), 595 - M, y, 10);
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: 595 - M, y }, thickness: 0.5, color: line });
  }

  y -= 24;
  right("Total", 480, y, 11, bold);
  right(m(total), 595 - M, y, 12, bold);

  if (inv.notes) {
    y -= 40;
    text("NOTES", M, y, 8, bold, muted);
    y -= 14;
    for (const ln of inv.notes.split("\n").slice(0, 8)) {
      text(ln.slice(0, 90), M, y, 9, font, muted);
      y -= 12;
    }
  }

  text(`Issued by ${ZOTOMIC_BILLER.name} · ${ZOTOMIC_BILLER.email}`, M, M, 8, font, muted);

  return pdf.save();
}
