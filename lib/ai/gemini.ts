/**
 * Gemini adapter. Server-only. The API key is read from the environment and is
 * never sent to the client or logged. Callers pass a prompt + optional JSON
 * schema; the adapter walks a fallback chain of models.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

// Fallback chain — first that responds wins. `gemini-2.5-*` is retired for new
// keys (2026), so the chain leads with 3.x flash tiers.
const MODEL_CHAIN = ["gemini-3.6-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite"];

export interface GeminiResult {
  text: string;
  model: string;
}

interface GenOptions {
  system?: string;
  /** response MIME — set "application/json" for structured output */
  json?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
}

export function geminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export async function geminiGenerate(
  prompt: string,
  opts: GenOptions = {},
): Promise<GeminiResult | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxOutputTokens ?? 2048,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
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
        // 404 (model gone) / 503 (overloaded) → try next model
        if (res.status === 404 || res.status === 503 || res.status === 429) continue;
        const err = await res.text();
        console.error(`gemini ${model} ${res.status}`, err.slice(0, 200));
        continue;
      }

      const data = await res.json();
      const text: string =
        data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ??
        "";
      if (text.trim()) return { text: text.trim(), model };
    } catch (e) {
      console.error(`gemini ${model} failed`, (e as Error).message);
    }
  }
  return null;
}

/** Parse a JSON response, tolerating markdown fences. Returns null on failure. */
export function parseJsonResponse<T>(raw: string): T | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}
