import { getAdminSupabase } from "@/lib/supabase";
import { getDomainSettings } from "@/lib/platform-settings";
import { checkAvailability, registerDomain, renewDomain, setNameservers } from "./dynadot";
import { createZone, addDnsRecord, setupEmailRouting } from "./cloudflare";
import { addProjectDomain, dnsRecords } from "@/lib/vercel-domains";

/** A curated set of alternates offered alongside whatever TLD the customer actually searched. */
export const SUGGESTED_TLDS = ["com", "net", "org", "shop", "store", "online", "xyz", "info", "co", "com.bd"];
const TWO_PART_TLDS = ["com.bd", "net.bd", "org.bd", "co.uk"];

export function splitDomain(input: string): { base: string; tld: string } {
  const lower = input.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  for (const t of TWO_PART_TLDS) {
    if (lower.endsWith(`.${t}`)) return { base: lower.slice(0, -(t.length + 1)), tld: t };
  }
  const parts = lower.split(".");
  if (parts.length < 2) return { base: lower, tld: "com" };
  return { base: parts.slice(0, -1).join("."), tld: parts[parts.length - 1] };
}

export interface PricedDomain {
  domain: string;
  available: boolean;
  wholesaleUsd: number | null;
  priceBDT: number | null;
}

function retailPriceBDT(wholesaleUsd: number, settings: { usdToBdtRate: number; markupPercent: number }): number {
  return Math.round(((wholesaleUsd * settings.usdToBdtRate * (1 + settings.markupPercent / 100)) / 10)) * 10;
}

/** The searched domain plus priced availability for a curated set of alternate TLDs on the same name. */
export async function searchWithSuggestions(query: string): Promise<PricedDomain[] | { error: string }> {
  const { base, tld } = splitDomain(query.includes(".") ? query : `${query}.com`);
  const candidates = [`${base}.${tld}`, ...SUGGESTED_TLDS.filter((t) => t !== tld).map((t) => `${base}.${t}`)];
  const unique = [...new Set(candidates)].slice(0, 15);

  const [settings, results] = await Promise.all([getDomainSettings(), checkAvailability(unique)]);
  if ("error" in results) return results;

  const byDomain = new Map(results.map((r) => [r.domain.toLowerCase(), r]));
  return unique.map((d) => {
    const r = byDomain.get(d);
    const wholesaleUsd = r?.wholesaleCost ?? null;
    return {
      domain: d,
      available: r?.available ?? false,
      wholesaleUsd,
      priceBDT: wholesaleUsd != null ? retailPriceBDT(wholesaleUsd, settings) : null,
    };
  });
}

export interface CreateOrderInput {
  domainName: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  forwardToEmail?: string;
  pointTo: "zotomic" | "self";
  wholesaleCostUsd: number;
  paymentMethod: "bkash" | "nagad";
}

