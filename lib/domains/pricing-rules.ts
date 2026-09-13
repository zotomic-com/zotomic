import { unstable_cache, revalidateTag } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase";

export interface PricingRule {
  id: string;
  provider: string;
  tld: string;
  commissionPercent: number | null;
  buyingPriceUsd: number | null;
  enabled: boolean;
}

function rowToRule(r: Record<string, unknown>): PricingRule {
  return {
    id: r.id as string,
    provider: r.provider as string,
    tld: r.tld as string,
    commissionPercent: r.commission_percent != null ? Number(r.commission_percent) : null,
    buyingPriceUsd: r.buying_price_usd != null ? Number(r.buying_price_usd) : null,
    enabled: r.enabled as boolean,
  };
}

/** Enabled pricing rules, keyed by provider+tld for fast lookup — used by the pricing engine. Cached. */
export const getPricingRules = unstable_cache(
  async (): Promise<PricingRule[]> => {
    const db = getAdminSupabase();
    const { data } = await db.from("domain_pricing_rules").select("*").eq("enabled", true);
    return (data ?? []).map(rowToRule);
  },
  ["domain-pricing"],
  { revalidate: 300, tags: ["domain-pricing"] },
);

/** Admin — every rule including disabled ones. */
export async function getAllPricingRules(): Promise<PricingRule[]> {
  const db = getAdminSupabase();
  const { data } = await db.from("domain_pricing_rules").select("*").order("provider").order("tld");
  return (data ?? []).map(rowToRule);
}

export interface PricingRuleInput {
  provider: string;
  tld: string;
  commissionPercent: number | null;
  buyingPriceUsd: number | null;
}

export async function createPricingRule(input: PricingRuleInput): Promise<{ ok: true } | { error: string }> {
  const db = getAdminSupabase();
  const { error } = await db.from("domain_pricing_rules").insert({
    provider: input.provider.trim().toLowerCase().slice(0, 40) || "dynadot",
    tld: input.tld.trim().toLowerCase().replace(/^\./, "").slice(0, 40),
    commission_percent: input.commissionPercent,
    buying_price_usd: input.buyingPriceUsd,
  });
  revalidateTag("domain-pricing");
  if (error) return { error: error.code === "23505" ? "A rule for this provider + TLD already exists." : "Could not create the rule." };
  return { ok: true };
}

export async function updatePricingRule(id: string, patch: Partial<PricingRuleInput & { enabled: boolean }>) {
  const db = getAdminSupabase();
  const update: Record<string, unknown> = {};
  if (patch.provider !== undefined) update.provider = patch.provider.trim().toLowerCase().slice(0, 40);
  if (patch.tld !== undefined) update.tld = patch.tld.trim().toLowerCase().replace(/^\./, "").slice(0, 40);
  if (patch.commissionPercent !== undefined) update.commission_percent = patch.commissionPercent;
  if (patch.buyingPriceUsd !== undefined) update.buying_price_usd = patch.buyingPriceUsd;
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  update.updated_at = new Date().toISOString();
  await db.from("domain_pricing_rules").update(update).eq("id", id);
  revalidateTag("domain-pricing");
}

export async function deletePricingRule(id: string) {
  const db = getAdminSupabase();
  await db.from("domain_pricing_rules").delete().eq("id", id);
  revalidateTag("domain-pricing");
}

/** Resolve the effective commission % for a TLD — a matching rule, else the global default. */
export function resolveCommissionPercent(rules: PricingRule[], provider: string, tld: string, globalDefault: number): number {
  const rule = rules.find((r) => r.provider === provider && r.tld === tld);
  return rule?.commissionPercent ?? globalDefault;
}
