/**
 * Storefront shopping assistant — a small, read-only Gemini function-calling
 * agent scoped to ONE store. It answers product / policy questions from the
 * store's own catalogue and looks up existing orders. It never writes anything
 * and never talks about other stores.
 *
 * Separate from `lib/agent/hermes.ts` (the owner assistant): different system
 * prompt, a tiny read-only tool set, no confirmations, no credit ledger — it is
 * metered by the monthly conversation quota in `lib/storefront/assistant.ts`.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { money } from "@/lib/money";
import {
  getStoreProducts,
  getStoreProduct,
  getStoreProductVariants,
  getStoreCategories,
} from "@/lib/storefront/store";
import type { StorefrontConfig } from "@/lib/storefront/config";
import { getStorefrontSignals, type SignalToggles } from "@/lib/storefront/assistant-signals";
import { canAttempt, recordSuccess, recordFailure, chainOpen, sleep, backoffDelay } from "@/lib/ai/circuit";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
// High-volume + cheap: lead with the lite tiers.
const MODEL_CHAIN = ["gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3.6-flash"];

export interface SfBotAccount {
  id: string;
  customerId: string | null;
  phone: string | null;
  name: string;
}

export interface SfBotTraining {
  persona: string | null;
  knowledge: { question: string; answer: string }[];
  promotedNames: string[];
  signals: SignalToggles;
  productNotes: Record<string, string>;
}

export interface SfBotContext {
  businessId: string;
  storeName: string;
  assistantName: string;
  currency: string;
  basePath: string;
  config: StorefrontConfig;
  account: SfBotAccount | null;
  training: SfBotTraining;
  db: SupabaseClient;
}

export interface SfBotMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SfBotTrace {
  tool: string;
  args: Record<string, unknown>;
  ms: number;
}

/** A tappable product card the widget renders under the reply. */
export interface SfProductCard {
  name: string;
  handle: string;
  url: string;
  image: string | null;
  price: string;
  stock: string;
}

export interface SfBotOutcome {
  reply: string;
  model: string;
  traces: SfBotTrace[];
  /** products the assistant referenced this turn — rendered as image cards */
  products: SfProductCard[];
  /** optional "see all" link to a storefront listing page */
  list: { label: string; url: string } | null;
}

/* ─────────────────────────────  tools  ───────────────────────────── */

