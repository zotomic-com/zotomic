import { getDomainSettings } from "@/lib/platform-settings";

/** Thin wrapper over the Cloudflare API v4 (https://api.cloudflare.com/client/v4). */

const BASE = "https://api.cloudflare.com/client/v4";

async function call(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok && json?.success !== false, json };
}

export async function cloudflareConfigured(): Promise<boolean> {
  const s = await getDomainSettings();
  return !!(s.cloudflareApiToken && s.cloudflareAccountId);
}

export interface CloudflareZone {
  zoneId: string;
  nameservers: string[];
}

/** Create a Cloudflare zone for a newly-registered domain and return its assigned nameservers. */
export async function createZone(domain: string): Promise<CloudflareZone | { error: string }> {
  const s = await getDomainSettings();
  if (!s.cloudflareApiToken || !s.cloudflareAccountId) return { error: "Cloudflare isn't configured." };
  const { ok, json } = await call(s.cloudflareApiToken, "/zones", {
    method: "POST",
    body: JSON.stringify({ name: domain, account: { id: s.cloudflareAccountId }, type: "full" }),
  });
  if (!ok) return { error: json?.errors?.[0]?.message ?? "Cloudflare rejected the new zone." };
  const nameservers: string[] = json?.result?.name_servers ?? [];
  const zoneId: string | undefined = json?.result?.id;
  if (!zoneId || nameservers.length === 0) return { error: "Cloudflare didn't return nameservers for the new zone." };
  return { zoneId, nameservers };
}

/** Add a DNS record, proxy OFF — a proxied record blocks Vercel's certificate (see app/app/integrations/DomainClient.tsx). */
export async function addDnsRecord(
  zoneId: string,
  record: { type: "A" | "CNAME"; name: string; content: string },
): Promise<{ ok: true } | { error: string }> {
  const s = await getDomainSettings();
  if (!s.cloudflareApiToken) return { error: "Cloudflare isn't configured." };
  const { ok, json } = await call(s.cloudflareApiToken, `/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify({ ...record, proxied: false, ttl: 1 }),
  });
  if (!ok) return { error: json?.errors?.[0]?.message ?? "Cloudflare rejected the DNS record." };
  return { ok: true };
}

/**
 * Set up Email Routing: request the destination address (Cloudflare emails the
 * customer a verification link — forwarding stays inactive until they click it),
 * enable routing on the zone, and add a catch-all forward rule.
 */
export async function setupEmailRouting(zoneId: string, forwardTo: string): Promise<{ ok: true; pendingVerification: boolean } | { error: string }> {
  const s = await getDomainSettings();
  if (!s.cloudflareApiToken || !s.cloudflareAccountId) return { error: "Cloudflare isn't configured." };

  // Request (or reuse) the destination address — requires the recipient to verify by email.
  const dest = await call(s.cloudflareApiToken, `/accounts/${s.cloudflareAccountId}/email/routing/addresses`, {
    method: "POST",
    body: JSON.stringify({ email: forwardTo }),
  });
  const pendingVerification = dest.json?.result?.verified == null;

  const enabled = await call(s.cloudflareApiToken, `/zones/${zoneId}/email/routing/enable`, { method: "POST", body: "{}" });
  if (!enabled.ok) return { error: enabled.json?.errors?.[0]?.message ?? "Could not enable Email Routing on the zone." };

  const rule = await call(s.cloudflareApiToken, `/zones/${zoneId}/email/routing/rules`, {
    method: "POST",
    body: JSON.stringify({
      name: "Forward all mail",
      enabled: true,
      matchers: [{ type: "all" }],
      actions: [{ type: "forward", value: [forwardTo] }],
    }),
  });
  if (!rule.ok) return { error: rule.json?.errors?.[0]?.message ?? "Could not create the forwarding rule." };

  return { ok: true, pendingVerification };
}
