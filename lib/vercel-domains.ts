/**
 * Thin wrapper over the Vercel Domains API — used to attach store-owner custom
 * domains to this project so Vercel provisions routing + SSL.
 *
 * Config: VERCEL_API_TOKEN / VERCEL_DOMAINS_PROJECT_ID / VERCEL_DOMAINS_TEAM_ID
 * (falls back to VERCEL_ACCESS_TOKEN / VERCEL_PROJECT_ID / VERCEL_TEAM_ID for
 * local dev). If unset, calls are skipped and the owner just gets DNS records.
 */

const TOKEN = process.env.VERCEL_API_TOKEN || process.env.VERCEL_ACCESS_TOKEN || "";
const PROJECT = process.env.VERCEL_DOMAINS_PROJECT_ID || process.env.VERCEL_PROJECT_ID || "";
const TEAM = process.env.VERCEL_DOMAINS_TEAM_ID || process.env.VERCEL_TEAM_ID || "";

export const vercelDomainsConfigured = () => !!(TOKEN && PROJECT && TEAM);

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.vercel.com${path}?teamId=${TEAM}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/** Attach a domain to the project. Idempotent — an existing domain is fine. */
export async function addProjectDomain(domain: string): Promise<{ ok: boolean; error?: string }> {
  if (!vercelDomainsConfigured()) return { ok: true };
  const r = await call(`/v10/projects/${PROJECT}/domains`, {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  });
  if (r.ok) return { ok: true };
  const code = r.json?.error?.code;
  if (code === "domain_already_in_use" || code === "domain_taken") {
    return { ok: false, error: "That domain is already connected to another Vercel project." };
  }
  if (r.status === 409) return { ok: true }; // already on this project
  return { ok: false, error: r.json?.error?.message ?? "Vercel rejected the domain." };
}

export async function removeProjectDomain(domain: string): Promise<void> {
  if (!vercelDomainsConfigured()) return;
  await call(`/v9/projects/${PROJECT}/domains/${encodeURIComponent(domain)}`, { method: "DELETE" });
}

export interface DomainState {
  configured: boolean; // Vercel says DNS is correct + cert issued
  verified: boolean; // ownership verified (project domain)
  misconfigured: boolean;
  /** verification challenges Vercel wants, if any */
  verification: { type: string; domain: string; value: string; reason?: string }[];
}

export async function getDomainState(domain: string): Promise<DomainState> {
  if (!vercelDomainsConfigured()) {
    return { configured: false, verified: false, misconfigured: true, verification: [] };
  }
  const [pd, cfg] = await Promise.all([
    call(`/v9/projects/${PROJECT}/domains/${encodeURIComponent(domain)}`),
    call(`/v6/domains/${encodeURIComponent(domain)}/config`),
  ]);
  const verified = !!pd.json?.verified;
  const verification = Array.isArray(pd.json?.verification) ? pd.json.verification : [];
  const misconfigured = cfg.json?.misconfigured !== false; // true or unknown → misconfigured
  return { configured: verified && !misconfigured, verified, misconfigured, verification };
}

/** Standard DNS records to point a domain at Vercel. */
export function dnsRecords(domain: string): { type: string; name: string; value: string }[] {
  const isApex = domain.split(".").length === 2;
  return isApex
    ? [{ type: "A", name: "@", value: "76.76.21.21" }]
    : [{ type: "CNAME", name: domain.split(".")[0], value: "cname.vercel-dns.com" }];
}
