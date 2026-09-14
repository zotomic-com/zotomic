import { unstable_cache } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase";
import { getDomainSettings } from "@/lib/platform-settings";
import { checkAvailability, registerDomain, renewDomain, setNameservers, transferDomain } from "./dynadot";
import { createZone, addDnsRecord, setupEmailRouting } from "./cloudflare";
import { addProjectDomain, dnsRecords } from "@/lib/vercel-domains";
import { getLiveUsdToBdtRate } from "@/lib/fx-rate";
import { getPricingRules, resolveCommissionPercent, type PriceKind } from "./pricing-rules";

/** A curated set of alternates offered alongside whatever TLD the customer actually searched. Excludes com.bd — Dynadot's RESTful v2 search doesn't support that domain type. */
export const SUGGESTED_TLDS = ["com", "net", "org", "shop", "store", "online", "xyz", "info", "co"];
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
  renewalPriceBDT: number | null;
}

export interface PricingContext {
  usdToBdtRate: number;
  fxSource: "live" | "fallback";
  markupPercentFirstYear: number;
  markupPercentRenewal: number;
  rules: import("./pricing-rules").PricingRule[];
}

export async function getPricingContext(): Promise<PricingContext> {
  const [settings, fx, rules] = await Promise.all([getDomainSettings(), getLiveUsdToBdtRate(), getPricingRules()]);
  return {
    usdToBdtRate: fx.rate,
    fxSource: fx.source,
    markupPercentFirstYear: settings.markupPercent,
    markupPercentRenewal: settings.markupPercentRenewal,
    rules,
  };
}

/** Retail price for a given TLD + price kind — a per-TLD commission override if one exists, else the matching global default; live FX rate. */
export function retailPriceBDT(wholesaleUsd: number, tld: string, kind: PriceKind, ctx: PricingContext): number {
  const globalDefault = kind === "first_year" ? ctx.markupPercentFirstYear : ctx.markupPercentRenewal;
  const commission = resolveCommissionPercent(ctx.rules, "dynadot", tld, kind, globalDefault);
  return Math.round((wholesaleUsd * ctx.usdToBdtRate * (1 + commission / 100)) / 10) * 10;
}

/** The searched domain plus priced availability for a curated set of alternate TLDs on the same name. */
export async function searchWithSuggestions(query: string): Promise<PricedDomain[] | { error: string }> {
  const { base, tld } = splitDomain(query.includes(".") ? query : `${query}.com`);
  const candidates = [`${base}.${tld}`, ...SUGGESTED_TLDS.filter((t) => t !== tld).map((t) => `${base}.${t}`)];
  const unique = [...new Set(candidates)].slice(0, 15);

  const [ctx, results] = await Promise.all([getPricingContext(), checkAvailability(unique)]);
  if ("error" in results) return results;

  const byDomain = new Map(results.map((r) => [r.domain.toLowerCase(), r]));
  return unique.map((d) => {
    const r = byDomain.get(d);
    const domainTld = splitDomain(d).tld;
    const wholesaleUsd = r?.wholesaleCost ?? null;
    const wholesaleRenewalUsd = r?.wholesaleRenewalCost ?? null;
    return {
      domain: d,
      available: r?.available ?? false,
      wholesaleUsd,
      priceBDT: wholesaleUsd != null ? retailPriceBDT(wholesaleUsd, domainTld, "first_year", ctx) : null,
      renewalPriceBDT: wholesaleRenewalUsd != null ? retailPriceBDT(wholesaleRenewalUsd, domainTld, "renewal", ctx) : null,
    };
  });
}

