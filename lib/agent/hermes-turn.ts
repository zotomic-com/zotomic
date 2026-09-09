/**
 * One store-owner ("Hermes") assistant turn for the Telegram channel.
 *
 * The web route (/api/assistant/messages) keeps its own flow. This is the
 * parallel for inbound Telegram: it re-applies the same suspend / AI-budget /
 * credit gates, resolves a rolling telegram conversation, runs the agent,
 * handles the confirm-before-acting flow with YES/NO, settles credits, and
 * persists the turn.
 */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";
import { runAgent } from "./hermes";
import { toolContext, TOOL_MAP } from "@/lib/tools/registry";
import { getBilling } from "@/lib/billing";
import { checkAiBudget, recordAiCalls } from "@/lib/ai/budget";
import { canSpendCredits, chargeCredits, getCreditAccount } from "@/lib/credits";

const HISTORY = 12;
const IDLE_RESET_MS = 6 * 60 * 60 * 1000;
const YES = /^(y|yes|yeah|yep|confirm|ok|okay|do it|go|proceed)\b/i;
const NO = /^(n|no|nope|cancel|stop|abort|nevermind|never ?mind)\b/i;

export interface HermesTurnResult {
  reply: string;
}

export async function runHermesTurn(opts: {
  businessId: string;
  userId: string;
  message: string;
}): Promise<HermesTurnResult> {
  const db = getAdminSupabase();
  const { businessId, userId } = opts;
  const message = opts.message.trim().slice(0, 4000);
  if (!message) return { reply: "Send me a question." };

  // ── gates (mirror /api/assistant/messages) ──────────────────────────────
  const { data: flags } = await db
    .from("businesses")
    .select("assistant_suspended, assistant_suspended_reason")
    .eq("id", businessId)
    .maybeSingle();
  if (flags?.assistant_suspended) {
    return {
      reply:
        (flags.assistant_suspended_reason as string) ||
        "Your assistant has been paused. Contact Zotomic support.",
    };
  }

  const budget = await checkAiBudget(db, businessId);
  if (!budget.ok) return { reply: budget.reason ?? "The assistant has hit today's usage ceiling. Try again tomorrow." };

  const billing = await getBilling(businessId);
  if (!(await canSpendCredits(businessId, 1))) {
    const acc = await getCreditAccount(businessId);
    const day = new Date(acc.weekResetsOn + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long" });
    return {
      reply: `You're out of assistant credits. Top up on the Billing page${
        billing.plan === "free" ? ", upgrade your plan," : ""
      } or wait for your free credits to reset on ${day}.`,
    };
  }

  // ── rolling telegram conversation ───────────────────────────────────────
  let conversationId: string | null = null;
  {
    const { data } = await db
      .from("assistant_conversations")
      .select("id, updated_at")
      .eq("business_id", businessId)
      .eq("channel", "telegram")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && Date.now() - new Date(data.updated_at as string).getTime() < IDLE_RESET_MS) {
      conversationId = data.id as string;
    }
  }
  if (!conversationId) {
    const { data, error } = await db
      .from("assistant_conversations")
      .insert({ business_id: businessId, user_id: userId, channel: "telegram", title: message.slice(0, 60) })
      .select("id")
      .single();
    if (error || !data) return { reply: "Couldn't start a chat. Try again shortly." };
    conversationId = data.id as string;
  }

  // ── confirm-before-acting ──────────────────────────────────────────────
  const { data: pending } = await db
    .from("assistant_pending_actions")
    .select("id, tool_name, args, status")
    .eq("conversation_id", conversationId)
    .eq("business_id", businessId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ctx = toolContext({ businessId, userId, db, role: "owner", currency: billing.currency });

  if (pending && NO.test(message)) {
    await db.from("assistant_pending_actions").update({ status: "rejected", resolved_at: new Date().toISOString() }).eq("id", pending.id);
    await saveTurn(db, conversationId, businessId, message, "Okay, cancelled that.", "n/a");
    return { reply: "Okay, cancelled that." };
  }

  if (pending && YES.test(message)) {
    if (billing.readOnly) {
      return { reply: "Your account is read-only until payment is confirmed, so I can't make changes yet." };
    }
    const history = await loadHistory(db, conversationId);
    const out = await runAgent(ctx, history, "Please proceed.", {
      plan: billing.plan,
      approved: { tool: pending.tool_name as string, args: (pending.args as Record<string, unknown>) ?? {} },
    });
    await db.from("assistant_pending_actions").update({ status: "approved", resolved_at: new Date().toISOString() }).eq("id", pending.id);
    await saveTurn(db, conversationId, businessId, "Approved the change.", out.reply, out.model);
    await settleTurn(db, businessId, userId, conversationId, out);
    return { reply: out.reply };
  }

  // ── normal turn ────────────────────────────────────────────────────────
  const history = await loadHistory(db, conversationId);
  const out = await runAgent(ctx, history, message, { plan: billing.plan });

  if (out.pendingAction) {
    if (billing.readOnly) {
      await saveTurn(db, conversationId, businessId, message, "I can't make changes while the account is read-only.", out.model);
      await settleTurn(db, businessId, userId, conversationId, out);
      return { reply: "I can't make changes while the account is read-only. Confirm payment on the Billing page and I'll apply it." };
    }
    await db.from("assistant_pending_actions").insert({
      conversation_id: conversationId,
      business_id: businessId,
      user_id: userId,
      tool_name: out.pendingAction.tool,
      args: out.pendingAction.args,
      preview: out.pendingAction.preview,
    });
    await saveTurn(db, conversationId, businessId, message, `Proposed: ${out.pendingAction.preview}`, out.model);
    await settleTurn(db, businessId, userId, conversationId, out);
    return {
      reply: `I'd like to run:\n${out.pendingAction.preview}\n\nReply YES to go ahead, or NO to cancel.`,
    };
  }

  await saveTurn(db, conversationId, businessId, message, out.reply, out.model);
  await settleTurn(db, businessId, userId, conversationId, out);
  return { reply: out.reply };
}

/* ── helpers (kept in sync with /api/assistant/messages) ──────────────────── */

type DB = ReturnType<typeof getAdminSupabase>;
type AgentOut = Awaited<ReturnType<typeof runAgent>>;

async function loadHistory(db: DB, conversationId: string) {
  const { data } = await db
    .from("assistant_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(HISTORY);
  return (data ?? [])
    .reverse()
    .filter((m) => m.content)
    .map((m) => ({ role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant", content: m.content as string }));
}

async function saveTurn(
  db: DB,
  conversationId: string,
  businessId: string,
  userText: string,
  assistantText: string,
  model: string,
) {
  await db.from("assistant_messages").insert([
    { conversation_id: conversationId, business_id: businessId, role: "user", content: userText },
    { conversation_id: conversationId, business_id: businessId, role: "assistant", content: assistantText, model },
  ]);
  await db.from("assistant_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
}

async function settleTurn(db: DB, businessId: string, userId: string, conversationId: string, out: AgentOut) {
  await recordAiCalls(db, businessId, userId, out.aiCalls, out.model);

  const toolRows = out.toolTraces
    .filter((t) => t.tool !== "web_search")
    .map((t) => ({
      business_id: businessId,
      user_id: userId,
      kind: "tool_call" as const,
      tool_name: t.tool,
      units: 1,
      cost: TOOL_MAP.get(t.tool)?.creditCost ?? 0,
    }));
  if (toolRows.length) await db.from("usage_ledger").insert(toolRows);

  const cost = out.aiCalls + out.creditsUsed;
  if (cost > 0) {
    await chargeCredits(businessId, cost, {
      reason: "assistant",
      refType: "conversation",
      refId: conversationId,
      actorId: userId,
      actorType: "assistant",
      meta: { aiCalls: out.aiCalls, toolCredits: out.creditsUsed, channel: "telegram" },
    });
  }
}
