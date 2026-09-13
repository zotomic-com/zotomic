import { getDomainSettings } from "@/lib/platform-settings";

/**
 * Thin wrapper over the Dynadot API (https://api.dynadot.com/api3.json).
 * Registration relies on the account's default contact set in the Dynadot
 * dashboard — the API's contact fields are optional and we don't collect
 * full WHOIS contact details from domain-reseller customers.
 */

const BASE = "https://api.dynadot.com/api3.json";

async function call(apiKey: string, command: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ key: apiKey, command, ...params });
  const res = await fetch(`${BASE}?${qs.toString()}`, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, json };
}

export interface DomainQuote {
  domain: string;
  available: boolean;
  wholesaleCost: number | null;
}

export async function dynadotConfigured(): Promise<boolean> {
  const s = await getDomainSettings();
  return !!s.dynadotApiKey;
}

/** Check availability + wholesale price for up to 20 domains in one call. */
export async function checkAvailability(domains: string[]): Promise<DomainQuote[] | { error: string }> {
  const s = await getDomainSettings();
  if (!s.dynadotApiKey) return { error: "Domain search isn't configured yet." };
  if (domains.length === 0) return [];

  const params: Record<string, string> = { show_price: "1", currency: "USD" };
  domains.slice(0, 20).forEach((d, i) => (params[`domain${i}`] = d));

  const { ok, json } = await call(s.dynadotApiKey, "search", params);
  const results = json?.SearchResponse?.SearchResults;
  if (!ok || !Array.isArray(results)) {
    return { error: json?.SearchResponse?.Error ?? "Could not reach the domain search service." };
  }
  return results.map((r: Record<string, unknown>) => ({
    domain: String(r.DomainName ?? ""),
    available: String(r.Available).toLowerCase() === "yes",
    wholesaleCost: r.Price != null ? Number(r.Price) : null,
  }));
}

export async function registerDomain(domain: string, years = 1): Promise<{ ok: true } | { error: string }> {
  const s = await getDomainSettings();
  if (!s.dynadotApiKey) return { error: "Dynadot isn't configured." };
  const { ok, json } = await call(s.dynadotApiKey, "register", { domain, duration: String(years), currency: "USD" });
  const code = json?.Register?.ResponseCode;
  if (!ok || String(code) !== "0") {
    return { error: json?.Register?.Error ?? "Dynadot rejected the registration." };
  }
  return { ok: true };
}

export async function renewDomain(domain: string, years = 1): Promise<{ ok: true } | { error: string }> {
  const s = await getDomainSettings();
  if (!s.dynadotApiKey) return { error: "Dynadot isn't configured." };
  const { ok, json } = await call(s.dynadotApiKey, "renew", { domain, duration: String(years), currency: "USD" });
  const code = json?.Renew?.ResponseCode;
  if (!ok || String(code) !== "0") {
    return { error: json?.Renew?.Error ?? "Dynadot rejected the renewal." };
  }
  return { ok: true };
}

export async function setNameservers(domain: string, nameservers: string[]): Promise<{ ok: true } | { error: string }> {
  const s = await getDomainSettings();
  if (!s.dynadotApiKey) return { error: "Dynadot isn't configured." };
  const params: Record<string, string> = { domain };
  nameservers.slice(0, 13).forEach((ns, i) => (params[`ns${i}`] = ns));
  const { ok, json } = await call(s.dynadotApiKey, "set_ns", params);
  const code = json?.SetNsResponse?.ResponseCode;
  if (!ok || String(code) !== "0") {
    return { error: json?.SetNsResponse?.Error ?? "Dynadot rejected the nameserver update." };
  }
  return { ok: true };
}
