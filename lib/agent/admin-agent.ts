/**
 * Admin Assistant agent ("Zotomic" for the platform admin).
 *
 * Deliberately has NO database handle — the agent context is just `{ adminId }`.
 * Every read and every write goes through `ADMIN_TOOLS` (lib/tools/admin-registry).
 * Consequential tools stop the loop and return a `pendingAction` for the admin
 * to confirm (a button in the web app, or "yes" over Telegram).
 */
import "server-only";
import { ADMIN_TOOLS, ADMIN_TOOL_MAP, type AdminToolDef } from "@/lib/tools/admin-registry";
import { canAttempt, recordSuccess, recordFailure, chainOpen, sleep, backoffDelay } from "@/lib/ai/circuit";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_CHAIN = ["gemini-3.6-flash", "gemini-flash-lite-latest"];

const SYSTEM = `You are Zotomic, the assistant for the Zotomic platform administrator.
Zotomic is a business-intelligence SaaS for small online stores in Bangladesh.

- You have NO direct database access. You can only see and change things through your tools. Use a tool for EVERY fact and EVERY action — never guess a number, store name, plan, or status.
- If a tool returns an error or no data, say so plainly. Do not make something up.
- For any change (suspending a store, granting credits, resolving a payment, editing a store's assistant, changing a plan), call the relevant tool. The platform will ask the admin to confirm before it runs — you do not need to ask separately, just call the tool.
- Be concise and direct. Plain text, short paragraphs or tight lists. No emojis, no hype.
- Quote figures exactly as the tools return them (currency is BDT / ৳).
- When the admin asks "what needs attention" or similar, use flagged_activity and pending_payments.
- You can inspect any store's operational data (read-only): store_products, store_product_detail, store_categories, store_inventory, store_orders, store_order_detail, store_returns, store_customers, store_customer_detail, store_reviews — all take the store name or id.
- You can also manage users: list_users, user_detail, set_user_state (suspend), set_user_blocked (harder — optionally block their IP), block_ip. Suspend is reversible and softer; block is for abuse/fraud.`;

export interface AdminMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AdminToolTrace {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  ms: number;
}

export interface AdminPendingAction {
  tool: string;
  args: Record<string, unknown>;
  preview: string;
}

export interface AdminAgentOutcome {
  reply: string;
  model: string;
  toolTraces: AdminToolTrace[];
  pendingAction?: AdminPendingAction;
}

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

function toDeclaration(t: AdminToolDef) {
  return { name: t.name, description: t.description, parameters: t.parameters };
}

export function previewFor(tool: string, args: Record<string, unknown>): string {
  const parts = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
  return `${tool}(${parts.join(", ")})`;
}

async function callGemini(contents: GeminiContent[]): Promise<{ parts: GeminiPart[]; model: string } | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (chainOpen(MODEL_CHAIN)) return null;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents,
    tools: [{ functionDeclarations: ADMIN_TOOLS.map(toDeclaration) }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
  };
  let transientFails = 0;
  for (const model of MODEL_CHAIN) {
    if (!canAttempt(model)) continue;
    try {
      const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) {
        recordFailure(model);
        if ([404, 429, 503].includes(res.status)) {
          await sleep(backoffDelay(transientFails++));
          continue;
        }
        console.error("admin agent gemini", res.status, (await res.text()).slice(0, 200));
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
      console.error("admin agent gemini failed", (e as Error).message);
      await sleep(backoffDelay(transientFails++));
    }
  }
  return null;
}

export async function runAdminAgent(
  adminId: string,
  history: AdminMessage[],
  userMessage: string,
  opts: { approved?: { tool: string; args: Record<string, unknown> } } = {},
): Promise<AdminAgentOutcome> {
  const contents: GeminiContent[] = history.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const traces: AdminToolTrace[] = [];
  let model = MODEL_CHAIN[0];
  let lastResult: unknown = null;
  let didApproved = false;

  if (opts.approved) {
    const t = ADMIN_TOOL_MAP.get(opts.approved.tool);
    if (t) {
      const started = Date.now();
      let out: unknown;
      let ok = true;
      try {
        out = await t.handler(adminId, opts.approved.args);
      } catch (e) {
        ok = false;
        out = { error: (e as Error).message };
      }
      didApproved = ok && !(out && typeof out === "object" && "error" in out);
      lastResult = out;
      traces.push({ tool: t.name, args: opts.approved.args, ok, ms: Date.now() - started });
      contents.push({ role: "model", parts: [{ functionCall: { name: t.name, args: opts.approved.args } }] });
      contents.push({ role: "user", parts: [{ functionResponse: { name: t.name, response: { result: out } } }] });
    }
  }

  const fallback = () => {
    if (didApproved) return "Done.";
    if (lastResult && typeof lastResult === "object" && "error" in lastResult)
      return `That didn't work: ${(lastResult as { error: string }).error}`;
    return "The assistant is temporarily unavailable. Try again shortly.";
  };

  for (let step = 0; step < 10; step++) {
    const resp = await callGemini(contents);
    if (!resp) return { reply: fallback(), model, toolTraces: traces };
    model = resp.model;

    const fnCall = resp.parts.find((p): p is Extract<GeminiPart, { functionCall: unknown }> => "functionCall" in p);
    if (!fnCall) {
      const text = resp.parts.map((p) => ("text" in p ? p.text : "")).join("").trim();
      return { reply: text || (didApproved ? "Done." : "I don't have an answer for that."), model, toolTraces: traces };
    }

    const { name, args } = fnCall.functionCall;
    const tool = ADMIN_TOOL_MAP.get(name);
    if (!tool) {
      contents.push({ role: "model", parts: [fnCall] });
      contents.push({ role: "user", parts: [{ functionResponse: { name, response: { result: { error: "Unknown tool" } } } }] });
      continue;
    }

    if (tool.risk === "consequential") {
      return {
        reply: "",
        model,
        toolTraces: traces,
        pendingAction: { tool: name, args: args ?? {}, preview: previewFor(name, args ?? {}) },
      };
    }

    const started = Date.now();
    let out: unknown;
    let ok = true;
    try {
      out = await tool.handler(adminId, args ?? {});
    } catch (e) {
      ok = false;
      out = { error: (e as Error).message };
    }
    lastResult = out;
    traces.push({ tool: name, args: args ?? {}, ok, ms: Date.now() - started });
    contents.push({ role: "model", parts: [fnCall] });
    contents.push({ role: "user", parts: [{ functionResponse: { name, response: { result: out } } }] });
  }

  return { reply: fallback(), model, toolTraces: traces };
}

export function adminAgentConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}