export async function createOrder(
  input: CreateOrderInput,
): Promise<{ ok: true; orderNumber: string; invoiceAmount: number; payTo: string } | { error: string }> {
  const settings = await getDomainSettings();
  if (!settings.enabled) return { error: "Domain sales are currently unavailable." };
  const payTo = input.paymentMethod === "bkash" ? settings.bkashNumber : settings.nagadNumber;
  if (!payTo) return { error: "That payment method isn't set up yet — try the other one." };

  const retailPrice = retailPriceBDT(input.wholesaleCostUsd, settings);
  const db = getAdminSupabase();

  let invoiceAmount = retailPrice;
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = Math.round((retailPrice + Math.random() * 0.98 + 0.01) * 100) / 100;
    const { data: clash } = await db
      .from("domain_orders")
      .select("id")
      .eq("invoice_amount", candidate)
      .eq("status", "pending_payment")
      .maybeSingle();
    if (!clash) {
      invoiceAmount = candidate;
      break;
    }
  }

  const orderNumber = `DR-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const { error } = await db.from("domain_orders").insert({
    order_number: orderNumber,
    domain_name: input.domainName,
    customer_name: input.customerName.slice(0, 120),
    customer_phone: input.customerPhone.slice(0, 32),
    customer_email: input.customerEmail?.slice(0, 200) || null,
    forward_to_email: input.forwardToEmail?.slice(0, 200) || null,
    point_to: input.pointTo,
    wholesale_cost: input.wholesaleCostUsd,
    retail_price: retailPrice,
    invoice_amount: invoiceAmount,
    payment_method: input.paymentMethod,
  });
  if (error) return { error: "Could not create the order. Please try again." };
  return { ok: true, orderNumber, invoiceAmount, payTo };
}

function parseSms(text: string): { amount: number | null; senderNumber: string | null; trxId: string | null } {
  const amountMatch = text.match(/Tk\.?\s*([\d,]+\.\d{2}|[\d,]+)/i);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : null;
  const senderMatch = text.match(/\b(01[3-9]\d{8})\b/);
  const trxMatch = text.match(/\b(?:TrxID|TxnID|Transaction ID)\s*[:.]?\s*([A-Za-z0-9]{6,})/i);
  return {
    amount,
    senderNumber: senderMatch ? senderMatch[1] : null,
    trxId: trxMatch ? trxMatch[1] : null,
  };
}

/**
 * Parse a forwarded bKash/Nagad SMS, match it to a pending order by exact
 * invoice amount, mark it paid, log every attempt (matched or not — an
 * unmatched payment should be visible for manual review, never silently
 * dropped), and kick off fulfillment on a match.
 */
export async function matchPayment(rawText: string): Promise<{ matched: boolean; orderId?: string }> {
  const { amount, senderNumber, trxId } = parseSms(rawText);
  const db = getAdminSupabase();
  let matchedOrderId: string | null = null;

  if (amount != null) {
    const provider = /bkash/i.test(rawText) ? "bkash" : /nagad/i.test(rawText) ? "nagad" : null;
    let query = db.from("domain_orders").select("id").eq("status", "pending_payment").eq("invoice_amount", amount);
    if (provider) query = query.eq("payment_method", provider);
    const { data: order } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (order) {
      matchedOrderId = order.id as string;
      await db
        .from("domain_orders")
        .update({ status: "paid", paid_trx_id: trxId, paid_at: new Date().toISOString() })
        .eq("id", matchedOrderId);
    }
  }

  await db.from("domain_sms_log").insert({
    raw_text: rawText.slice(0, 1000),
    sender_number: senderNumber,
    amount,
    trx_id: trxId,
    matched_order_id: matchedOrderId,
  });

  if (matchedOrderId) {
    await fulfillOrder(matchedOrderId);
    return { matched: true, orderId: matchedOrderId };
  }
  return { matched: false };
}

/**
 * Register → point at Cloudflare → DNS + mail. Stops and records `last_error`
 * at the first failed step rather than guessing forward — a partial state
 * (e.g. registered but zone creation failed) is meant to surface for manual
 * follow-up, not to be masked as success.
 */
export async function fulfillOrder(orderId: string): Promise<void> {
  const db = getAdminSupabase();
  const { data: order } = await db.from("domain_orders").select("*").eq("id", orderId).maybeSingle();
  if (!order || order.status !== "paid") return;

  const fail = async (message: string) => {
    await db.from("domain_orders").update({ status: "failed", last_error: message }).eq("id", orderId);
  };

  await db.from("domain_orders").update({ status: "registering" }).eq("id", orderId);

  const reg = await registerDomain(order.domain_name as string);
  if ("error" in reg) return fail(`Registration: ${reg.error}`);

  const zone = await createZone(order.domain_name as string);
  if ("error" in zone) return fail(`Cloudflare zone: ${zone.error}`);

  const ns = await setNameservers(order.domain_name as string, zone.nameservers);
  if ("error" in ns) return fail(`Nameservers: ${ns.error}`);

  if (order.point_to === "zotomic") {
    for (const rec of dnsRecords(order.domain_name as string)) {
      const added = await addDnsRecord(zone.zoneId, { type: rec.type as "A" | "CNAME", name: rec.name, content: rec.value });
      if ("error" in added) return fail(`DNS record: ${added.error}`);
    }
    await addProjectDomain(order.domain_name as string);
  }

  if (order.forward_to_email) {
    const mail = await setupEmailRouting(zone.zoneId, order.forward_to_email as string);
    if ("error" in mail) {
      // Non-fatal — the domain itself is live; email forwarding can be retried separately.
      await db.from("domain_orders").update({ last_error: `Email routing: ${mail.error}` }).eq("id", orderId);
    }
  }

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  await db
    .from("domain_orders")
    .update({
      status: "active",
      registered_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString().slice(0, 10),
    })
    .eq("id", orderId);
}

export async function renewOrder(orderId: string): Promise<{ ok: true } | { error: string }> {
  const db = getAdminSupabase();
  const { data: order } = await db.from("domain_orders").select("domain_name, expires_at").eq("id", orderId).maybeSingle();
  if (!order) return { error: "Order not found." };

  const res = await renewDomain(order.domain_name as string);
  if ("error" in res) return res;

  const next = order.expires_at ? new Date(order.expires_at as string) : new Date();
  next.setFullYear(next.getFullYear() + 1);
  await db.from("domain_orders").update({ expires_at: next.toISOString().slice(0, 10), last_error: null }).eq("id", orderId);
  return { ok: true };
}