interface SfTool {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  run: (ctx: SfBotContext, args: Record<string, unknown>) => Promise<unknown>;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function stockLabel(qty: number, tracked: boolean): string {
  if (!tracked) return "in stock";
  if (qty <= 0) return "out of stock";
  if (qty <= 5) return `only ${qty} left`;
  return "in stock";
}

function priceText(price: number, salePrice: number | null, currency: string): string {
  if (salePrice != null && salePrice < price) {
    return `${money(salePrice, currency)} (was ${money(price, currency)})`;
  }
  return money(price, currency);
}

const TOOLS: SfTool[] = [
  {
    name: "search_catalog",
    description:
      "Search this store's products by keyword (name, description, category). Use for 'do you have…', 'show me…', price/'how much' and browsing questions. Returns up to 8 matches with price, stock and a link.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What the shopper is looking for" },
        in_stock_only: { type: "boolean", description: "Only return items currently in stock" },
      },
      required: ["query"],
    },
    run: async (ctx, args) => {
      const q = str(args.query).toLowerCase();
      const inStockOnly = args.in_stock_only === true;
      const all = await getStoreProducts(ctx.businessId);
      const terms = q.split(/\s+/).filter(Boolean);
      const scored = all
        .map((p) => {
          const hay = `${p.name} ${p.description ?? ""} ${p.category ?? ""}`.toLowerCase();
          let score = 0;
          for (const t of terms) if (hay.includes(t)) score += hay.startsWith(t) || p.name.toLowerCase().includes(t) ? 3 : 1;
          return { p, score };
        })
        .filter((x) => (terms.length ? x.score > 0 : true))
        .sort((a, b) => b.score - a.score || b.p.sold - a.p.sold)
        .map((x) => x.p)
        .filter((p) => !inStockOnly || !p.trackInventory || p.stockQty > 0)
        .slice(0, 8);

      if (!scored.length) return { results: [], note: "No matching products." };
      return {
        results: scored.map((p) => ({
          name: p.name,
          handle: p.slug,
          price: priceText(p.salePrice ?? p.price, p.salePrice, ctx.currency),
          stock: stockLabel(p.stockQty, p.trackInventory),
          category: p.category,
          rating: p.reviewCount ? Number(p.rating.toFixed(1)) : null,
          image: p.imageUrls[0] ?? null,
          owner_note: ctx.training.productNotes[p.id] || undefined,
          url: `${ctx.basePath}/products/${p.slug}`,
        })),
      };
    },
  },
  {
    name: "get_product",
    description:
      "Full detail for ONE product by its handle (from search_catalog): description, price, available sizes / colours and their stock, rating and link. Use for size/colour/spec/availability questions about a specific item.",
    parameters: {
      type: "object",
      properties: { handle: { type: "string" } },
      required: ["handle"],
    },
    run: async (ctx, args) => {
      const handle = str(args.handle);
      const p = await getStoreProduct(ctx.businessId, handle);
      if (!p) return { error: "No product with that handle." };
      const { options, variants } = p.hasVariants
        ? await getStoreProductVariants(ctx.businessId, p.id, p.salePrice ?? p.price)
        : { options: [], variants: [] };
      return {
        name: p.name,
        handle: p.slug,
        image: p.imageUrls[0] ?? null,
        url: `${ctx.basePath}/products/${p.slug}`,
        price: priceText(p.salePrice ?? p.price, p.salePrice, ctx.currency),
        owner_note: ctx.training.productNotes[p.id] || undefined,
        description: p.description || null,
        category: p.category,
        rating: p.reviewCount ? { average: Number(p.rating.toFixed(1)), count: p.reviewCount } : null,
        stock: stockLabel(p.stockQty, p.trackInventory),
        options: options.map((o) => ({ name: o.name, values: o.values })),
        variants: variants.map((v) => ({
          label: Object.values(v.options).join(" / ") || v.name,
          price: priceText(v.salePrice ?? v.price, v.salePrice, ctx.currency),
          stock: v.soldOut ? "out of stock" : stockLabel(v.stockQty, true),
        })),
      };
    },
  },
  {
    name: "list_categories",
    description: "List the product categories this store sells, with how many products are in each.",
    parameters: { type: "object", properties: {} },
    run: async (ctx) => {
      const cats = await getStoreCategories(ctx.businessId);
      return { categories: cats.map((c) => ({ name: c.name, products: c.count })) };
    },
  },
  {
    name: "store_highlights",
    description:
      "The store's current best-sellers, discounted items, running-campaign products and trending items — with links. Call this for 'what do you recommend', 'what's popular / best-selling', 'anything on sale / offers', gift ideas, or when the shopper is just browsing and could use a nudge. Returns only the groups the owner has enabled; may be empty.",
    parameters: { type: "object", properties: {} },
    run: async (ctx) => {
      const s = await getStorefrontSignals(ctx.businessId, ctx.currency, ctx.basePath, ctx.training.signals);
      if (!s.any) return { note: "No highlights to show right now." };
      return {
        bestsellers: s.bestsellers,
        on_sale: s.onSale,
        campaigns: s.campaigns.map((c) => ({ campaign: c.name, ends: c.endsOn, products: c.products })),
        trending: s.hot,
      };
    },
  },
  {
    name: "store_info",
    description:
      "This store's delivery, payment and returns information plus contact details and the 'about' text. Use for shipping cost / delivery time / return policy / 'where are you' / 'how do I pay' questions.",
    parameters: { type: "object", properties: {} },
    run: async (ctx) => {
      const c = ctx.config;
      return {
        about: c.pages.about.enabled ? c.pages.about.body || c.brand.tagline || null : null,
        contact: {
          phone: c.contact.phone || null,
          whatsapp: c.contact.whatsapp || null,
          email: c.contact.email || null,
          address: c.contact.address || null,
          hours: c.contact.hours || null,
        },
        payment: c.commerce.codEnabled ? "Cash on delivery available" : "Online payment only",
        shipping: {
          zones: [
            ...c.commerce.deliveryZones.map((z) => `${z.name}: ${z.charge === 0 ? "Free" : money(z.charge, ctx.currency)}`),
            `${c.commerce.deliveryDefaultLabel}: ${c.commerce.deliveryDefaultCharge === 0 ? "Free" : money(c.commerce.deliveryDefaultCharge, ctx.currency)}`,
          ],
          free_over: c.commerce.freeShippingOver ? money(c.commerce.freeShippingOver, ctx.currency) : null,
          min_order: c.commerce.minOrder ? money(c.commerce.minOrder, ctx.currency) : null,
          policy: c.pages.shipping.enabled ? c.pages.shipping.body || null : null,
        },
        returns: c.pages.refund.enabled ? c.pages.refund.body || null : null,
        faq: c.pages.faq.enabled ? c.pages.faq.items.slice(0, 8) : [],
      };
    },
  },
  {
    name: "lookup_order",
    description:
      "Look up an existing order to report its status. For a signed-in shopper, call with no arguments to list their recent orders, or pass order_number for one order. For a guest you MUST have BOTH order_number AND the phone number on the order — never reveal an order without a phone match.",
    parameters: {
      type: "object",
      properties: {
        order_number: { type: "string", description: "e.g. ZF-AB12CD" },
        phone: { type: "string", description: "Phone number on the order (required for guests)" },
      },
    },
    run: async (ctx, args) => {
      const db = ctx.db;
      const orderNo = str(args.order_number).toUpperCase();
      const phone = str(args.phone);
      const acct = ctx.account;

      const fmtOrder = (o: Record<string, unknown>, items: { name: string; qty: number }[]) => ({
        order_number: o.order_number,
        status: o.status,
        payment_status: o.payment_status,
        placed: o.placed_at ? new Date(o.placed_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null,
        total: money(Number(o.total), (o.currency as string) || ctx.currency),
        items: items.map((i) => `${i.name} × ${i.qty}`),
        delivery: o.shipment
          ? { courier: (o.shipment as Record<string, unknown>).provider, status: (o.shipment as Record<string, unknown>).status, tracking: (o.shipment as Record<string, unknown>).tracking_code ?? null }
          : null,
      });

      const loadItems = async (orderId: string) => {
        const { data } = await db.from("order_items").select("name, qty").eq("order_id", orderId);
        return (data ?? []) as { name: string; qty: number }[];
      };
      const loadShipment = async (orderId: string) => {
        const { data } = await db
          .from("shipments")
          .select("provider, status, tracking_code")
          .eq("order_id", orderId)
          .maybeSingle();
        return data ?? null;
      };

      // Signed-in shopper — scope to their own orders, no phone needed.
      if (acct) {
        let query = db
          .from("orders")
          .select("id, order_number, status, payment_status, placed_at, total, currency, store_account_id, customer_id")
          .eq("business_id", ctx.businessId)
          .order("placed_at", { ascending: false })
          .limit(orderNo ? 1 : 5);
        if (orderNo) query = query.eq("order_number", orderNo);
        else {
          const ors = [`store_account_id.eq.${acct.id}`];
          if (acct.customerId) ors.push(`customer_id.eq.${acct.customerId}`);
          query = query.or(ors.join(","));
        }
        const { data: orders } = await query;
        let list = (orders ?? []) as Record<string, unknown>[];
        if (orderNo) {
          list = list.filter(
            (o) => o.store_account_id === acct.id || (acct.customerId && o.customer_id === acct.customerId),
          );
          if (!list.length) return { error: "That order isn't on your account. Check the number, or contact the store." };
        }
        const out = [];
        for (const o of list) {
          o.shipment = await loadShipment(o.id as string);
          out.push(fmtOrder(o, await loadItems(o.id as string)));
        }
        return out.length ? { orders: out } : { note: "No orders on your account yet." };
      }

      // Guest — require order number + matching phone.
      if (!orderNo) return { error: "Ask the shopper for their order number." };
      if (!phone) return { error: "Ask the shopper for the phone number on the order to verify it." };

      const { data: order } = await db
        .from("orders")
        .select("id, order_number, status, payment_status, placed_at, total, currency, customer_id")
        .eq("business_id", ctx.businessId)
        .eq("order_number", orderNo)
        .maybeSingle();
      if (!order) return { error: "No order with that number." };

      const digits = (s: string) => s.replace(/\D/g, "").slice(-9);
      let phoneOk = false;
      if (order.customer_id) {
        const { data: cust } = await db
          .from("customers")
          .select("phone")
          .eq("id", order.customer_id)
          .maybeSingle();
        if (cust?.phone && digits(cust.phone as string) === digits(phone)) phoneOk = true;
      }
      if (!phoneOk) return { error: "That phone number doesn't match this order. I can't share its details." };

      const o = order as Record<string, unknown>;
      o.shipment = await loadShipment(order.id as string);
      return { orders: [fmtOrder(o, await loadItems(order.id as string))] };
    },
  },
];

