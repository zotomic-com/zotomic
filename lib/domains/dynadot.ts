import { createHmac, randomUUID } from "crypto";
import { getDomainSettings, type DomainSettings } from "@/lib/platform-settings";

/**
 * Wrapper over Dynadot's newer RESTful API v2 (key + secret, HMAC-signed) —
 * NOT the legacy single-key `api3.json` API. Sandbox and live use different
 * base URLs and different credential pairs; which one is active is an admin
 * toggle (`dynadot_use_sandbox`), so the whole reseller pipeline can be
 * exercised against the sandbox before ever touching the live account.
 *
 * Signature scheme per Dynadot's docs: HMAC-SHA256, base64-encoded, over
 * `${apiKey}\n${pathAndQuery}\n${requestId}\n${body}` using the API secret as
 * the HMAC key. Only `search`/`register` endpoints are independently
 * confirmed from Dynadot's own docs — `renew`/`nameserver`/`transfer_in`/
 * `transfer status` paths and response field names below are inferred from
 * the RESTful API's own resource-oriented convention and need live
 * verification against a real sandbox call before being trusted blindly.
 */

const LIVE_BASE = "https://api.dynadot.com";
const SANDBOX_BASE = "https://api-sandbox.dynadot.com";

interface Creds {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
}

function resolveCreds(s: DomainSettings): Creds | null {
  if (s.dynadotUseSandbox) {
    if (!s.dynadotSandboxApiKey || !s.dynadotSandboxApiSecret) return null;
    return { baseUrl: SANDBOX_BASE, apiKey: s.dynadotSandboxApiKey, apiSecret: s.dynadotSandboxApiSecret };
  }
  if (!s.dynadotApiKey || !s.dynadotApiSecret) return null;
  return { baseUrl: LIVE_BASE, apiKey: s.dynadotApiKey, apiSecret: s.dynadotApiSecret };
}

function sign(creds: Creds, pathAndQuery: string, requestId: string, body: string): string {
  const stringToSign = [creds.apiKey, pathAndQuery, requestId, body].join("\n");
  return createHmac("sha256", creds.apiSecret).update(stringToSign, "utf-8").digest("base64");
}

