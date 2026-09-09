/**
 * Web search for the admin assistant.
 *
 * Provider chain (first that is configured + responds wins):
 *   1. Tavily            — TAVILY_API_KEY      (free tier, no card, LLM-tuned)
 *   2. Serper.dev        — SERPER_API_KEY      (free tier, no card, Google SERP)
 *   3. Brave Search API  — BRAVE_SEARCH_API_KEY
 *   4. DuckDuckGo HTML   — no key, scraped (best-effort; datacenter IPs get
 *                          throttled, so this is a fallback, not the plan)
 * Raw results are synthesised into a short cited answer with Gemini (plain
 * generateContent — NOT the google_search grounding tool, which needs a billed
 * key). Server-only.
 */
import "server-only";
import { geminiGenerate } from "./gemini";

export interface WebHit {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchOutcome {
  answer: string;
  sources: { title: string; url: string }[];
  provider: "tavily" | "serper" | "brave" | "duckduckgo";
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/** Pull the real destination out of a DuckDuckGo redirect href. */
function unwrapDdg(href: string): string {
  try {
    const m = href.match(/[?&]uddg=([^&]+)/);
    if (m) return decodeURIComponent(m[1]);
  } catch {
    /* ignore */
  }
  return href.startsWith("//") ? `https:${href}` : href;
}

/** Tavily returns its own synthesised answer + sources — we keep both. */
async function tavilySearch(query: string): Promise<{ hits: WebHit[]; answer?: string } | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "basic",
        include_answer: true,
        max_results: 6,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      answer?: string;
      results?: { title?: string; url?: string; content?: string }[];
    };
    const hits = (data.results ?? [])
      .filter((r) => r.url)
      .slice(0, 6)
      .map((r) => ({
        title: stripTags(r.title ?? r.url ?? ""),
        url: r.url as string,
        snippet: stripTags(r.content ?? ""),
      }));
    if (!hits.length && !data.answer) return null;
    return { hits, answer: data.answer?.trim() || undefined };
  } catch {
    return null;
  }
}

async function serperSearch(query: string): Promise<WebHit[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: 6 }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      organic?: { title?: string; link?: string; snippet?: string }[];
      answerBox?: { snippet?: string; title?: string; link?: string };
    };
    const hits: WebHit[] = [];
    if (data.answerBox?.snippet) {
      hits.push({
        title: stripTags(data.answerBox.title ?? "Answer"),
        url: data.answerBox.link ?? "",
        snippet: stripTags(data.answerBox.snippet),
      });
    }
    for (const r of data.organic ?? []) {
      if (r.link) hits.push({ title: stripTags(r.title ?? r.link), url: r.link, snippet: stripTags(r.snippet ?? "") });
    }
    return hits.slice(0, 6);
  } catch {
    return [];
  }
}

async function braveSearch(query: string): Promise<WebHit[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=6`,
      {
        headers: { Accept: "application/json", "X-Subscription-Token": key },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      web?: { results?: { title?: string; url?: string; description?: string }[] };
    };
    return (data.web?.results ?? [])
      .filter((r) => r.url)
      .slice(0, 6)
      .map((r) => ({
        title: stripTags(r.title ?? r.url ?? ""),
        url: r.url as string,
        snippet: stripTags(r.description ?? ""),
      }));
  } catch {
    return [];
  }
}

function parseDdgHtml(html: string): WebHit[] {
  const hits: WebHit[] = [];
  // each result: <a ... class="result__a" href="...">TITLE</a> ... <a class="result__snippet" ...>SNIPPET</a>
  const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snipRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  const snippets: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = snipRe.exec(html))) snippets.push(stripTags(sm[1]));
  let lm: RegExpExecArray | null;
  let i = 0;
  while ((lm = linkRe.exec(html)) && hits.length < 6) {
    const url = unwrapDdg(lm[1]);
    const title = stripTags(lm[2]);
    if (!url || !title || url.includes("duckduckgo.com")) continue;
    hits.push({ title, url, snippet: snippets[i] ?? "" });
    i++;
  }
  return hits;
}

async function duckSearch(query: string): Promise<WebHit[]> {
  const endpoints = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const hits = parseDdgHtml(html);
      if (hits.length) return hits;
      // lite endpoint uses a plain table layout
      const liteRe = /<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      const liteHits: WebHit[] = [];
      let m: RegExpExecArray | null;
      while ((m = liteRe.exec(html)) && liteHits.length < 6) {
        const u = unwrapDdg(m[1]);
        if (u && !u.includes("duckduckgo.com")) liteHits.push({ title: stripTags(m[2]), url: u, snippet: "" });
      }
      if (liteHits.length) return liteHits;
    } catch {
      /* try next endpoint */
    }
  }
  return [];
}

export function webSearchConfigured(): boolean {
  // DuckDuckGo needs no key; a provider key just makes it reliable.
  return true;
}

/** Which real provider (if any) is configured — for diagnostics / health checks. */
export function webSearchProvider(): "tavily" | "serper" | "brave" | "duckduckgo" {
  if (process.env.TAVILY_API_KEY) return "tavily";
  if (process.env.SERPER_API_KEY) return "serper";
  if (process.env.BRAVE_SEARCH_API_KEY) return "brave";
  return "duckduckgo";
}

export async function runWebSearch(rawQuery: string): Promise<WebSearchOutcome | null> {
  const query = rawQuery.trim().slice(0, 400);
  if (!query) return null;

  let hits: WebHit[] = [];
  let provider: WebSearchOutcome["provider"] = "duckduckgo";
  let presetAnswer: string | undefined;

  const tav = await tavilySearch(query);
  if (tav && (tav.hits.length || tav.answer)) {
    hits = tav.hits;
    presetAnswer = tav.answer;
    provider = "tavily";
  }
  if (!hits.length && !presetAnswer) {
    hits = await serperSearch(query);
    if (hits.length) provider = "serper";
  }
  if (!hits.length && !presetAnswer) {
    hits = await braveSearch(query);
    if (hits.length) provider = "brave";
  }
  if (!hits.length && !presetAnswer) {
    hits = await duckSearch(query);
    provider = "duckduckgo";
  }
  if (!hits.length && !presetAnswer) return null;

  const sources = hits.map((h) => ({ title: h.title, url: h.url }));

  // Tavily already synthesised — use its answer, just append clean citations.
  if (presetAnswer) {
    return { answer: presetAnswer, sources, provider };
  }

  const context = hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.url}\n${h.snippet}`).join("\n\n");
  const synth = await geminiGenerate(
    `Search query: "${query}"\n\nSearch results:\n${context}\n\n` +
      `Write a concise, direct answer to the query using only these results. ` +
      `Cite sources inline as [1], [2] matching the numbers above. ` +
      `If the results don't actually answer it, say so briefly.`,
    { temperature: 0.2, maxOutputTokens: 700 },
  );

  const answer =
    synth?.text?.trim() ||
    hits.map((h, i) => `[${i + 1}] ${h.title} — ${h.snippet || h.url}`).join("\n");

  return { answer, sources, provider };
}
