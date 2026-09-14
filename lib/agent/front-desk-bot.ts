/**
 * Front Desk — a small, read-only Gemini function-calling agent for zotomic.com
 * itself. Serves prospective and existing Zotomic customers about Zotomic's OWN
 * products: domain names, hosting, web development, and automation services,
 * plus how to create a store. Never touches a tenant's own product catalogue —
 * that stays lib/agent/storefront-bot.ts's job.
 *
 * Anonymous visitors get suggestions/info only; a logged-in Zotomic user
 * (resolved server-side by the route, never trusted from the client) also
 * unlocks lookups of their own domain orders and service requests.
 */
import "server-only";
import { checkAvailability } from "@/lib/domains/dynadot";
import { getPricingContext, retailPriceBDT, splitDomain, SUGGESTED_TLDS, getUserDomainOrders } from "@/lib/domains/orders";
import { getUserServiceInquiries } from "@/lib/service-inquiries";
import { getServiceCards } from "@/lib/service-cards";
import { geminiGenerate } from "@/lib/ai/gemini";
import { canAttempt, recordSuccess, recordFailure, chainOpen, sleep, backoffDelay } from "@/lib/ai/circuit";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_CHAIN = ["gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3.6-flash"];

export interface FdBotContext {
  userId: string | null;
}

export interface FdBotMessage {
  role: "user" | "assistant";
  content: string;
}

export interface FdBotTrace {
  tool: string;
  args: Record<string, unknown>;
  ms: number;
}

export interface FdBotOutcome {
  reply: string;
  model: string;
  traces: FdBotTrace[];
}

/* ─────────────────────────────  tools  ───────────────────────────── */

