/**
 * Web-search API keys (platform-global) for the admin assistant's web_search
 * tool. Stored AES-encrypted in `search_api_keys`, managed from /admin/assistants.
 * Server-only.
 */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";
import { decrypt } from "@/lib/auth";

export const PROVIDER_META = {
  tavily: {
    name: "Tavily",
    monthlyLimit: 1000,
    signup: "https://app.tavily.com",
    hint: "1,000 searches/month · no card · best for AI",
    keyHint: "tvly-…",
  },
  serper: {
    name: "Serper.dev",
    monthlyLimit: 2500,
    signup: "https://serper.dev/api-key",
    hint: "2,500 free credits · no card · Google results",
    keyHint: "64-char hex",
  },
  brave: {
    name: "Brave Search",
    monthlyLimit: 2000,
    signup: "https://api-dashboard.search.brave.com",
    hint: "2,000/month · card required",
    keyHint: "BSA…",
  },
} as const;

export type SearchProvider = keyof typeof PROVIDER_META;
export const SEARCH_PROVIDERS = Object.keys(PROVIDER_META) as SearchProvider[];

export interface ActiveSearchKey {
  id: string;
  provider: SearchProvider;
  key: string;
}

/** Enabled keys, in the order the runtime should try them. */
export async function getActiveSearchKeys(): Promise<ActiveSearchKey[]> {
  const { data } = await getAdminSupabase()
    .from("search_api_keys")
    .select("id, provider, api_key")
    .eq("enabled", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? [])
    .map((r) => ({
      id: r.id as string,
      provider: r.provider as SearchProvider,
      key: decrypt(r.api_key as string),
    }))
    .filter((k) => k.key && SEARCH_PROVIDERS.includes(k.provider));
}

export function utcMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

/** Bump usage + record the outcome of the most recent call for a key. */
export async function recordSearchKeyUse(
  id: string,
  ok: boolean,
  opts: { error?: string; providerLeft?: number | null } = {},
): Promise<void> {
  try {
    const db = getAdminSupabase();
    const { data: row } = await db
      .from("search_api_keys")
      .select("usage_month, usage_count")
      .eq("id", id)
      .maybeSingle();
    const month = utcMonth();
    const count = row?.usage_month === month ? Number(row.usage_count ?? 0) + 1 : 1;
    const patch: Record<string, unknown> = {
      usage_month: month,
      usage_count: count,
      last_used_at: new Date().toISOString(),
      last_status: ok ? "ok" : `error: ${(opts.error ?? "failed").slice(0, 140)}`,
    };
    if (opts.providerLeft != null && Number.isFinite(opts.providerLeft)) {
      patch.provider_left = Math.max(0, Math.round(opts.providerLeft));
    }
    await db.from("search_api_keys").update(patch).eq("id", id);
  } catch {
    /* usage tracking is best-effort */
  }
}
