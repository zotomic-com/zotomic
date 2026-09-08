/**
 * Zotomic Assistant credit accounting (Phase 9C).
 *
 * Spendable = allowance_balance (weekly plan grant, resets Friday, can dip to a
 * -20 overdraft) + purchased_balance (top-up packs, never expire).
 *
 * Costs (see lib/tools/registry.ts `creditCost` + the agent's per-turn AI cost):
 *   read tool            0
 *   AI turn (Gemini)     1   (charged per model call in a turn)
 *   write tool           1
 *   consequential tool   2
 *   web-search tool     10   + a hard daily cap by plan
 */
import { getAdminSupabase } from "@/lib/supabase";
import { PLANS, type PlanId } from "@/lib/plans";

export const OVERDRAFT_FLOOR = -20;

export interface CreditPack {
  id: string;
  credits: number;
  price: number; // BDT
  label: string;
  tag?: string;
}

/** Charm pricing, improving unit rate, one anchored "Most popular". ৳ TUNE after
 *  measuring real Gemini cost/turn. Minimum top-up = ৳100. */
export const CREDIT_PACKS: CreditPack[] = [
  { id: "starter", credits: 150, price: 100, label: "Starter" },
  { id: "value", credits: 700, price: 400, label: "Value", tag: "Most popular" },
  { id: "power", credits: 1800, price: 900, label: "Power", tag: "Best value" },
  { id: "bulk", credits: 4500, price: 2000, label: "Bulk" },
];

export function creditPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

function weeklyAllowanceFor(plan: PlanId): number {
  return PLANS.find((p) => p.id === plan)?.weeklyCredits ?? 15;
}
export function webSearchCapFor(plan: PlanId): number {
  return PLANS.find((p) => p.id === plan)?.webSearchPerDay ?? 5;
}

export interface CreditAccount {
  businessId: string;
  plan: PlanId;
  allowanceBalance: number;
  purchasedBalance: number;
  spendable: number;
  planAllowance: number;
  weekResetsOn: string; // YYYY-MM-DD
  lifetimePurchased: number;
  lifetimeSpent: number;
}

type DB = ReturnType<typeof getAdminSupabase>;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function planOf(db: DB, businessId: string): Promise<PlanId> {
  const { data } = await db.from("subscriptions").select("plan").eq("business_id", businessId).maybeSingle();
  return (data?.plan ?? "free") as PlanId;
}

/**
 * Load the account, creating it on first use, keeping `plan_allowance` in sync
 * with the current plan, and lazily applying a due weekly reset (a safety net if
 * the Friday cron was missed).
 */
export async function getCreditAccount(businessId: string): Promise<CreditAccount> {
  const db = getAdminSupabase();
  const plan = await planOf(db, businessId);
  const allowance = weeklyAllowanceFor(plan);

  let { data: row } = await db
    .from("credit_accounts")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();

  if (!row) {
    const seed = {
      business_id: businessId,
      allowance_balance: allowance,
      purchased_balance: 0,
      plan_allowance: allowance,
      week_resets_on: addDays(todayUtc(), 7),
      lifetime_purchased: 0,
      lifetime_spent: 0,
    };
    const { data: created } = await db.from("credit_accounts").insert(seed).select("*").single();
    row = created ?? seed;
    await db.from("credit_ledger").insert({
      business_id: businessId,
      delta: allowance,
      reason: "signup_grant",
      balance_after: allowance,
      actor_type: "system",
    });
  }

  let allowanceBalance = Number(row.allowance_balance);
  let weekResetsOn = String(row.week_resets_on);
  const planAllowance = allowance;

  // keep the snapshot current
  if (Number(row.plan_allowance) !== planAllowance) {
    await db.from("credit_accounts").update({ plan_allowance: planAllowance }).eq("business_id", businessId);
  }

  // lazy weekly reset
  if (weekResetsOn <= todayUtc()) {
    allowanceBalance = planAllowance + Math.min(allowanceBalance, 0);
    weekResetsOn = addDays(todayUtc(), 7);
    await db
      .from("credit_accounts")
      .update({ allowance_balance: allowanceBalance, week_resets_on: weekResetsOn, plan_allowance: planAllowance, updated_at: new Date().toISOString() })
      .eq("business_id", businessId);
    await db.from("credit_ledger").insert({
      business_id: businessId,
      delta: planAllowance,
      reason: "weekly_allowance",
      balance_after: allowanceBalance + Number(row.purchased_balance),
      actor_type: "system",
    });
  }

  const purchasedBalance = Number(row.purchased_balance);
  return {
    businessId,
    plan,
    allowanceBalance,
    purchasedBalance,
    spendable: allowanceBalance + purchasedBalance,
    planAllowance,
    weekResetsOn,
    lifetimePurchased: Number(row.lifetime_purchased),
    lifetimeSpent: Number(row.lifetime_spent),
  };
}

