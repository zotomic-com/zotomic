/**
 * Grounded web search via Gemini's Google Search tool. Server-only. Used by the
 * assistant's `web_search` tool — a premium action (10 credits + a hard daily
 * cap per plan). Returns a short synthesised answer plus source links.
 */
import { canAttempt, recordSuccess, recordFailure, chainOpen } from "./circuit";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_CHAIN = ["gemini-3.6-flash", "gemini-flash-lite-latest"];

export interface GroundedResult {
  answer: string;
  sources: { title: string; url: string }[];
  model: string;
}

export function searchConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export async function groundedSearch(query: string): Promise<GroundedResult | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !query.trim()) return null;
  if (chainOpen(MODEL_CHAIN)) return null;

  const body = {
    contents: [{ role: "user", parts: [{ text: query.trim().slice(0, 500) }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
  };

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
        continue;
      }
      const data = await res.json();
      const cand = data?.candidates?.[0];
      const answer: string =
        cand?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("").trim() ?? "";
      if (!answer) {
        recordFailure(model);
        continue;
      }
      recordSuccess(model);

      const chunks = cand?.groundingMetadata?.groundingChunks ?? [];
      const seen = new Set<string>();
      const sources: { title: string; url: string }[] = [];
      for (const c of chunks) {
        const url = c?.web?.uri;
        if (url && !seen.has(url)) {
          seen.add(url);
          sources.push({ title: c.web.title || url, url });
        }
      }
      return { answer, sources: sources.slice(0, 6), model };
    } catch {
      recordFailure(model);
    }
  }
  return null;
}
