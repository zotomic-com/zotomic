/**
 * Front Desk — a Gemini function-calling agent for zotomic.com itself. Serves
 * prospective and existing Zotomic customers about Zotomic's OWN products:
 * domain names, hosting, web development, and automation services, plus how
 * to create a store. Never touches a tenant's own product catalogue — that
 * stays lib/agent/storefront-bot.ts's job.
 *
 * Also acts as a senior design/dev/architecture consultant for a visitor
 * describing a potential web project — not just a service directory — and
 * can confirm a qualified lead (confirm_project_lead) once the visitor has
 * agreed to send it. That writes into the same service_inquiries table the
 * /web-development page's lead form uses and notifies admins through the
 * existing lib/notify.ts pipeline, which reaches the admin Telegram bot(s)
 * configured in Admin → Assistants — no separate inter-agent messaging.
 *
 * Anonymous visitors get suggestions/info only; a logged-in Zotomic user
 * (resolved server-side by the route, never trusted from the client) also
 * unlocks lookups of their own domain orders and service requests.
 */
import "server-only";
import { checkAvailability } from "@/lib/domains/dynadot";
import { getPricingContext, retailPriceBDT, splitDomain, SUGGESTED_TLDS, getUserDomainOrders } from "@/lib/domains/orders";
import { getUserServiceInquiries, createServiceInquiry } from "@/lib/service-inquiries";
import { getServiceCards } from "@/lib/service-cards";
import { geminiGenerate } from "@/lib/ai/gemini";
import { canAttempt, recordSuccess, recordFailure, chainOpen, sleep, backoffDelay } from "@/lib/ai/circuit";
import { notifyAdmins } from "@/lib/notify";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_CHAIN = ["gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3.6-flash"];

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/**
 * Never suggest Zotomic's own brand name or a lookalike (zotomix, zotomik, …) —
 * confusing at best, brand-safety risk at worst. A prompt instruction alone isn't
 * reliable enough (models drift), so this is enforced as a hard filter regardless
 * of what the model produces.
 */
