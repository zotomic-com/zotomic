import { getAdminSupabase } from "@/lib/supabase";
import { money } from "@/lib/money";
import { getEntitlements } from "@/lib/entitlements";

export interface OrderInvoiceData {
  orderNumber: string;
  status: string;
  placedOn: string;
  currency: string;
  paymentMethod: string;
  paymentStatus: string;
  seller: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
  };
  buyer: { name: string; phone: string | null; email: string | null };
  shipTo: { line: string | null; city: string | null; note: string | null };
  items: { name: string; variant: string | null; qty: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  /** paid plan → own logo, no "Powered by Zotomic"; free → no logo, branding shown */
  branded: boolean;
}

const money0 = (n: number, c: string) => money(n, c);

/** Load one order + seller identity for a customer-facing invoice. `key` is an order number or id. */
export async function getOrderInvoiceData(businessId: string, key: string): Promise<OrderInvoiceData | null> {
  const db = getAdminSupabase();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(key);

  let q = db
    .from("orders")
    .select(
      "id, order_number, status, placed_at, payment_method, payment_status, subtotal, shipping, discount, total, currency, address, notes, customers(name, phone, email, city), order_items(name, variant_label, qty, unit_price, line_total)",
    )
    .eq("business_id", businessId)
    .limit(1);
  q = isUuid ? q.eq("id", key) : q.eq("order_number", key);
  const { data: o } = await q.maybeSingle();
  if (!o) return null;

  const [{ data: biz }, { data: sf }, ent] = await Promise.all([
    db
      .from("businesses")
      .select("name, logo_url, invoice_address, contact_email, contact_phone")
      .eq("id", businessId)
      .maybeSingle(),
    db.from("storefront_config").select("published_json, draft_json").eq("business_id", businessId).maybeSingle(),
    getEntitlements(businessId),
  ]);

  const brand =
    ((sf?.published_json as { brand?: { logoUrl?: string } } | null)?.brand) ??
    ((sf?.draft_json as { brand?: { logoUrl?: string } } | null)?.brand) ??
    {};
  const branded = ent.branded_invoice;
  const logoUrl = branded ? (biz?.logo_url as string) || brand.logoUrl || null : null;

  const cust = (Array.isArray(o.customers) ? o.customers[0] : o.customers) as
    | { name?: string; phone?: string; email?: string; city?: string }
    | null;
  const addr = (o.address ?? {}) as { line?: string; city?: string; note?: string };
  const currency = (o.currency as string) ?? "BDT";

  return {
    orderNumber: o.order_number as string,
    status: o.status as string,
    placedOn: new Date(o.placed_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    currency,
    paymentMethod: o.payment_method === "cod" ? "Cash on delivery" : (o.payment_method as string),
    paymentStatus: o.payment_status as string,
    seller: {
      name: (biz?.name as string) ?? "Store",
      logoUrl,
      address: branded ? (biz?.invoice_address as string) ?? null : null,
      email: (biz?.contact_email as string) ?? null,
      phone: (biz?.contact_phone as string) ?? null,
    },
    buyer: { name: cust?.name ?? "Customer", phone: cust?.phone ?? null, email: cust?.email ?? null },
    shipTo: { line: addr.line ?? null, city: addr.city ?? cust?.city ?? null, note: addr.note ?? null },
    items: ((o.order_items ?? []) as Record<string, unknown>[]).map((i) => ({
      name: i.name as string,
      variant: (i.variant_label as string) ?? null,
      qty: Number(i.qty),
      unitPrice: Number(i.unit_price),
      lineTotal: Number(i.line_total),
    })),
    subtotal: Number(o.subtotal),
    shipping: Number(o.shipping),
    discount: Number(o.discount ?? 0),
    total: Number(o.total),
    branded,
  };
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** Self-contained invoice HTML (inline styles → safe for email + browser print). */
export function renderOrderInvoiceHtml(d: OrderInvoiceData): string {
  const s = d.seller;
  const cur = d.currency;
  const rows = d.items
    .map(
      (i) => `<tr style="border-bottom:1px solid #e8edf2">
      <td style="padding:10px 0;font-size:13px">${esc(i.name)}${i.variant ? `<div style="font-size:11px;color:#64748b">${esc(i.variant)}</div>` : ""}</td>
      <td style="padding:10px 0;text-align:center;font-size:13px">${i.qty}</td>
      <td style="padding:10px 0;text-align:right;font-size:13px">${esc(money0(i.unitPrice, cur))}</td>
      <td style="padding:10px 0;text-align:right;font-size:13px">${esc(money0(i.lineTotal, cur))}</td>
    </tr>`,
    )
    .join("");

  const totalRow = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#64748b;font-size:13px${bold ? ";font-weight:800;color:#0f172a" : ""}">${esc(label)}</td>` +
    `<td style="padding:4px 0;text-align:right;font-size:13px${bold ? ";font-weight:800" : ""}">${esc(value)}</td></tr>`;

  return `
<div style="max-width:640px;margin:0 auto;background:#fff;color:#0f172a;font-family:Inter,Arial,sans-serif;padding:32px;border:1px solid #e8edf2;border-radius:14px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
    <div>
      ${s.logoUrl ? `<img src="${esc(s.logoUrl)}" alt="${esc(s.name)}" style="max-height:56px;max-width:220px;margin-bottom:8px" />` : `<div style="font-size:20px;font-weight:800">${esc(s.name)}</div>`}
      <div style="font-size:12px;color:#64748b;white-space:pre-line">${esc([s.address, s.email, s.phone].filter(Boolean).join("\n"))}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.02em">INVOICE</div>
      <div style="font-size:13px;color:#64748b">${esc(d.orderNumber)}</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px">${esc(d.placedOn)}</div>
    </div>
  </div>

  <div style="display:flex;gap:32px;margin-top:24px;flex-wrap:wrap">
    <div style="min-width:200px">
      <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;font-weight:700">Bill to</div>
      <div style="font-size:13px;margin-top:4px">${esc(d.buyer.name)}</div>
      ${d.buyer.phone ? `<div style="font-size:13px;color:#64748b">${esc(d.buyer.phone)}</div>` : ""}
      ${d.buyer.email ? `<div style="font-size:13px;color:#64748b">${esc(d.buyer.email)}</div>` : ""}
    </div>
    <div style="min-width:200px">
      <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;font-weight:700">Ship to</div>
      <div style="font-size:13px;margin-top:4px;color:#64748b;white-space:pre-line">${esc(
        [d.shipTo.line, d.shipTo.city].filter(Boolean).join("\n") || "—",
      )}</div>
      ${d.shipTo.note ? `<div style="font-size:12px;color:#94a3b8;margin-top:2px">Note: ${esc(d.shipTo.note)}</div>` : ""}
    </div>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-top:24px">
    <thead>
      <tr style="border-bottom:2px solid #e8edf2">
        <th style="text-align:left;padding:8px 0;font-size:11px;color:#94a3b8;text-transform:uppercase">Item</th>
        <th style="text-align:center;padding:8px 0;font-size:11px;color:#94a3b8;text-transform:uppercase">Qty</th>
        <th style="text-align:right;padding:8px 0;font-size:11px;color:#94a3b8;text-transform:uppercase">Price</th>
        <th style="text-align:right;padding:8px 0;font-size:11px;color:#94a3b8;text-transform:uppercase">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div style="display:flex;justify-content:space-between;margin-top:16px;flex-wrap:wrap;gap:16px">
    <div style="font-size:12px;color:#64748b">
      Payment: ${esc(d.paymentMethod)} (${esc(d.paymentStatus)})<br/>Order status: ${esc(d.status)}
    </div>
    <table style="border-collapse:collapse;min-width:220px">
      ${totalRow("Subtotal", money0(d.subtotal, cur))}
      ${totalRow("Shipping", d.shipping ? money0(d.shipping, cur) : "Free")}
      ${d.discount ? totalRow("Discount", `- ${money0(d.discount, cur)}`) : ""}
      <tr><td colspan="2" style="border-top:2px solid #0f172a"></td></tr>
      ${totalRow("Total", money0(d.total, cur), true)}
    </table>
  </div>

  <p style="margin-top:28px;font-size:12px;color:#94a3b8;text-align:center">
    ${
      d.branded
        ? `Thank you for shopping with ${esc(d.seller.name)}.`
        : `Thank you for your order. &nbsp;·&nbsp; Powered by Zotomic`
    }
  </p>
</div>`.trim();
}
