/**
 * Web search for the admin assistant.
 *
 * Keys live in `search_api_keys` (managed at /admin/assistants). The runtime
 * tries every enabled key in order (rotatable fallback), recording usage +
 * the last outcome per key. If no DB key works it falls back to matching
 * env vars, then to a keyless DuckDuckGo scrape (best-effort — datacenter IPs
 * get throttled, so this is a safety net, not the plan).
 *
 * Raw results are synthesised into a short cited answer with plain Gemini
 * generateContent (the google_search grounding tool needs a billed key).
 * Server-only.
 */
import "server-only";
import { geminiGenerate } from "./gemini";
import {
  getActiveSearchKeys,
  recordSearchKeyUse,
  type SearchProvider,
} from "./search-keys";

export interface WebHit {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchOutcome {
  answer: string;
  sources: { title: string; url: string }[];
  provider: SearchProvider | "duckduckgo";
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

function unwrapDdg(href: string): string {
  try {
    const m = href.match(/[?&]uddg=([^&]+)/);
    if (m) return decodeURIComponent(m[1]);
  } catch {
    /* ignore */
  }
  return href.startsWith("//") ? `https:${href}` : href;
}

/* ── providers ─────────────────────────────────────────────────────────────── */

interface ProviderResult {
  hits: WebHit[];
  /** some providers (Tavily) synthesise their own answer */
  answer?: string;
  /** provider-reported remaining quota, when the response exposes it */
  providerLeft?: number | null;
}

async function tavily(query: string, key: string): Promise<ProviderResult> {
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
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
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
  return { hits, answer: data.answer?.trim() || undefined };
}

async function serper(query: string, key: string): Promise<ProviderResult> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 6 }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
  const data = (await res.json()) as {
    organic?: { title?: string; link?: string; snippet?: string }[];
    answerBox?: { snippet?: string; title?: string; link?: string };
    credits?: number;
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
  return { hits: hits.slice(0, 6) };
}

async function brave(query: string, key: string): Promise<ProviderResult> {
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=6`,
    {
      headers: { Accept: "application/json", "X-Subscription-Token": key },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
  const data = (await res.json()) as {
    web?: { results?: { title?: string; url?: string; description?: string }[] };
  };
  const hits = (data.web?.results ?? [])
    .filter((r) => r.url)
    .slice(0, 6)
    .map((r) => ({
      title: stripTags(r.title ?? r.url ?? ""),
      url: r.url as string,
      snippet: stripTags(r.description ?? ""),
    }));
  // Brave sends "1s, 1mo" pairs; the second number is the monthly remaining
  const remHeader = res.headers.get("x-ratelimit-remaining") ?? "";
  const monthlyLeft = Number(remHeader.split(",").pop()?.trim());
  return { hits, providerLeft: Number.isFinite(monthlyLeft) ? monthlyLeft : null };
}

const PROVIDERS: Record<SearchProvider, (q: string, k: string) => Promise<ProviderResult>> = {
  tavily,
  serper,
  brave,
};

/** One live call against a single key — used by the admin "test" button. */
export async function probeSearchProvider(
  provider: SearchProvider,
  key: string,
): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    const r = await PROVIDERS[provider]("current time in Dhaka Bangladesh", key);
    return { ok: r.hits.length > 0 || !!r.answer, count: r.hits.length };
  } catch (e) {
    return { ok: false, count: 0, error: (e as Error).message };
  }
}

/* ── DuckDuckGo keyless fallback ───────────────────────────────────────────── */

function parseDdgHtml(html: string): WebHit[] {
  const hits: WebHit[] = [];
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

/* ── entry point ──────────────────────────────────────────────────────────── */

export function webSearchConfigured(): boolean {
  return true; // DDG needs no key; a provider key just makes it reliable
}

const ENV_KEY: Record<SearchProvider, string | undefined> = {
  tavily: process.env.TAVILY_API_KEY,
  serper: process.env.SERPER_API_KEY,
  brave: process.env.BRAVE_SEARCH_API_KEY,
};

export async function runWebSearch(rawQuery: string): Promise<WebSearchOutcome | null> {
  const query = rawQuery.trim().slice(0, 400);
  if (!query) return null;

  let hits: WebHit[] = [];
  let presetAnswer: string | undefined;
  let provider: WebSearchOutcome["provider"] = "duckduckgo";

  // 1) DB keys, in order (rotatable fallback)
  for (const k of await getActiveSearchKeys()) {
    try {
      const r = await PROVIDERS[k.provider](query, k.key);
      if (r.hits.length || r.answer) {
        await recordSearchKeyUse(k.id, true, { providerLeft: r.providerLeft });
        hits = r.hits;
        presetAnswer = r.answer;
        provider = k.provider;
        break;
      }
      await recordSearchKeyUse(k.id, false, { error: "no results" });
    } catch (e) {
      await recordSearchKeyUse(k.id, false, { error: (e as Error).message });
    }
  }

  // 2) env-var keys (legacy / not-yet-migrated)
  if (!hits.length && !presetAnswer) {
    for (const p of ["tavily", "serper", "brave"] as SearchProvider[]) {
      const key = ENV_KEY[p];
      if (!key) continue;
      try {
        const r = await PROVIDERS[p](query, key);
        if (r.hits.length || r.answer) {
          hits = r.hits;
          presetAnswer = r.answer;
          provider = p;
          break;
        }
      } catch {
        /* next */
      }
    }
  }

  // 3) keyless DuckDuckGo
  if (!hits.length && !presetAnswer) {
    hits = await duckSearch(query);
    provider = "duckduckgo";
  }

  if (!hits.length && !presetAnswer) return null;

  const sources = hits.map((h) => ({ title: h.title, url: h.url }));

  if (presetAnswer) return { answer: presetAnswer, sources, provider };

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