interface FdTool {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  requiresLogin?: boolean;
  run: (ctx: FdBotContext, args: Record<string, unknown>) => Promise<unknown>;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const TOOLS: FdTool[] = [
  {
    name: "suggest_domain_names",
    description:
      "Suggest domain names for a business. Ask the visitor for their business name, category, and niche first if they haven't given all three. Returns a batch of real, live-checked domains with availability and BDT pricing — never invent names or availability yourself, always call this tool.",
    parameters: {
      type: "object",
      properties: {
        businessName: { type: "string" },
        category: { type: "string" },
        niche: { type: "string" },
      },
      required: ["businessName", "category", "niche"],
    },
    run: async (_ctx, args) => {
      const businessName = str(args.businessName);
      const category = str(args.category);
      const niche = str(args.niche);
      if (!businessName || !category || !niche) return { error: "Need businessName, category, and niche." };

      const ideaPrompt = `Business name: "${businessName}"\nCategory: "${category}"\nNiche: "${niche}"\n\nSuggest 8 short, brandable domain base names (no TLD, no spaces, lowercase, letters/numbers/hyphens only) for this business. Mix: some close to the business name, some creative/brandable alternatives tied to the category/niche.\n\nRespond with ONLY the 8 names, one per line — no numbering, no bullets, no punctuation, no other text.`;
      const idea = await geminiGenerate(ideaPrompt, { temperature: 0.8, maxOutputTokens: 300 }, process.env.GEMINI_API_KEY_FRONTDESK);
      // The model doesn't reliably honor strict JSON mode for this kind of creative list, so
      // parse plain lines instead — strips any numbering/bullets it adds anyway.
      const cleanBases = (idea?.text ?? "")
        .split(/\r?\n/)
        .map((line) => line.replace(/^[\s\-*\d.)]+/, "").trim().toLowerCase().replace(/[^a-z0-9-]/g, ""))
        .filter(Boolean)
        .slice(0, 8);
      if (!cleanBases.length) return { error: "Could not come up with name ideas right now — try again." };

      const candidates: string[] = [];
      for (const base of cleanBases) {
        for (const tld of SUGGESTED_TLDS.slice(0, 2)) {
          if (candidates.length >= 20) break;
          candidates.push(`${base}.${tld}`);
        }
      }

      const [ctx, results] = await Promise.all([getPricingContext(), checkAvailability(candidates)]);
      if ("error" in results) return { error: results.error };

      const byDomain = new Map(results.map((r) => [r.domain.toLowerCase(), r]));
      const priced = candidates.map((d) => {
        const r = byDomain.get(d.toLowerCase());
        const tld = splitDomain(d).tld;
        const wholesaleUsd = r?.wholesaleCost ?? null;
        return {
          domain: d,
          available: r?.available ?? false,
          priceBDT: wholesaleUsd != null ? retailPriceBDT(wholesaleUsd, tld, "first_year", ctx) : null,
        };
      });
      return { candidates: priced };
    },
  },
  {
    name: "my_domain_orders",
    description: "The signed-in visitor's own domain orders — status, payment, and fulfillment for each. Requires the visitor to be logged in.",
    requiresLogin: true,
    parameters: { type: "object", properties: {} },
    run: async (ctx) => {
      if (!ctx.userId) return { error: "Not signed in — ask them to log in to check their orders." };
      const orders = await getUserDomainOrders(ctx.userId);
      return orders.length ? { orders } : { note: "No domain orders yet." };
    },
  },
  {
    name: "my_service_requests",
    description: "The signed-in visitor's own Hosting / Custom Website / Automation requests and their status. Requires the visitor to be logged in.",
    requiresLogin: true,
    parameters: { type: "object", properties: {} },
    run: async (ctx) => {
      if (!ctx.userId) return { error: "Not signed in — ask them to log in to check their requests." };
      const requests = await getUserServiceInquiries(ctx.userId);
      return requests.length ? { requests } : { note: "No service requests yet." };
    },
  },
  {
    name: "platform_services",
    description: "What Zotomic sells today — domains, hosting, web development, automation, store creation — and which are live vs. coming soon. Always call this instead of guessing what's available.",
    parameters: { type: "object", properties: {} },
    run: async () => {
      const cards = await getServiceCards();
      return { services: cards.map((c) => ({ title: c.title, description: c.description, status: c.status, href: c.href })) };
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

const SYSTEM = `You are the Front Desk assistant for Zotomic (zotomic.com) — a platform that sells domain names, hosting, web development services, automation services, and lets people create their own online store.

SCOPE — you help visitors with Zotomic's OWN products and services only:
- Suggesting and checking domain names (always via suggest_domain_names — never invent a name or claim it's available without checking).
- Explaining what Hosting, Web Development, and Automation services offer, and their current status (always via platform_services).
- Guiding someone through creating a store: sign up at /signup, then a short 2-step onboarding (business name + type, optional data import) — after that they land on their dashboard.
- For a signed-in visitor: their own domain order status and service request status (my_domain_orders, my_service_requests).

You do NOT know about, and must never discuss, any individual tenant's own store or products (e.g. a specific shop's t-shirts) — that's a different assistant's job. If asked, say you can only help with Zotomic's own domain/hosting/service offerings.

RULES:
- Use tools for every factual claim about pricing, availability, or order status — never invent them.
- Be concise, friendly, plain language, no emojis.
- When suggesting domains: if the visitor didn't specify how to present results, show only the available ones with your own opinion on the best pick; if they ask to also see taken ones, show both, clearly marked.
- Reply in the visitor's language.`;

async function callGemini(contents: GeminiContent[], loggedIn: boolean): Promise<{ parts: GeminiPart[]; model: string } | null> {
  const key = process.env.GEMINI_API_KEY_FRONTDESK;
  if (!key) return null;
  if (chainOpen(MODEL_CHAIN)) return null;
  const tools = TOOLS.filter((t) => !t.requiresLogin || loggedIn);
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents,
    tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
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
        console.error("front-desk-bot gemini", res.status, (await res.text()).slice(0, 200));
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
      console.error("front-desk-bot gemini failed", (e as Error).message);
      await sleep(backoffDelay(transientFails++));
    }
  }
  return null;
}

export async function runFrontDeskBot(ctx: FdBotContext, history: FdBotMessage[], userMessage: string): Promise<FdBotOutcome> {
  const contents: GeminiContent[] = history.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const traces: FdBotTrace[] = [];
  let model = MODEL_CHAIN[0];
  const loggedIn = !!ctx.userId;

  for (let step = 0; step < 6; step++) {
    const resp = await callGemini(contents, loggedIn);
    if (!resp) {
      return { reply: "Sorry — I'm having trouble right now. Please try again in a moment.", model, traces };
    }
    model = resp.model;

    const fnCall = resp.parts.find((p): p is Extract<GeminiPart, { functionCall: unknown }> => "functionCall" in p);
    if (!fnCall) {
      const text = resp.parts.map((p) => ("text" in p ? p.text : "")).join("").trim();
      return { reply: text || "I'm not sure how to help with that. Could you rephrase?", model, traces };
    }

    const { name, args } = fnCall.functionCall;
    const tool = TOOL_MAP.get(name);
    contents.push({ role: "model", parts: [fnCall] });
    if (!tool) {
      contents.push({ role: "user", parts: [{ functionResponse: { name, response: { result: { error: "Unknown tool" } } } }] });
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
    contents.push({ role: "user", parts: [{ functionResponse: { name, response: { result: out } } }] });
  }

  return { reply: "I couldn't quite work that out. Could you rephrase?", model, traces };
}

export function frontDeskBotConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY_FRONTDESK;
}