const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

/* ─────────────────────────────  loop  ───────────────────────────── */

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

function systemPrompt(ctx: SfBotContext): string {
  const t = ctx.training;

  const knowledge = t.knowledge.length
    ? `\n\nSTORE KNOWLEDGE — the owner's own answers. Treat these as authoritative; prefer them over your own guesses:\n${t.knowledge
        .slice(0, 25)
        .map((k) => `Q: ${k.question}\nA: ${k.answer}`)
        .join("\n\n")
        .slice(0, 4500)}`
    : "";

  const persona = t.persona ? `\n\nOWNER INSTRUCTIONS (follow these):\n${t.persona.slice(0, 1500)}` : "";

  const promoted = t.promotedNames.length
    ? `\n\nThe owner especially wants you to suggest these products when relevant: ${t.promotedNames.join(", ")}. Use search_catalog to pull one up so its card shows.`
    : "";

  const anySignal = t.signals.bestseller || t.signals.sale || t.signals.campaign || t.signals.hot;
  const highlights = anySignal
    ? `\n\nThis store has live highlights (best-sellers / discounts / campaign items / trending). When the shopper asks for a recommendation, a gift, "what's popular", "any offers", or is browsing without a clear goal, call store_highlights and feature what it returns. Mention a discount or "best-seller" naturally — don't oversell.`
    : "";

  return `You are ${ctx.assistantName}, the shopping assistant for the online store "${ctx.storeName}".

SCOPE — you help shoppers of THIS store only:
- Finding products, prices, sizes, colours, stock and store policies (delivery, payment, returns).
- Checking the status of an existing order.
Politely decline anything else (general knowledge, other shops, advice unrelated to this store). Do not discuss competitors or prices at other stores.

RULES:
- Use the tools for every factual claim. NEVER invent products, prices, stock, policies or order details.
- Prices and figures come only from tools — state them exactly as returned (currency: ${ctx.currency}).
- PRODUCTS: after search_catalog, get_product or store_highlights, the app AUTOMATICALLY shows the shopper a tappable image card (photo, name, price, link) for each product. So just talk about the products in one or two natural sentences — do NOT paste product URLs, markdown links, bullet lists of products, or repeat every price. Example: "Yes, we have one perfume in stock — tap the card below to see it."
- If a product result has an "owner_note", weave that talking point in when you discuss that product.
- For order look-ups: a signed-in shopper is already verified. A guest must give the order number AND the phone number on the order before you reveal anything.
- You cannot place orders, change orders, apply discounts or take payment. Point the shopper to the product page or checkout to buy, and to the store's contact details for changes.
- Be concise and friendly. Plain language, short sentences, no emojis. Reply in the shopper's language.
${ctx.account ? `\nThe shopper is signed in as ${ctx.account.name || "a registered customer"}.` : ""}${persona}${promoted}${highlights}${knowledge}`;
}

