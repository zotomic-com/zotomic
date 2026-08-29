import { emailLayout, sendEmail, NOTIFICATION_EMAIL, type EmailAttachment } from "./email";
import { money } from "./money";

const esc = (s: string) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/* ── order confirmation (to the customer) ─────────────────────────────────── */
export async function sendOrderConfirmation(args: {
  to: string;
  storeName: string;
  orderNumber: string;
  currency: string;
  items: { name: string; qty: number; lineTotal: number }[];
  shipping: number;
  total: number;
  attachments?: EmailAttachment[];
}): Promise<boolean> {
  if (!args.to) return false;
  const rows = args.items
    .map(
      (i) =>
        `<tr><td style="padding:4px 0;color:#475569">${esc(i.name)} × ${i.qty}</td><td style="padding:4px 0;text-align:right">${money(
          i.lineTotal,
          args.currency,
        )}</td></tr>`,
    )
    .join("");
  return sendEmail({
    to: args.to,
    subject: `Order ${args.orderNumber} confirmed — ${args.storeName}`,
    html: emailLayout(`
      <h1 style="font-size:18px;margin:0 0 4px">Thanks for your order</h1>
      <p style="color:#475569;margin:0 0 16px">Order <b>${esc(args.orderNumber)}</b> from ${esc(args.storeName)}. We'll contact you to confirm delivery.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${rows}
        <tr><td style="padding:6px 0;border-top:1px solid #e8edf2;color:#475569">Shipping</td><td style="padding:6px 0;border-top:1px solid #e8edf2;text-align:right">${money(args.shipping, args.currency)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:700">Total</td><td style="padding:6px 0;text-align:right;font-weight:700">${money(args.total, args.currency)}</td></tr>
      </table>
      <p style="color:#94a3b8;font-size:13px;margin-top:16px">Payment: cash on delivery</p>
      ${args.attachments?.length ? `<p style="color:#94a3b8;font-size:13px">Your invoice is attached as a PDF.</p>` : ""}
    `),
    attachments: args.attachments,
  });
}

/* ── new order (to the shop owner) ───────────────────────────────────────── */
export async function sendNewOrderAlert(args: {
  to: string;
  orderNumber: string;
  customerName: string;
  total: number;
  currency: string;
}): Promise<boolean> {
  const to = args.to || NOTIFICATION_EMAIL;
  if (!to) return false;
  return sendEmail({
    to,
    subject: `New order ${args.orderNumber} — ${money(args.total, args.currency)}`,
    html: emailLayout(
      `<p style="margin:0"><b>${esc(args.customerName)}</b> just placed order <b>${esc(
        args.orderNumber,
      )}</b> for ${money(args.total, args.currency)}.</p>
       <p style="margin:12px 0 0"><a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/app/orders" style="color:#15803d;font-weight:600">Open in Zotomic →</a></p>`,
    ),
  });
}

/* ── weekly report ready (to the shop owner) ─────────────────────────────── */
export async function sendReportReady(args: {
  to: string;
  businessName: string;
  periodLabel: string;
  summary: string;
}): Promise<boolean> {
  if (!args.to) return false;
  return sendEmail({
    to: args.to,
    subject: `Your weekly report is ready — ${args.businessName}`,
    html: emailLayout(`
      <h1 style="font-size:18px;margin:0 0 4px">Weekly Intelligence</h1>
      <p style="color:#94a3b8;font-size:13px;margin:0 0 12px">${esc(args.periodLabel)}</p>
      <p style="color:#475569;line-height:1.6;margin:0 0 16px">${esc(args.summary)}</p>
      <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/app/intelligence" style="display:inline-block;background:#15803d;color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-weight:600;font-size:14px">View the full report →</a>
    `),
  });
}

/* ── review invitation (to the customer) ─────────────────────────────────── */
export async function sendReviewInvite(args: {
  to: string;
  storeName: string;
  productName: string;
  reviewUrl: string;
}): Promise<boolean> {
  if (!args.to) return false;
  return sendEmail({
    to: args.to,
    subject: `How was your ${args.productName}?`,
    html: emailLayout(`
      <p style="margin:0 0 16px;color:#475569">Your order from ${esc(args.storeName)} has been delivered. Would you leave a quick review of the <b>${esc(
        args.productName,
      )}</b>?</p>
      <a href="${esc(args.reviewUrl)}" style="display:inline-block;background:#15803d;color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-weight:600;font-size:14px">Write a review →</a>
    `),
  });
}

/* ── contact form (to admin) ────────────────────────────────────────────── */
export async function sendContactMessage(args: {
  name: string;
  email: string;
  phone?: string;
  business?: string;
  topic?: string;
  message: string;
}): Promise<boolean> {
  if (!NOTIFICATION_EMAIL) return false;
  return sendEmail({
    to: NOTIFICATION_EMAIL,
    replyTo: args.email,
    subject: `Contact${args.topic ? ` · ${args.topic}` : ""} — ${args.name}`,
    html: emailLayout(`
      <p style="margin:0"><b>${esc(args.name)}</b> &lt;${esc(args.email)}&gt;${args.phone ? ` · ${esc(args.phone)}` : ""}</p>
      ${args.business ? `<p style="margin:4px 0;color:#475569">${esc(args.business)}</p>` : ""}
      <hr style="border:none;border-top:1px solid #e8edf2;margin:12px 0"/>
      <p style="margin:0;white-space:pre-line;color:#475569">${esc(args.message)}</p>
    `),
  });
}