async function call(creds: Creds, method: "GET" | "POST" | "PUT", path: string, body?: Record<string, unknown>) {
  const bodyStr = body ? JSON.stringify(body) : "";
  const requestId = randomUUID();
  const signature = sign(creds, path, requestId, bodyStr);

  const res = await fetch(`${creds.baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${creds.apiKey}`,
      "X-Signature": signature,
      "X-Request-Id": requestId,
    },
    body: bodyStr || undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

export interface DomainQuote {
  domain: string;
  available: boolean;
  /** 1-year registration cost, wholesale USD. */
  wholesaleCost: number | null;
  /** 1-year renewal cost, wholesale USD — often, but not always, the same as registration. */
  wholesaleRenewalCost: number | null;
}

export async function dynadotConfigured(): Promise<boolean> {
  const s = await getDomainSettings();
  return resolveCreds(s) !== null;
}

/** Which mode ("sandbox" | "live") is currently active — surfaced in the admin UI. */
export async function dynadotMode(): Promise<"sandbox" | "live"> {
  const s = await getDomainSettings();
  return s.dynadotUseSandbox ? "sandbox" : "live";
}

function extractError(json: unknown, status: number, fallback: string): string {
  const j = json as { message?: string; error?: { description?: string } } | null;
  const msg = j?.error?.description ?? j?.message;
  return typeof msg === "string" && msg ? msg : `${fallback} (HTTP ${status})`;
}

interface DynadotPriceEntry {
  unit?: string;
  registration_price?: string;
  renewal_price?: string;
}

interface DynadotSearchData {
  domain_name?: string;
  available?: string;
  price_list?: DynadotPriceEntry[];
}

/**
 * Dynadot's RESTful v2 search response nests everything under `data`;
 * `available` is the string "Yes"/"No" (never boolean-coerce it — "No" is a
 * truthy non-empty string); pricing is a `price_list` array of per-year-term
 * entries, only present when the request asked for `show_price=true`.
 */
function extractQuote(domain: string, json: Record<string, unknown> | null): DomainQuote {
  const data = (json?.data ?? {}) as DynadotSearchData;
  const available = String(data.available ?? "").toLowerCase() === "yes";
  const oneYear = (data.price_list ?? []).find((p) => (p.unit ?? "").includes("1 year")) ?? data.price_list?.[0];
  const wholesaleCost = oneYear?.registration_price != null ? Number(oneYear.registration_price) : null;
  const wholesaleRenewalCost = oneYear?.renewal_price != null ? Number(oneYear.renewal_price) : null;
  return { domain, available, wholesaleCost, wholesaleRenewalCost };
}

/** One GET per domain (the RESTful v2 search endpoint is single-domain) — run in parallel. */
export async function checkAvailability(domains: string[]): Promise<DomainQuote[] | { error: string }> {
  const s = await getDomainSettings();
  const creds = resolveCreds(s);
  if (!creds) return { error: "Domain search isn't configured yet." };
  if (domains.length === 0) return [];

  try {
    const results = await Promise.all(
      domains.slice(0, 20).map(async (domain) => {
        const path = `/restful/v2/domains/${encodeURIComponent(domain)}/search?show_price=true&currency=USD`;
        const { ok, status, json } = await call(creds, "GET", path);
        if (!ok) {
          // 401/403 mean the whole request is unauthorized — an infrastructure problem,
          // not a real "taken" signal, so it must fail the entire batch rather than being
          // silently treated as unavailable. Other 4xx (e.g. "Unsupported domain type" for
          // a TLD Dynadot can't quote via this endpoint) are specific to that one domain —
          // drop just that domain rather than failing every other result alongside it.
          if (status === 401 || status === 403) return { fatal: extractError(json, status, "Could not check availability") };
          return null;
        }
        return extractQuote(domain, json as Record<string, unknown> | null);
      }),
    );
    const fatal = results.find((r): r is { fatal: string } => r !== null && "fatal" in r);
    if (fatal) return { error: fatal.fatal };
    return results.filter((r): r is DomainQuote => r !== null && !("fatal" in r));
  } catch {
    return { error: "Could not reach the domain search service." };
  }
}

export async function registerDomain(domain: string, years = 1): Promise<{ ok: true } | { error: string }> {
  const s = await getDomainSettings();
  const creds = resolveCreds(s);
  if (!creds) return { error: "Dynadot isn't configured." };
  const { ok, status, json } = await call(creds, "POST", "/restful/v2/domains/register", { domainName: domain, duration: years });
  if (!ok) return { error: extractError(json, status, "Dynadot rejected the registration") };
  return { ok: true };
}

export async function renewDomain(domain: string, years = 1): Promise<{ ok: true } | { error: string }> {
  const s = await getDomainSettings();
  const creds = resolveCreds(s);
  if (!creds) return { error: "Dynadot isn't configured." };
  const { ok, status, json } = await call(creds, "POST", `/restful/v2/domains/${encodeURIComponent(domain)}/renew`, { duration: years });
  if (!ok) return { error: extractError(json, status, "Dynadot rejected the renewal") };
  return { ok: true };
}

export async function setNameservers(domain: string, nameservers: string[]): Promise<{ ok: true } | { error: string }> {
  const s = await getDomainSettings();
  const creds = resolveCreds(s);
  if (!creds) return { error: "Dynadot isn't configured." };
  const { ok, status, json } = await call(creds, "PUT", `/restful/v2/domains/${encodeURIComponent(domain)}/nameserver`, {
    nameservers: nameservers.slice(0, 13),
  });
  if (!ok) return { error: extractError(json, status, "Dynadot rejected the nameserver update") };
  return { ok: true };
}

/**
 * Transfer a domain IN from another registrar. Requires the auth/EPP code
 * from the losing registrar. Unlike register/renew, a transfer is an async,
 * multi-day ICANN process — a successful call here means the transfer was
 * *initiated*, not completed; poll getTransferStatus for completion.
 */
export async function transferDomain(domain: string, authCode: string, years = 1): Promise<{ ok: true } | { error: string }> {
  const s = await getDomainSettings();
  const creds = resolveCreds(s);
  if (!creds) return { error: "Dynadot isn't configured." };
  const { ok, status, json } = await call(creds, "POST", `/restful/v2/domains/${encodeURIComponent(domain)}/transfer_in`, {
    authCode,
    duration: years,
  });
  if (!ok) return { error: extractError(json, status, "Dynadot rejected the transfer") };
  return { ok: true };
}

export async function getTransferStatus(domain: string): Promise<{ status: "pending" | "completed" | "failed"; error?: string }> {
  const s = await getDomainSettings();
  const creds = resolveCreds(s);
  if (!creds) return { status: "failed", error: "Dynadot isn't configured." };
  const { ok, status: httpStatus, json } = await call(creds, "GET", `/restful/v2/domains/${encodeURIComponent(domain)}/transfer/status`);
  if (!ok) return { status: "failed", error: extractError(json, httpStatus, "Could not check transfer status") };
  const transferStatus = String((json as Record<string, unknown> | null)?.status ?? "").toLowerCase();
  if (transferStatus.includes("complete") || transferStatus.includes("success")) return { status: "completed" };
  if (transferStatus.includes("fail") || transferStatus.includes("reject") || transferStatus.includes("cancel")) {
    return { status: "failed", error: extractError(json, httpStatus, "Transfer failed or was rejected") };
  }
  return { status: "pending" };
}