async function callGemini(
  system: string,
  contents: GeminiContent[],
): Promise<{ parts: GeminiPart[]; model: string } | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (chainOpen(MODEL_CHAIN)) return null;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    tools: [
      {
        functionDeclarations: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ],
    generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
  };
  let transientFails = 0;
  for (const model of MODEL_CHAIN) {
    if (!canAttempt(model)) continue;
    try {
      const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        recordFailure(model);
        if ([404, 429, 503].includes(res.status)) {
          await sleep(backoffDelay(transientFails++));
          continue;
        }
        console.error("sf-bot gemini", res.status, (await res.text()).slice(0, 200));
        continue;
      }
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts as GeminiPart[] | undefined;
      if (parts) {
        recordSuccess(model);
        return { parts, model };
      }
      recordFailure(model);
    } catch (e) {
      recordFailure(model);
      console.error("sf-bot gemini failed", (e as Error).message);
      await sleep(backoffDelay(transientFails++));
    }
  }
  return null;
}

export async function runStorefrontBot(
  ctx: SfBotContext,
  history: SfBotMessage[],
  userMessage: string,
): Promise<SfBotOutcome> {
  const system = systemPrompt(ctx);
  const contents: GeminiContent[] = history.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const traces: SfBotTrace[] = [];
  let model = MODEL_CHAIN[0];
  const cardMap = new Map<string, SfProductCard>();
  let list: { label: string; url: string } | null = null;

  const addCards = (rows: unknown) => {
    if (!Array.isArray(rows)) return;
    for (const r of rows) {
      if (!r || typeof r !== "object") continue;
      const row = r as Record<string, unknown>;
      if (typeof row.handle !== "string" || cardMap.has(row.handle)) continue;
      cardMap.set(row.handle, {
        name: String(row.name ?? ""),
        handle: row.handle,
        url: String(row.url ?? `${ctx.basePath}/products/${row.handle}`),
        image: typeof row.image === "string" ? row.image : null,
        price: String(row.price ?? ""),
        stock: String(row.stock ?? ""),
      });
    }
  };

  for (let step = 0; step < 6; step++) {
    const resp = await callGemini(system, contents);
    if (!resp) {
      return {
        reply: "Sorry — I'm having trouble right now. Please try again in a moment, or contact the store directly.",
        model,
        traces,
        products: [...cardMap.values()].slice(0, 6),
        list,
      };
    }
    model = resp.model;

    const fnCall = resp.parts.find(
      (p): p is Extract<GeminiPart, { functionCall: unknown }> => "functionCall" in p,
    );
    if (!fnCall) {
      const text = resp.parts.map((p) => ("text" in p ? p.text : "")).join("").trim();
      return {
        reply: text || "I'm not sure how to help with that. Could you rephrase?",
        model,
        traces,
        products: [...cardMap.values()].slice(0, 6),
        list,
      };
    }

    const { name, args } = fnCall.functionCall;
    const tool = TOOL_MAP.get(name);
    contents.push({ role: "model", parts: [fnCall] });
    if (!tool) {
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name, response: { result: { error: "Unknown tool" } } } }],
      });
      continue;
    }

    const started = Date.now();
    let out: unknown;
    try {
      out = await tool.run(ctx, args ?? {});
    } catch (e) {
      out = { error: (e as Error).message };
    }
    traces.push({ tool: name, args: args ?? {}, ms: Date.now() - started });

    // Collect product cards from the tools that surface products.
    const o = out as Record<string, unknown> | null;
    if (name === "search_catalog" && o && Array.isArray(o.results) && o.results.length) {
      addCards(o.results);
      const q = str((args ?? {}).query);
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if ((args ?? {}).in_stock_only === true) params.set("stock", "1");
      list = {
        label: (o.results as unknown[]).length >= 6 ? "See all results" : "Browse all products",
        url: `${ctx.basePath}/products${params.toString() ? `?${params}` : ""}`,
      };
    } else if (name === "get_product" && o && typeof o.handle === "string" && !o.error) {
      addCards([o]);
    } else if (name === "store_highlights" && o) {
      addCards(o.bestsellers);
      addCards(o.on_sale);
      addCards(o.trending);
      if (Array.isArray(o.campaigns)) {
        for (const c of o.campaigns) {
          if (c && typeof c === "object") addCards((c as Record<string, unknown>).products);
        }
      }
    }

    contents.push({
      role: "user",
      parts: [{ functionResponse: { name, response: { result: out } } }],
    });
  }

  return {
    reply: "I couldn't quite work that out. Could you rephrase, or contact the store directly?",
    model,
    traces,
    products: [...cardMap.values()].slice(0, 6),
    list,
  };
}

export function storefrontBotConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}