/** Reference wholesale prices per TLD (via a probe domain) — for the admin Pricing tab's display only, cached to avoid hammering Dynadot on every page load. */
const fetchTldReferencePrices = unstable_cache(
  async (tlds: string[]): Promise<Record<string, { wholesaleUsd: number | null; wholesaleRenewalUsd: number | null }>> => {
    const unique = [...new Set(tlds)];
    const probes = unique.map((t) => `zotomic-price-probe.${t}`);
    const results = await checkAvailability(probes);
    // Throw rather than return {} on failure — a transient Dynadot hiccup must
    // never get cached as "no prices available" for the full revalidate window.
    if ("error" in results) throw new Error(results.error);
    const map: Record<string, { wholesaleUsd: number | null; wholesaleRenewalUsd: number | null }> = {};
    for (const r of results) {
      const tld = splitDomain(r.domain).tld;
      map[tld] = { wholesaleUsd: r.wholesaleCost, wholesaleRenewalUsd: r.wholesaleRenewalCost };
    }
    return map;
  },
  ["tld-reference-prices"],
  { revalidate: 3600 },
);

/** Wraps the cached fetch — a failure (transient or not) degrades to "no reference price" rather than breaking the admin page. */
export async function getTldReferencePrices(
  tlds: string[],
): Promise<Record<string, { wholesaleUsd: number | null; wholesaleRenewalUsd: number | null }>> {
  try {
    return await fetchTldReferencePrices(tlds);
  } catch {
    return {};
  }
}

export interface CartCheckoutItem {
  type: "register" | "transfer";
  domainName: string;
  authCode?: string;
  pointTo: "zotomic" | "self";
  forwardToEmail?: string;
}

export interface CreateCartOrderInput {
  userId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  paymentMethod: "bkash" | "nagad";
  items: CartCheckoutItem[];
}

/**
 * Re-verify every line item's price server-side (never trust a client-quoted
 * price — same principle as the storefront checkout), sum into one combined
 * invoice, and write one parent order + one child row per domain.
 */
