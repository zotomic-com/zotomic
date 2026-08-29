import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { OrderInvoiceData } from "@/lib/order-invoice";

// pdf-lib's standard fonts are Latin-1 only — the Taka sign (৳) can't be encoded,
// so render currency as an ASCII code/symbol.
const SYMBOL: Record<string, string> = { BDT: "Tk", USD: "$", EUR: "EUR", GBP: "GBP", INR: "Rs", PKR: "Rs" };
function pdfMoney(n: number, currency: string): string {
  const sym = SYMBOL[currency] ?? currency;
  const amount = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sym} ${amount}`;
}

const A4 = { w: 595.28, h: 841.89 };
const INK = rgb(0.06, 0.09, 0.16);
const MUTE = rgb(0.39, 0.45, 0.55);
const LINE = rgb(0.91, 0.93, 0.95);

async function tryEmbedLogo(pdf: PDFDocument, url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("png") || url.toLowerCase().includes(".png")) return await pdf.embedPng(bytes);
    return await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

export async function renderOrderInvoicePdf(d: OrderInvoiceData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4.w, A4.h]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const M = 48;
  let y = A4.h - M;

  const clip = (s: string, f: PDFFont, size: number, max: number) => {
    let t = s;
    while (t.length > 1 && f.widthOfTextAtSize(t, size) > max) t = t.slice(0, -1);
    return t === s ? s : `${t.slice(0, -1)}…`;
  };
  const text = (s: string, x: number, yy: number, opts: { size?: number; font?: PDFFont; color?: typeof INK } = {}) =>
    page.drawText(s, { x, y: yy, size: opts.size ?? 10, font: opts.font ?? font, color: opts.color ?? INK });
  const right = (s: string, xRight: number, yy: number, opts: { size?: number; font?: PDFFont; color?: typeof INK } = {}) => {
    const f = opts.font ?? font;
    const size = opts.size ?? 10;
    page.drawText(s, { x: xRight - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color: opts.color ?? INK });
  };
  const hline = (yy: number, color = LINE, thickness = 1) =>
    page.drawLine({ start: { x: M, y: yy }, end: { x: A4.w - M, y: yy }, thickness, color });

  // ── header ───────────────────────────────────────────────────────────────
  const s = d.seller;
  if (s.logoUrl) {
    const img = await tryEmbedLogo(pdf, s.logoUrl);
    if (img) {
      const h = 40;
      const w = Math.min((img.width / img.height) * h, 200);
      page.drawImage(img, { x: M, y: y - h, width: w, height: h });
      y -= h + 6;
    } else {
      text(s.name, M, y - 14, { size: 16, font: bold });
      y -= 26;
    }
  } else {
    text(s.name, M, y - 14, { size: 16, font: bold });
    y -= 26;
  }
  for (const l of [s.address, s.email, s.phone].filter(Boolean) as string[]) {
    text(clip(l, font, 9, 260), M, y, { size: 9, color: MUTE });
    y -= 12;
  }

  let ry = A4.h - M - 4;
  right("INVOICE", A4.w - M, ry - 14, { size: 20, font: bold });
  ry -= 30;
  right(d.orderNumber, A4.w - M, ry, { size: 11, color: MUTE });
  ry -= 14;
  right(d.placedOn, A4.w - M, ry, { size: 10, color: MUTE });

  y = Math.min(y, ry) - 24;

  // ── bill to / ship to ────────────────────────────────────────────────────
  const colY = y;
  text("BILL TO", M, colY, { size: 8, font: bold, color: MUTE });
  text(d.buyer.name, M, colY - 14, { size: 10 });
  let by = colY - 26;
  for (const l of [d.buyer.phone, d.buyer.email].filter(Boolean) as string[]) {
    text(l, M, by, { size: 9, color: MUTE });
    by -= 12;
  }

  const cx = M + 260;
  text("SHIP TO", cx, colY, { size: 8, font: bold, color: MUTE });
  let sy = colY - 14;
  const shipLines = [d.shipTo.line, d.shipTo.city].filter(Boolean) as string[];
  for (const l of shipLines.length ? shipLines : ["—"]) {
    text(clip(l, font, 9, 240), cx, sy, { size: 9, color: MUTE });
    sy -= 12;
  }
  if (d.shipTo.note) {
    text(clip(`Note: ${d.shipTo.note}`, font, 8, 240), cx, sy, { size: 8, color: MUTE });
    sy -= 12;
  }

  y = Math.min(by, sy) - 18;

  // ── items table ──────────────────────────────────────────────────────────
  const cQty = A4.w - M - 180;
  const cPrice = A4.w - M - 95;
  const cTotal = A4.w - M;
  hline(y, INK, 1.5);
  y -= 14;
  text("ITEM", M, y, { size: 8, font: bold, color: MUTE });
  right("QTY", cQty + 20, y, { size: 8, font: bold, color: MUTE });
  right("PRICE", cPrice + 30, y, { size: 8, font: bold, color: MUTE });
  right("TOTAL", cTotal, y, { size: 8, font: bold, color: MUTE });
  y -= 8;
  hline(y);
  y -= 16;

  for (const it of d.items) {
    text(clip(it.name, font, 10, cQty - M - 12), M, y, { size: 10 });
    right(String(it.qty), cQty + 20, y, { size: 10 });
    right(pdfMoney(it.unitPrice, d.currency), cPrice + 30, y, { size: 10 });
    right(pdfMoney(it.lineTotal, d.currency), cTotal, y, { size: 10 });
    y -= 12;
    if (it.variant) {
      text(clip(it.variant, font, 8, 260), M, y, { size: 8, color: MUTE });
      y -= 12;
    }
    y -= 4;
    hline(y);
    y -= 14;
    if (y < 160) {
      // extremely long orders — stop cleanly rather than overflow
      text("… more items on the order", M, y, { size: 8, color: MUTE });
      y -= 16;
      break;
    }
  }

  // ── totals ───────────────────────────────────────────────────────────────
  y -= 6;
  const tl = cPrice - 10;
  const totalLine = (label: string, value: string, strong = false) => {
    text(label, tl, y, { size: strong ? 11 : 10, font: strong ? bold : font, color: strong ? INK : MUTE });
    right(value, cTotal, y, { size: strong ? 11 : 10, font: strong ? bold : font });
    y -= strong ? 18 : 15;
  };
  totalLine("Subtotal", pdfMoney(d.subtotal, d.currency));
  totalLine("Shipping", d.shipping ? pdfMoney(d.shipping, d.currency) : "Free");
  if (d.discount) totalLine("Discount", `- ${pdfMoney(d.discount, d.currency)}`);
  page.drawLine({ start: { x: tl, y: y + 6 }, end: { x: cTotal, y: y + 6 }, thickness: 1.5, color: INK });
  y -= 4;
  totalLine("Total", pdfMoney(d.total, d.currency), true);

  // ── footer ───────────────────────────────────────────────────────────────
  drawFooter(page, font, d);

  return pdf.save();
}

function drawFooter(page: PDFPage, font: PDFFont, d: OrderInvoiceData) {
  const M = 48;
  const msg = d.branded
    ? `Payment: ${d.paymentMethod} (${d.paymentStatus})  -  Thank you for shopping with ${d.seller.name}.`
    : `Payment: ${d.paymentMethod} (${d.paymentStatus})  -  Powered by Zotomic`;
  page.drawText(font.widthOfTextAtSize(msg, 9) > A4.w - 2 * M ? msg.slice(0, 120) : msg, {
    x: M,
    y: 40,
    size: 9,
    font,
    color: MUTE,
  });
}
