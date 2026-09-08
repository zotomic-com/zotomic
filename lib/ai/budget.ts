/**
 * Daily ceiling on Gemini calls, backed by the existing `usage_ledger` table
 * (kind = 'ai_tokens'). No schema change. This is the backstop against a
 * runaway agent loop or a misbehaving cron quietly draining a metered key:
 * even if every other guard fails, the day's spend is bounded.
 *
 * Limits are deliberately generous — they catch pathological volume, not
 * normal use. Per-plan credit accounting (Phase 9C) is the fine-grained control.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const PER_BUSINESS_DAILY = Number(process.env.AI_DAILY_LIMIT_PER_BUSINESS || 500);
const GLOBAL_DAILY = Number(process.env.AI_DAILY_LIMIT_GLOBAL || 8000);

type DB = SupabaseClient;

function startOfUtcDay(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export interface BudgetCheck {
  ok: boolean;
  scope?: "business" | "global";
  reason?: string;
}

/** Call before starting an AI turn. Cheap: two count queries. */
export async function checkAiBudget(db: DB, businessId: string): Promise<BudgetCheck> {
  const since = startOfUtcDay();

  const [{ count: bizCount }, { count: globalCount }] = await Promise.all([
    db
      .from("usage_ledger")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("kind", "ai_tokens")
      .gte("created_at", since),
    db
      .from("usage_ledger")
      .select("id", { count: "exact", head: true })
      .eq("kind", "ai_tokens")
      .gte("created_at", since),
  ]);

  if ((globalCount ?? 0) >= GLOBAL_DAILY) {
    return {
      ok: false,
      scope: "global",
      reason: "The assistant is paused platform-wide for the rest of today after unusually high usage. It resets at 00:00 UTC.",
    };
  }
  if ((bizCount ?? 0) >= PER_BUSINESS_DAILY) {
    return {
      ok: false,
      scope: "business",
      reason: `This store has reached today's assistant activity limit (${PER_BUSINESS_DAILY} AI operations). It resets at 00:00 UTC.`,
    };
  }
  return { ok: true };
}

/**
 * Record `calls` Gemini invocations against a business. One row, `units` = the
 * count, so a single agent turn that made 5 model calls is one ledger entry.
 */
export async function recordAiCalls(
  db: DB,
  businessId: string,
  userId: string | null,
  calls: number,
  model?: string,
): Promise<void> {
  if (calls <= 0) return;
  await db.from("usage_ledger").insert({
    business_id: businessId,
    user_id: userId,
    kind: "ai_tokens",
    tool_name: model ?? null,
    units: calls,
    cost: 0,
  });
}
