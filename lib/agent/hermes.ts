/**
 * Hermes client. Today: a local agentic loop powered by Gemini function-calling
 * (the "fake Hermes"). Later: point HERMES_BASE_URL at the real VPS and swap
 * `runAgent` for an HTTP call — the tool layer and gateway don't change.
 */
import { TOOL_MAP, TOOLS } from "@/lib/tools/registry";
import type { ToolContext, ToolDef } from "@/lib/tools/types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_CHAIN = ["gemini-3.6-flash", "gemini-flash-lite-latest"];

const SYSTEM = `You are Zotomic Assistant for a small online store owner.
- Use the tools to fetch real data. NEVER invent numbers, product names, orders, or customers.
- Financial and operational figures come only from tools; state them exactly as returned.
- Distinguish what is measured (from tools) from what you infer.
- Be concise and plain — no hype, no emojis. Short paragraphs or tight bullet lists.
- For any change to the store (updating a product, changing settings) call the
  relevant tool; the platform will ask the user to confirm before it applies.
- If a tool returns an error or no data, say so plainly. Do not guess.`;

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolTrace {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  ms: number;
}

export interface AgentOutcome {
  reply: string;
  model: string;
  toolTraces: ToolTrace[];
  creditsUsed: number;
  pendingAction?: { tool: string; args: Record<string, unknown>; preview: string };
}

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

function toDeclaration(t: ToolDef) {
  return { name: t.name, description: t.description, parameters: t.parameters };
}

function previewFor(tool: string, args: Record<string, unknown>): string {
  if (tool === "update_product") {
    const { productId, ...rest } = args;
    void productId;
    return `Update product — ${Object.entries(rest)
      .map(([k, v]) => `${k} → ${v}`)
      .join(", ")}`;
  }
  if (tool === "update_business_settings") {
    return `Update settings — ${Object.entries(args)
      .map(([k, v]) => `${k} → ${v}`)
      .join(", ")}`;
  }
  return `Run ${tool}`;
}

async function callGemini(contents: GeminiContent[]): Promise<{ parts: GeminiPart[]; model: string } | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents,
    tools: [{ functionDeclarations: TOOLS.map(toDeclaration) }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
  };
  for (const model of MODEL_CHAIN) {
    try {
      const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) {
        if ([404, 429, 503].includes(res.status)) continue;
        console.error("gemini agent", res.status, (await res.text()).slice(0, 200));
        continue;
      }
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts as GeminiPart[] | undefined;
      if (parts) return { parts, model };
    } catch (e) {
      console.error("gemini agent failed", (e as Error).message);
    }
  }
  return null;
}

/**
 * Run the agent loop. `approvedTool` (from a confirmation) is executed first,
 * then the model continues from there.
 */
export async function runAgent(
  ctx: ToolContext,
  history: AgentMessage[],
  userMessage: string,
  opts: { plan: string; approved?: { tool: string; args: Record<string, unknown> } } = { plan: "free" },
): Promise<AgentOutcome> {
  const contents: GeminiContent[] = history.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const traces: ToolTrace[] = [];
  let credits = 0;
  let model = MODEL_CHAIN[0];
  let lastToolResult: unknown = null;
  let didApprovedWrite = false;

  // If resuming from an approval, run that tool first and feed the result in.
  if (opts.approved) {
    const t = TOOL_MAP.get(opts.approved.tool);
    if (t) {
      const started = Date.now();
      let out: unknown;
      let ok = true;
      try {
        out = await t.handler(ctx, opts.approved.args);
      } catch (e) {
        ok = false;
        out = { error: (e as Error).message };
      }
      credits += t.creditCost;
      lastToolResult = out;
      didApprovedWrite = ok && !(out && typeof out === "object" && "error" in out);
      traces.push({ tool: t.name, args: opts.approved.args, ok, ms: Date.now() - started });
      contents.push({ role: "model", parts: [{ functionCall: { name: t.name, args: opts.approved.args } }] });
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name: t.name, response: { result: out } } }],
      });
    }
  }

  const fallbackReply = () => {
    if (didApprovedWrite) return "Done — the change has been applied.";
    if (lastToolResult && typeof lastToolResult === "object" && "error" in lastToolResult) {
      return `That didn't work: ${(lastToolResult as { error: string }).error}`;
    }
    return "The assistant is temporarily unavailable. Please try again shortly.";
  };

  for (let step = 0; step < 8; step++) {
    const resp = await callGemini(contents);
    if (!resp) return { reply: fallbackReply(), model, toolTraces: traces, creditsUsed: credits };
    model = resp.model;

    const fnCall = resp.parts.find((p): p is Extract<GeminiPart, { functionCall: unknown }> => "functionCall" in p);
    if (!fnCall) {
      const text = resp.parts
        .map((p) => ("text" in p ? p.text : ""))
        .join("")
        .trim();
      return { reply: text || "I don't have an answer for that.", model, toolTraces: traces, creditsUsed: credits };
    }

    const { name, args } = fnCall.functionCall;
    const tool = TOOL_MAP.get(name);
    if (!tool) {
      contents.push({ role: "model", parts: [fnCall] });
      contents.push({ role: "user", parts: [{ functionResponse: { name, response: { result: { error: "Unknown tool" } } } }] });
      continue;
    }

    // plan gating
    if (tool.requiredPlan && !(tool.requiredPlan === opts.plan || (tool.requiredPlan === "business" && opts.plan === "pro"))) {
      contents.push({ role: "model", parts: [fnCall] });
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name, response: { result: { error: `Requires the ${tool.requiredPlan} plan.` } } } }],
      });
      continue;
    }

    // consequential → stop and ask for confirmation
    if (tool.risk === "consequential") {
      return {
        reply: "",
        model,
        toolTraces: traces,
        creditsUsed: credits,
        pendingAction: { tool: name, args: args ?? {}, preview: previewFor(name, args ?? {}) },
      };
    }

    // read / write → execute
    const started = Date.now();
    let out: unknown;
    let ok = true;
    try {
      out = await tool.handler(ctx, args ?? {});
    } catch (e) {
      ok = false;
      out = { error: (e as Error).message };
    }
    credits += tool.creditCost;
    lastToolResult = out;
    traces.push({ tool: name, args: args ?? {}, ok, ms: Date.now() - started });
    contents.push({ role: "model", parts: [fnCall] });
    contents.push({ role: "user", parts: [{ functionResponse: { name, response: { result: out } } }] });
  }

  return { reply: fallbackReply(), model, toolTraces: traces, creditsUsed: credits };
}