export async function createCartOrder(
  input: CreateCartOrderInput,
): Promise<{ ok: true; orderNumber: string; invoiceAmount: number; payTo: string } | { error: string }> {
  const settings = await getDomainSettings();
  if (!settings.enabled) return { error: "Domain sales are currently unavailable." };
  if (input.items.length === 0) return { error: "Your cart is empty." };
  const payTo = input.paymentMethod === "bkash" ? settings.bkashNumber : settings.nagadNumber;
  if (!payTo) return { error: "That payment method isn't set up yet — try the other one." };

  const registerNames = input.items.filter((i) => i.type === "register").map((i) => i.domainName);
  const [quotes, ctx] = await Promise.all([
    registerNames.length ? checkAvailability(registerNames) : Promise.resolve([]),
    getPricingContext(),
  ]);
  if ("error" in quotes) return quotes;
  const byDomain = new Map(quotes.map((q) => [q.domain.toLowerCase(), q]));

  const priced: { item: CartCheckoutItem; wholesaleCost: number; retailPrice: number }[] = [];
  for (const item of input.items) {
    const tld = splitDomain(item.domainName).tld;
    if (item.type === "register") {
      const q = byDomain.get(item.domainName.toLowerCase());
      if (!q || !q.available || q.wholesaleCost == null) {
        return { error: `${item.domainName} is no longer available.` };
      }
      priced.push({ item, wholesaleCost: q.wholesaleCost, retailPrice: retailPriceBDT(q.wholesaleCost, tld, "first_year", ctx) });
    } else {
      if (!item.authCode?.trim()) return { error: `An auth/EPP code is required to transfer ${item.domainName}.` };
      // Dynadot doesn't price transfers via `search` — a transfer is a flat one-year-equivalent fee.
      const wholesaleCost = 12;
      priced.push({ item, wholesaleCost, retailPrice: retailPriceBDT(wholesaleCost, tld, "first_year", ctx) });
    }
  }

  const subtotal = priced.reduce((sum, p) => sum + p.retailPrice, 0);
  const db = getAdminSupabase();

  let invoiceAmount = subtotal;
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = Math.round((subtotal + Math.random() * 0.98 + 0.01) * 100) / 100;
    const { data: clash } = await db
      .from("domain_cart_orders")
      .select("id")
      .eq("invoice_amount", candidate)
      .eq("status", "pending_payment")
      .maybeSingle();
    if (!clash) {
      invoiceAmount = candidate;
      break;
    }
  }

  const orderNumber = `DC-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const { data: order, error } = await db
    .from("domain_cart_orders")
    .insert({
      order_number: orderNumber,
      user_id: input.userId,
      customer_name: input.customerName.slice(0, 120),
      customer_phone: input.customerPhone.slice(0, 32),
      customer_email: input.customerEmail?.slice(0, 200) || null,
      payment_method: input.paymentMethod,
      subtotal,
      invoice_amount: invoiceAmount,
    })
    .select("id")
    .single();
  if (error || !order) return { error: "Could not create the order. Please try again." };

  const { error: itemsError } = await db.from("domain_cart_items").insert(
    priced.map((p) => ({
      cart_order_id: order.id,
      item_type: p.item.type,
      domain_name: p.item.domainName,
      auth_code: p.item.authCode ?? null,
      point_to: p.item.pointTo,
      forward_to_email: p.item.forwardToEmail || null,
      wholesale_cost: p.wholesaleCost,
      retail_price: p.retailPrice,
    })),
  );
  if (itemsError) {
    await db.from("domain_cart_orders").delete().eq("id", order.id);
    return { error: "Could not create the order. Please try again." };
  }

  const { notifyAdmins } = await import("@/lib/notify");
  await notifyAdmins("domain_order_placed", {
    title: `New domain order — ${orderNumber}`,
    body: `${input.customerName} · ৳${invoiceAmount} · ${input.paymentMethod} · ${priced.map((p) => p.item.domainName).join(", ")}`,
    href: "/admin/domains",
  });

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
 * combined invoice amount, mark it paid, log every attempt (matched or not —
 * an unmatched payment should be visible for manual review, never silently
 * dropped), and kick off fulfillment for every item in the order on a match.
 */
export async function matchPayment(rawText: string): Promise<{ matched: boolean; orderId?: string }> {
  const { amount, senderNumber, trxId } = parseSms(rawText);
  const db = getAdminSupabase();
  let matchedOrderId: string | null = null;

  if (amount != null) {
    const provider = /bkash/i.test(rawText) ? "bkash" : /nagad/i.test(rawText) ? "nagad" : null;
    let query = db.from("domain_cart_orders").select("id").eq("status", "pending_payment").eq("invoice_amount", amount);
    if (provider) query = query.eq("payment_method", provider);
    const { data: order } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (order) {
      matchedOrderId = order.id as string;
      await db
        .from("domain_cart_orders")
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
    await fulfillCartOrder(matchedOrderId);
    return { matched: true, orderId: matchedOrderId };
  }
  return { matched: false };
}

/**
 * Register/point-at-Cloudflare/DNS+mail for one domain line item. Stops and
 * records `last_error` at the first failed step rather than guessing forward.
 */
async function fulfillItem(item: Record<string, unknown>): Promise<void> {
  const db = getAdminSupabase();
  const itemId = item.id as string;
  const domainName = item.domain_name as string;

  const fail = async (message: string) => {
    await db.from("domain_cart_items").update({ status: "failed", last_error: message }).eq("id", itemId);
  };

  if (item.item_type === "transfer") {
    await db.from("domain_cart_items").update({ status: "transferring" }).eq("id", itemId);
    const res = await transferDomain(domainName, (item.auth_code as string) ?? "");
    if ("error" in res) return fail(`Transfer: ${res.error}`);
    return; // becomes 'active' once app/api/cron/domain-renewals polls getTransferStatus to completion
  }

  await db.from("domain_cart_items").update({ status: "registering" }).eq("id", itemId);

  const reg = await registerDomain(domainName);
  if ("error" in reg) return fail(`Registration: ${reg.error}`);

  const zone = await createZone(domainName);
  if ("error" in zone) return fail(`Cloudflare zone: ${zone.error}`);

  const ns = await setNameservers(domainName, zone.nameservers);
  if ("error" in ns) return fail(`Nameservers: ${ns.error}`);

  if (item.point_to === "zotomic") {
    for (const rec of dnsRecords(domainName)) {
      const added = await addDnsRecord(zone.zoneId, { type: rec.type as "A" | "CNAME", name: rec.name, content: rec.value });
      if ("error" in added) return fail(`DNS record: ${added.error}`);
    }
    await addProjectDomain(domainName);
  }

  if (item.forward_to_email) {
    const mail = await setupEmailRouting(zone.zoneId, item.forward_to_email as string);
    if ("error" in mail) {
      // Non-fatal — the domain itself is live; email forwarding can be retried separately.
      await db.from("domain_cart_items").update({ last_error: `Email routing: ${mail.error}` }).eq("id", itemId);
    }
  }

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  await db
    .from("domain_cart_items")
    .update({ status: "active", registered_at: new Date().toISOString(), expires_at: expiresAt.toISOString().slice(0, 10) })
    .eq("id", itemId);
}

export interface UserDomainOrder {
  orderNumber: string;
  status: string;
  invoiceAmountBDT: number;
  method: string;
  createdAt: string;
  items: { domain: string; type: string; status: string; expiresAt: string | null; lastError: string | null }[];
}

/** A signed-in user's own domain orders (any status) — shared by the Front Desk and Hermes assistants. */
export async function getUserDomainOrders(userId: string): Promise<UserDomainOrder[]> {
  const db = getAdminSupabase();
  const { data } = await db
    .from("domain_cart_orders")
    .select("order_number, status, invoice_amount, payment_method, created_at, domain_cart_items(domain_name, item_type, status, expires_at, last_error)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((o) => ({
    orderNumber: o.order_number as string,
    status: o.status as string,
    invoiceAmountBDT: Number(o.invoice_amount),
    method: o.payment_method as string,
    createdAt: o.created_at as string,
    items: (Array.isArray(o.domain_cart_items) ? o.domain_cart_items : []).map((i) => ({
      domain: i.domain_name as string,
      type: i.item_type as string,
      status: i.status as string,
      expiresAt: (i.expires_at as string) ?? null,
      lastError: (i.last_error as string) ?? null,
    })),
  }));
}

/** Fulfill every item in a paid order independently — one failed domain doesn't block the rest. */
export async function fulfillCartOrder(cartOrderId: string): Promise<void> {
  const db = getAdminSupabase();
  const { data: order } = await db.from("domain_cart_orders").select("status").eq("id", cartOrderId).maybeSingle();
  if (!order || order.status !== "paid") return;

  const { data: items } = await db.from("domain_cart_items").select("*").eq("cart_order_id", cartOrderId).eq("status", "pending");
  for (const item of items ?? []) {
    await fulfillItem(item);
  }
}

export async function renewItem(itemId: string): Promise<{ ok: true } | { error: string }> {
  const db = getAdminSupabase();
  const { data: item } = await db.from("domain_cart_items").select("domain_name, expires_at, renewal_count").eq("id", itemId).maybeSingle();
  if (!item) return { error: "Domain not found." };

  const res = await renewDomain(item.domain_name as string);
  if ("error" in res) return res;

  const next = item.expires_at ? new Date(item.expires_at as string) : new Date();
  next.setFullYear(next.getFullYear() + 1);
  await db
    .from("domain_cart_items")
    .update({
      status: "active",
      expires_at: next.toISOString().slice(0, 10),
      last_error: null,
      renewal_count: ((item.renewal_count as number) ?? 0) + 1,
    })
    .eq("id", itemId);
  return { ok: true };
}
