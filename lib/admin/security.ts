/** IP blocklist + login-attempt logging for admin user management. */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";

let cache: { list: { ip: string }[]; at: number } | null = null;
const TTL = 60_000;

export function invalidateBlockedIpCache() {
  cache = null;
}

async function blockedList(): Promise<{ ip: string }[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.list;
  try {
    const db = getAdminSupabase();
    const { data } = await db.from("blocked_ips").select("ip");
    cache = { list: (data ?? []).map((r) => ({ ip: (r.ip as string).trim() })), at: Date.now() };
  } catch {
    cache = { list: [], at: Date.now() };
  }
  return cache.list;
}

/** IPv4 exact match, or `a.b.c.d/N` (N = 8/16/24/32) prefix match. */
function ipMatches(ip: string, rule: string): boolean {
  if (!ip || !rule) return false;
  if (ip === rule) return true;
  const slash = rule.indexOf("/");
  if (slash === -1) return false;
  const bits = Number(rule.slice(slash + 1));
  const base = rule.slice(0, slash).split(".").map(Number);
  const test = ip.split(".").map(Number);
  if (base.length !== 4 || test.length !== 4 || base.some(isNaN) || test.some(isNaN)) return false;
  const octets = Math.floor(bits / 8);
  for (let i = 0; i < octets; i++) if (base[i] !== test[i]) return false;
  const rem = bits % 8;
  if (rem) {
    const mask = 0xff << (8 - rem);
    if ((base[octets] & mask) !== (test[octets] & mask)) return false;
  }
  return true;
}

export async function isIpBlocked(ip: string): Promise<boolean> {
  if (!ip || ip === "unknown") return false;
  const list = await blockedList();
  return list.some((r) => ipMatches(ip, r.ip));
}

export async function logLoginEvent(e: {
  userId?: string | null;
  email?: string | null;
  ip: string;
  ua: string;
  outcome: "success" | "bad_password" | "suspended" | "blocked" | "ip_blocked" | "not_found";
}): Promise<void> {
  try {
    const db = getAdminSupabase();
    await db.from("user_login_events").insert({
      user_id: e.userId ?? null,
      email: e.email ?? null,
      ip: e.ip || null,
      user_agent: (e.ua || "").slice(0, 400),
      outcome: e.outcome,
    });
  } catch {
    /* non-fatal */
  }
}