function tooCloseToOwnBrand(base: string): boolean {
  const b = base.toLowerCase();
  if (b.includes("zotomi")) return true;
  return levenshtein(b, "zotomic") <= 2;
}

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

      const ideaPrompt = `You're a brand naming consultant with decades of experience naming startups and consumer brands — the kind of person studios like Lexicon or Eat My Words employ.

Business: "${businessName}" — ${niche}, in the ${category} space.

Give 8 domain base names, drawing on a genuine mix of professional naming strategies: one or two invented/coined words with no prior meaning (like Kodak, Spotify, Google), one or two blended or compound words that fuse two real ideas into something new (like Pinterest, Snapchat, Instagram), one or two evocative words borrowed or adapted from an existing word for the feeling they carry rather than a literal description (like Amazon, Nike), and two or three direct or lightly reworked variants of the business's own name.

A good name is short, pronounceable on first read, easy to spell after hearing it once, and distinctive — never a plain industry word by itself, never a string of keywords jammed together, and never a name resembling this platform's own brand (Zotomic). 4-14 characters, one word, lowercase letters/numbers/hyphens only.

Reply with exactly 8 lines, one name per line — nothing else, no intro, no explanation, no numbering.`;

      const tryGenerate = () => geminiGenerate(ideaPrompt, { temperature: 0.75, maxOutputTokens: 220 }, process.env.GEMINI_API_KEY_FRONTDESK);
      const extractBases = (text: string) =>
        text
          .split(/\r?\n/)
          .map((line) => line.replace(/^[\s\-*\d.)]+/, "").trim().toLowerCase().replace(/[^a-z0-9-]/g, ""))
          .filter((b) => b.length >= 3 && b.length <= 16 && !tooCloseToOwnBrand(b))
          .slice(0, 8);

      let idea = await tryGenerate();
      let cleanBases = extractBases(idea?.text ?? "");
      if (!cleanBases.length) {
        // The model occasionally returns malformed output for this creative prompt — one retry
        // before giving up, since a fresh sample usually succeeds.
        idea = await tryGenerate();
        cleanBases = extractBases(idea?.text ?? "");
      }
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
  {
    name: "confirm_project_lead",
    description:
      "Submit a qualified web design/development project lead to the Zotomic team, who get notified immediately (including on Telegram) and follow up directly. Only call this AFTER you've summarized the project back to the visitor, they've explicitly said yes to sending it, AND you've collected their name, email, and phone/WhatsApp number in that same exchange — never call it mid-conversation, as a guess, or before you have all three contact details. Never tell the visitor the lead has been sent until this tool actually returns ok — if it returns an error, ask for exactly what's missing and call it again.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The visitor's name." },
        contactEmail: { type: "string" },
        contactPhone: { type: "string", description: "Phone or WhatsApp number — required, so the team can reach them directly. Ask for it explicitly if not already given." },
        projectType: { type: "string", description: "e.g. 'E-commerce store', 'Portfolio site', 'Booking web app', 'Redesign of an existing site'." },
        projectSummary: {
          type: "string",
          description: "A clean, well-written brief of what they want built, synthesized from the whole conversation — goals, key pages/features, anything specific they mentioned. Write this yourself; don't just repeat their last message.",
        },
        budgetSignal: {
          type: "string",
          description: "REQUIRED whenever a number, range, or 'flexible' came up anywhere in the conversation — extract it here even if you also mention it in projectSummary. Use 'Not discussed' only if truly never mentioned.",
        },
        timeline: {
          type: "string",
          description: "REQUIRED whenever a deadline or timeframe came up anywhere in the conversation — extract it here even if you also mention it in projectSummary. Use 'Not discussed' only if truly never mentioned.",
        },
      },
      required: ["name", "contactEmail", "contactPhone", "projectSummary"],
    },
    run: async (ctx, args) => {
      const name = str(args.name);
      const contactEmail = str(args.contactEmail);
      const contactPhone = str(args.contactPhone);
      const projectSummary = str(args.projectSummary);
      if (!name || !contactEmail || !contactPhone || !projectSummary) {
        const missing = [!name && "name", !contactEmail && "email", !contactPhone && "phone or WhatsApp number", !projectSummary && "project summary"].filter(Boolean).join(", ");
        return { error: `Missing ${missing} — ask the visitor for it before calling this again.` };
      }
      // A required field being non-empty doesn't mean it's real — the model can satisfy the
      // schema with a placeholder like "Not provided" rather than actually asking again. Check
      // the content, not just presence: a real phone number has several digits in it, a real
      // email has an @.
      if (!contactEmail.includes("@")) {
        return { error: "That's not a valid email address — ask the visitor for their real email, don't guess or use a placeholder." };
      }
      if ((contactPhone.match(/\d/g) ?? []).length < 6) {
        return { error: "That's not a real phone/WhatsApp number — ask the visitor to actually provide one, don't use a placeholder like 'not provided'." };
      }
      const projectType = str(args.projectType) || "Not specified";
      const budgetSignal = str(args.budgetSignal) || "Not discussed";
      const timeline = str(args.timeline) || "Not discussed";

      const fullMessage = `From: ${name} (via Front Desk assistant)

Project type: ${projectType}
Budget: ${budgetSignal}
Timeline: ${timeline}

${projectSummary}`;

      const result = await createServiceInquiry({
        service: "custom_website",
        message: fullMessage,
        contactEmail,
        contactPhone,
        userId: ctx.userId,
        businessId: null,
      });
      if ("error" in result) return result;

      await notifyAdmins("service_inquiry", {
        title: `New project lead (Front Desk) — ${name}`,
        body: `${projectType} · Budget: ${budgetSignal} · Timeline: ${timeline}\n\n${projectSummary}\n\nContact: ${contactEmail}${contactPhone ? " · " + contactPhone : ""}`,
        href: "/admin/service-inquiries",
      });

      return { ok: true, note: "Lead submitted and the team has been notified." };
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
- Consulting on a custom web design/development project — see WEB PROJECT CONSULTING below.

You do NOT know about, and must never discuss, any individual tenant's own store or products (e.g. a specific shop's t-shirts) — that's a different assistant's job. If asked, say you can only help with Zotomic's own domain/hosting/service offerings.

WEB PROJECT CONSULTING — when a visitor is thinking about a website, web app, or redesign, act like a senior designer, developer, and technical architect who's scoped dozens of these: ask what the site actually needs to do before jumping to features (who's it for, what should a visitor be able to do, is it content-led or transactional), suggest a sensible page/information structure and key features for that kind of project, flag real trade-offs when relevant (e.g. a simple storefront vs. a full custom web app is a different timeline and cost), and orient them on how the work actually happens: a short discovery conversation, a design pass they see before anything is built, development with check-ins, then launch — the same process real Zotomic projects follow. Give real, specific opinions, not vague reassurance — this is a genuine consultation, not a brochure.

Once you have a real sense of the project (even roughly — you don't need every detail), summarize it back to them in a couple of sentences and, in that SAME message, ask if they'd like you to pass it to the team AND ask for their name, email, and phone/WhatsApp number together (e.g. "Want me to send this to the team? If so, what's the best name, email, and phone/WhatsApp number to reach you?") — never submit a lead they haven't agreed to, and never submit on a vague "maybe" or a project you can't yet summarize. Write the projectSummary yourself from the whole conversation, not just their last message.

Call confirm_project_lead only once you have all of: their explicit yes, name, email, AND phone/WhatsApp number — real values they actually gave you, never a placeholder like "not provided" or "N/A" to fill a required field. If any of those is still missing when you're ready to submit, ask for the specific missing piece(s) again and wait for a real answer — do not call the tool with a guess, a blank, or an invented placeholder, and do not tell the visitor it's been sent until the tool call actually succeeds. If the tool returns an error, that means something required is missing or invalid; ask for it and try again, and never claim success in that turn.

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
