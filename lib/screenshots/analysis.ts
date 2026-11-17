/**
 * Screenshot analysis + link recovery (server-only).
 *
 * Uses the shared free Gemini key (GEMINI_API_KEY) with the standard model
 * chain + circuit breaker, like the rest of the platform's AI calls.
 *
 * Anti-hallucination rule: a recovered URL is only ever emitted as
 * "verified" after we actually fetched it and Gemini matched it to the
 * screenshot, or "probable" when search/context strongly supports it.
 * Anything else is a search *suggestion*, never a URL.
 */
import "server-only";
import { canAttempt, recordSuccess, recordFailure, chainOpen, sleep, backoffDelay } from "@/lib/ai/circuit";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_CHAIN = ["gemini-3.6-flash", "gemini-flash-lite-latest"];

const IMAGE_MAX_BYTES = 4 * 1024 * 1024; // client downscales well below this

export interface ScreenshotAnalysis {
  title?: string;        // what the screenshot shows
  key_info?: string;     // one line with the most important content
  category?: string;     // finance | code | shopping | social | work | travel | design | article | chat | other
  source_app?: string;   // gpay | github | youtube | whatsapp | …
  text?: string;         // OCR dump (trimmed)
  tags?: string[];
  sensitive?: boolean;   // passwords / OTPs / IDs / cards
  why?: string;          // "why did I take this" memory line
  links?: string[];      // URLs plainly visible in the image
  hints?: string[];      // link-shaped hints without a URL (repo names, products…)
  error?: string;
}

export type LinkVerdict = "verified" | "probable" | "suggestion";

export interface RecoveredLink {
  url: string;
  verdict: LinkVerdict;
  details: string;
}

/* ── low-level Gemini call (JSON mode) ───────────────────────────────────── */

async function geminiJson(parts: unknown[]): Promise<{ parsed: unknown; model: string } | { error: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { error: "AI analysis isn't configured." };
  if (chainOpen(MODEL_CHAIN)) return { error: "The AI is busy right now — try again shortly." };

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: "application/json" },
  };

  let transient = 0;
  for (const model of MODEL_CHAIN) {
    if (!canAttempt(model)) continue;
    try {
      const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        recordFailure(model);
        if ([404, 429, 503].includes(res.status)) {
          await sleep(backoffDelay(transient++));
          continue;
        }
        console.error("screenshot gemini", res.status, (await res.text()).slice(0, 200));
        continue;
      }
      const data = await res.json();
      const text: string =
        data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("").trim() ?? "";
      if (!text) {
        recordFailure(model);
        continue;
      }
      recordSuccess(model);
      try {
        return { parsed: JSON.parse(text), model };
      } catch {
        return { parsed: { raw: text }, model };
      }
    } catch (e) {
      recordFailure(model);
      console.error("screenshot gemini failed", (e as Error).message);
      await sleep(backoffDelay(transient++));
    }
  }
  return { error: "Couldn't analyse the screenshot right now. Try again shortly." };
}

/* ── per-screenshot analysis ─────────────────────────────────────────────── */

const ANALYZE_PROMPT = `You are Hermes, the screenshot understanding engine of Zotomic's Screenshot Organizer.
Analyse the screenshot and return ONLY a JSON object with these fields:

{
  "title": "short name of what is on screen (English, ≤60 chars)",
  "key_info": "the single most useful line a future reader needs (prices, names, ids, dates — ≤160 chars)",
  "category": "one of: finance, code, shopping, social, work, travel, design, article, chat, other",
  "source_app": "app/site visible in the screenshot, lowercase (gpay, github, youtube, …) or empty",
  "text": "the most useful visible text transcribed (≤600 chars; skip UI chrome)",
  "tags": ["up to 5 short lowercase tags"],
  "sensitive": true if the screenshot shows passwords, OTP codes, card numbers, government IDs, or private keys — else false,
  "why": "one plain-English line guessing why the person took this screenshot, for their future self (≤120 chars)",
  "links": ["every http(s) URL plainly visible in the image, exactly as written"],
  "hints": ["link-shaped things WITHOUT a URL: GitHub owner/repo names, YouTube video titles + channel, app store listings, product/company names, usernames. Each ≤80 chars. Empty if none."]
}

Rules: never invent URLs — only transcribe ones actually visible. Be concrete, not generic.`;

