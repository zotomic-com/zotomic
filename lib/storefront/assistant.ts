/**
 * Storefront Assistant — per-store config + monthly conversation metering.
 *
 * Billing model (locked with the owner 2026-09-09):
 *   - Each store PLAN grants a monthly quota of *conversations* the storefront
 *     assistant may start:  free 200 · business 2,000 · pro 10,000.
 *   - On top of that the owner can buy a pool of `extra_conversations` for
 *     campaign spikes — consumed only once the monthly quota is used up.
 *   - No owner assistant credits are spent; this is a separate meter.
 *   - Admin can `suspended` a store's assistant from the tenant console.
 */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";
import type { PlanId } from "@/lib/plans";

export const SF_CHAT_QUOTA: Record<PlanId, number> = {
  free: 200,
  business: 2_000,
  pro: 10_000,
};

/** Per-visitor guard rails (enforced in the route via the rate limiter). */
export const SF_VISITOR_LIMITS = {
  burst: { limit: 4, windowMs: 20_000 },
  hourly: { limit: 25, windowMs: 60 * 60_000 },
};

/** Max user+assistant turns kept as context per reply. */
export const SF_HISTORY_TURNS = 12;

export interface StorefrontAssistantConfig {
  enabled: boolean;
  name: string | null;
  greeting: string | null;
  suggestedPrompts: string[];
  extraConversations: number;
  suspended: boolean;
  suspendedReason: string | null;
}

const DEFAULT_CONFIG: StorefrontAssistantConfig = {
  enabled: false,
  name: null,
  greeting: null,
  suggestedPrompts: [],
  extraConversations: 0,
  suspended: false,
  suspendedReason: null,
};

export function utcPeriod(d = new Date()): string {
  return d.toISOString().slice(0, 7); // YYYY-MM
}

export function defaultAssistantName(storeName: string): string {
  return `${storeName} Assistant`;
}

export const DEFAULT_GREETING =
  "Hi! I can help you find products, check sizes and stock, and look up an order. What are you after?";

export async function getStorefrontAssistantConfig(
  businessId: string,
): Promise<StorefrontAssistantConfig> {
  const db = getAdminSupabase();
  const { data } = await db
    .from("storefront_assistant_config")
    .select("enabled, name, greeting, suggested_prompts, extra_conversations, suspended, suspended_reason")
    .eq("business_id", businessId)
    .maybeSingle();
  if (!data) return { ...DEFAULT_CONFIG };
  return {
    enabled: !!data.enabled,
    name: (data.name as string) || null,
    greeting: (data.greeting as string) || null,
    suggestedPrompts: Array.isArray(data.suggested_prompts)
      ? (data.suggested_prompts as string[]).filter((s) => typeof s === "string").slice(0, 6)
      : [],
    extraConversations: Number(data.extra_conversations ?? 0),
    suspended: !!data.suspended,
    suspendedReason: (data.suspended_reason as string) || null,
  };
}

async function planFor(businessId: string): Promise<PlanId> {
  const db = getAdminSupabase();
  const { data } = await db
    .from("subscriptions")
    .select("plan")
    .eq("business_id", businessId)
    .maybeSingle();
  const p = (data?.plan as string) ?? "free";
  return (["free", "business", "pro"].includes(p) ? p : "free") as PlanId;
}

export interface StorefrontAssistantState {
  /** owner switched it on AND admin has not suspended it */
  live: boolean;
  ownerEnabled: boolean;
  suspended: boolean;
  suspendedReason: string | null;
  displayName: string;
  greeting: string;
  suggestedPrompts: string[];
  plan: PlanId;
  period: string;
  quota: number;
  used: number;
  extra: number;
  /** conversations still available this month (quota headroom + top-up pool) */
  remaining: number;
  /** true once even the top-up pool is exhausted */
  exhausted: boolean;
}

export async function getStorefrontAssistantState(store: {
  businessId: string;
  name: string;
}): Promise<StorefrontAssistantState> {
  const db = getAdminSupabase();
  const period = utcPeriod();
  const [cfg, plan, usage] = await Promise.all([
    getStorefrontAssistantConfig(store.businessId),
    planFor(store.businessId),
    db
      .from("storefront_assistant_usage")
      .select("conversations")
      .eq("business_id", store.businessId)
      .eq("period", period)
      .maybeSingle()
      .then((r) => r.data),
  ]);

  const quota = SF_CHAT_QUOTA[plan];
  const used = Number(usage?.conversations ?? 0);
  const extra = cfg.extraConversations;
  const headroom = Math.max(0, quota - used);
  const remaining = headroom + extra;

  return {
    live: cfg.enabled && !cfg.suspended,
    ownerEnabled: cfg.enabled,
    suspended: cfg.suspended,
    suspendedReason: cfg.suspendedReason,
    displayName: cfg.name || defaultAssistantName(store.name),
    greeting: cfg.greeting || DEFAULT_GREETING,
    suggestedPrompts: cfg.suggestedPrompts,
    plan,
    period,
    quota,
    used,
    extra,
    remaining,
    exhausted: remaining <= 0,
  };
}

/**
 * Reserve one conversation against the monthly meter. Draws from the plan quota
 * first, then the purchased top-up pool. Returns false (and records a `blocked`
 * hit) when both are exhausted.
 */
export async function reserveStorefrontConversation(businessId: string): Promise<boolean> {
  const db = getAdminSupabase();
  const period = utcPeriod();

  const [{ data: usage }, cfg, plan] = await Promise.all([
    db
      .from("storefront_assistant_usage")
      .select("conversations")
      .eq("business_id", businessId)
      .eq("period", period)
      .maybeSingle(),
    getStorefrontAssistantConfig(businessId),
    planFor(businessId),
  ]);

  const quota = SF_CHAT_QUOTA[plan];
  const used = Number(usage?.conversations ?? 0);
  const withinQuota = used < quota;
  const canUseExtra = !withinQuota && cfg.extraConversations > 0;

  if (!withinQuota && !canUseExtra) {
    await bumpUsage(businessId, period, { blocked: 1 });
    return false;
  }

  if (canUseExtra) {
    await db
      .from("storefront_assistant_config")
      .update({ extra_conversations: cfg.extraConversations - 1, updated_at: new Date().toISOString() })
      .eq("business_id", businessId);
    await bumpUsage(businessId, period, { conversations: 1, extra_spent: 1 });
  } else {
    await bumpUsage(businessId, period, { conversations: 1 });
  }
  return true;
}

/** Atomic-ish counter bump for the monthly usage row (upsert then increment). */
export async function bumpUsage(
  businessId: string,
  period: string,
  delta: { conversations?: number; messages?: number; blocked?: number; extra_spent?: number },
): Promise<void> {
  const db = getAdminSupabase();
  await db
    .from("storefront_assistant_usage")
    .upsert(
      { business_id: businessId, period },
      { onConflict: "business_id,period", ignoreDuplicates: true },
    );
  const { data: row } = await db
    .from("storefront_assistant_usage")
    .select("conversations, messages, blocked, extra_spent")
    .eq("business_id", businessId)
    .eq("period", period)
    .maybeSingle();
  await db
    .from("storefront_assistant_usage")
    .update({
      conversations: Number(row?.conversations ?? 0) + (delta.conversations ?? 0),
      messages: Number(row?.messages ?? 0) + (delta.messages ?? 0),
      blocked: Number(row?.blocked ?? 0) + (delta.blocked ?? 0),
      extra_spent: Number(row?.extra_spent ?? 0) + (delta.extra_spent ?? 0),
    })
    .eq("business_id", businessId)
    .eq("period", period);
}