/** Would a charge of `amount` stay within the overdraft floor? */
export async function canSpendCredits(businessId: string, amount: number): Promise<boolean> {
  if (amount <= 0) return true;
  const acc = await getCreditAccount(businessId);
  return acc.spendable - amount >= OVERDRAFT_FLOOR;
}

export interface ChargeOpts {
  reason?: string;
  refType?: string;
  refId?: string;
  actorId?: string | null;
  actorType?: "system" | "owner" | "admin" | "assistant";
  meta?: Record<string, unknown>;
}

/** Deduct credits (allowance first, then purchased). Returns the new spendable
 *  total, or an error if it would breach the overdraft floor. */
export async function chargeCredits(
  businessId: string,
  amount: number,
  opts: ChargeOpts = {},
): Promise<{ ok: true; balanceAfter: number } | { ok: false; reason: string; balanceAfter: number }> {
  const db = getAdminSupabase();
  const acc = await getCreditAccount(businessId);
  if (amount <= 0) return { ok: true, balanceAfter: acc.spendable };

  if (acc.spendable - amount < OVERDRAFT_FLOOR) {
    return {
      ok: false,
      balanceAfter: acc.spendable,
      reason: "Not enough assistant credits. Top up on the Billing page or wait for your free credits to reset on Friday.",
    };
  }

  const fromAllowance = Math.min(amount, Math.max(acc.allowanceBalance, 0));
  const stillNeeded = amount - fromAllowance;
  const fromPurchased = Math.min(stillNeeded, acc.purchasedBalance);
  const intoOverdraft = stillNeeded - fromPurchased;

  const newAllowance = acc.allowanceBalance - fromAllowance - intoOverdraft;
  const newPurchased = acc.purchasedBalance - fromPurchased;
  const balanceAfter = newAllowance + newPurchased;

  await db
    .from("credit_accounts")
    .update({
      allowance_balance: newAllowance,
      purchased_balance: newPurchased,
      lifetime_spent: acc.lifetimeSpent + amount,
      updated_at: new Date().toISOString(),
    })
    .eq("business_id", businessId);

  await db.from("credit_ledger").insert({
    business_id: businessId,
    delta: -amount,
    reason: opts.reason ?? "assistant",
    balance_after: balanceAfter,
    ref_type: opts.refType ?? null,
    ref_id: opts.refId ?? null,
    actor_id: opts.actorId ?? null,
    actor_type: opts.actorType ?? "assistant",
    meta: opts.meta ?? {},
  });

  return { ok: true, balanceAfter };
}

export interface GrantOpts {
  reason: string; // purchase | admin_adjust | promo
  actorId?: string | null;
  actorType?: "system" | "owner" | "admin";
  refType?: string;
  refId?: string;
  note?: string;
}

/** Add (or, with a negative amount, remove) purchased credits. Admin grants and
 *  confirmed top-ups both land here. */
export async function grantCredits(
  businessId: string,
  amount: number,
  opts: GrantOpts,
): Promise<{ ok: true; balanceAfter: number } | { ok: false; reason: string }> {
  if (!Number.isFinite(amount) || amount === 0) return { ok: false, reason: "Amount must be non-zero." };
  const db = getAdminSupabase();
  const acc = await getCreditAccount(businessId);

  const newPurchased = acc.purchasedBalance + amount;
  if (newPurchased < 0) {
    return { ok: false, reason: "That would take purchased credits below zero." };
  }
  const balanceAfter = acc.allowanceBalance + newPurchased;

  await db
    .from("credit_accounts")
    .update({
      purchased_balance: newPurchased,
      lifetime_purchased: acc.lifetimePurchased + (amount > 0 ? amount : 0),
      updated_at: new Date().toISOString(),
    })
    .eq("business_id", businessId);

  await db.from("credit_ledger").insert({
    business_id: businessId,
    delta: amount,
    reason: opts.reason,
    balance_after: balanceAfter,
    ref_type: opts.refType ?? null,
    ref_id: opts.refId ?? null,
    actor_id: opts.actorId ?? null,
    actor_type: opts.actorType ?? "admin",
    meta: opts.note ? { note: opts.note } : {},
  });

  return { ok: true, balanceAfter };
}

/** web-search / grounded calls used today (UTC), for the per-plan daily cap. */
export async function webSearchesToday(businessId: string): Promise<number> {
  const db = getAdminSupabase();
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await db
    .from("usage_ledger")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("tool_name", "web_search")
    .gte("created_at", since.toISOString());
  return count ?? 0;
}

export async function recentCreditLedger(businessId: string, limit = 20) {
  const db = getAdminSupabase();
  const { data } = await db
    .from("credit_ledger")
    .select("delta, reason, balance_after, actor_type, created_at, meta")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