export async function analyzeScreenshot(input: {
  imageBase64: string;
  mimeType: string;
  name: string;
  userHint?: string;
}): Promise<ScreenshotAnalysis> {
  const bytes = Math.ceil((input.imageBase64.length * 3) / 4);
  if (bytes > IMAGE_MAX_BYTES) return { error: "Screenshot too large — it should be downscaled client-side." };

  const hint = input.userHint
    ? `\nThe user added this context when capturing it (trust it over your own guess): "${input.userHint.slice(0, 300)}"`
    : "";
  const result = await geminiJson([
    { inlineData: { mimeType: input.mimeType, data: input.imageBase64 } },
    { text: `${ANALYZE_PROMPT}\n\nFile name: ${input.name}${hint}` },
  ]);
  if ("error" in result) return { error: result.error };
  const a = result.parsed as ScreenshotAnalysis;
  return {
    ...a,
    links: (a.links ?? []).filter((u) => /^https?:\/\//i.test(u)).slice(0, 8),
    hints: (a.hints ?? []).slice(0, 5),
    tags: (a.tags ?? []).slice(0, 5),
  };
}

/* ── link recovery for linkless screenshots ──────────────────────────────── */

/** Only fetch public http(s) URLs — block private/loopback targets (SSRF). */
function isFetchableUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return false;
    if (/^(10|127)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h === "[::1]") return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchPageTitle(url: string): Promise<{ title: string; snippet: string } | null> {
  if (!isFetchableUrl(url)) return null;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ZotomicScreenshotOrganizer/1.0)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 20_000);
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim().replace(/\s+/g, " ") ?? "";
    const body = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return { title, snippet: body.slice(0, 500) };
  } catch {
    return null;
  }
}

const RECOVER_PROMPT = `You recover links from screenshots that don't show one.
Given the screenshot's extracted info (and the image itself), list plausible public URLs the person may have been looking at, plus what to search for if no URL can be trusted.

Return ONLY JSON: { "candidates": ["https://…", …], "searches": ["search phrase", …] }

Rules:
- Use well-known, predictable URL patterns (e.g. a GitHub UI showing "owner / repo" → https://github.com/owner/repo; a product site → its domain). NEVER invent paths, query strings or page IDs you can't infer deterministically.
- Only propose a candidate when the screenshot strongly identifies the target (explicit repo name, product name, channel + video title…).
- Max 4 candidates and 2 searches.`;

export async function recoverScreenshotLinks(input: {
  analysis: ScreenshotAnalysis;
  userLink?: string;
}): Promise<RecoveredLink[]> {
  const a = input.analysis ?? {};
  const out: RecoveredLink[] = [];

  // 1. plainly visible links need no recovery — re-list them as verified
  for (const url of a.links ?? []) out.push({ url, verdict: "verified", details: "visible in the screenshot" });

  const hasWork = (a.hints?.length ?? 0) > 0;
  if (!hasWork) return out;

  // 2. ask Gemini for candidates + search fallbacks
  const ctx = {
    title: a.title ?? "",
    key_info: a.key_info ?? "",
    source_app: a.source_app ?? "",
    text: (a.text ?? "").slice(0, 400),
    hints: a.hints ?? [],
    user_context: input.userLink ? `user-provided link: ${input.userLink}` : "",
  };
  const result = await geminiJson([
    { text: RECOVER_PROMPT },
    { text: `Screenshot info:\n${JSON.stringify(ctx)}` },
  ]);
  if ("error" in result) return out;

  const r = result.parsed as { candidates?: string[]; searches?: string[] };
  const candidates = (r.candidates ?? []).filter((u) => /^https?:\/\//i.test(u) && isFetchableUrl(u)).slice(0, 4);

  // 3. verify each candidate: fetch it, then let Gemini judge the match
  const screenshots = new Set((a.text ?? "").toLowerCase().split(/\s+/));
  for (const url of candidates) {
    const page = await fetchPageTitle(url);
    if (!page) continue;
    let verdict: LinkVerdict = "probable";
    let details = "recovered from the screenshot";
    const hay = `${page.title} ${page.snippet}`.toLowerCase();
    const overlap = (a.hints ?? []).filter((h) => {
      const words = h.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
      return words.some((w) => hay.includes(w) || screenshots.has(w));
    });
    if (overlap.length || page.title) {
      const judged = await geminiJson([
        { text: `Does this page plausibly match what the screenshot shows? Answer JSON: {"match": true/false, "why": "≤80 chars"}\nScreenshot: ${JSON.stringify(ctx)}\nPage title: ${page.title}\nPage start: ${page.snippet.slice(0, 300)}` },
      ]);
      if (!("error" in judged)) {
        const j = judged.parsed as { match?: boolean; why?: string };
        if (j.match === true) {
          verdict = "verified";
          details = j.why ? `fetched & matched: ${j.why}` : "fetched & matched";
        } else if (j.match === false) {
          continue; // rejected — never surface a wrong link
        }
      }
      if (verdict !== "verified" && overlap.length) details = `matches "${overlap[0]}" from the screenshot`;
    }
    if (out.some((l) => l.url === url)) continue;
    out.push({ url, verdict, details });
  }

  // 4. anything unresolved becomes a search suggestion — never a fake URL
  for (const q of (r.searches ?? []).slice(0, 2)) {
    if (out.some((l) => l.details === q)) continue;
    out.push({ url: `https://www.google.com/search?q=${encodeURIComponent(q)}`, verdict: "suggestion", details: q });
  }
  return out;
}
