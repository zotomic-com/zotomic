import { NextRequest, NextResponse } from "next/server";
import { resolveTenant, isTenantError } from "@/lib/tenant";
import { getAdminSupabase } from "@/lib/supabase";
import { getBilling } from "@/lib/billing";
import { runAgent, type AgentMessage } from "@/lib/agent/hermes";
import { toolContext } from "@/lib/tools/registry";
import { TOOL_MAP } from "@/lib/tools/registry";
import { checkAiBudget, recordAiCalls } from "@/lib/ai/budget";
import { canSpendCredits, chargeCredits, getCreditAccount } from "@/lib/credits";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { AgentOutcome } from "@/lib/agent/hermes";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const tenant = await resolveTenant(req);
  if (isTenantError(tenant)) return tenant;

  // burst guard — one assistant turn every few seconds per business
  const burst = enforceRateLimit(req, {
    name: "assistant",
    key: tenant.businessId,
    limit: 8,
    windowMs: 30_000,
    message: "You're sending messages very quickly. Wait a few seconds and try again.",
  });
  if (burst) return burst;

  const body = await req.json().catch(() => ({}));
  const db = getAdminSupabase();

  // daily AI ceiling — backstop against a runaway loop draining the key
  const budget = await checkAiBudget(db, tenant.businessId);
  if (!budget.ok) {
    return NextResponse.json({ error: budget.reason }, { status: 429 });
  }

  // admin kill switch (set from the Admin Assistant)
  const { data: bizFlags } = await db
    .from("businesses")
    .select("assistant_suspended, assistant_suspended_reason")
    .eq("id", tenant.businessId)
    .maybeSingle();
  if (bizFlags?.assistant_suspended) {
    return NextResponse.json(
      { error: (bizFlags.assistant_suspended_reason as string) || "Your assistant has been paused. Contact Zotomic support." },
      { status: 403 },
    );
  }

  const billing = await getBilling(tenant.businessId);
  const plan = billing.plan;

  // credit gate — the assistant runs on credits (weekly allowance + top-ups).
  // At/below the -20 overdraft floor the assistant is blocked until Friday's reset.
  if (!(await canSpendCredits(tenant.businessId, 1))) {
    const acc = await getCreditAccount(tenant.businessId);
    return NextResponse.json(
      {
        error:
          "You're out of assistant credits. Top up on the Billing page" +
          (plan === "free" ? ", upgrade your plan," : "") +
          ` or wait for your free credits to reset on ${new Date(acc.weekResetsOn + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long" })}.`,
        credits: { spendable: acc.spendable, resetsOn: acc.weekResetsOn },
      },
      { status: 402 },
    );
  }

  // conversation
  let conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
  if (conversationId) {
    const { data } = await db
      .from("assistant_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("business_id", tenant.businessId)
      .maybeSingle();
    if (!data) conversationId = null;
  }
  if (!conversationId) {
    const { data } = await db
      .from("assistant_conversations")
      .insert({ business_id: tenant.businessId, user_id: tenant.user.id, title: null })
      .select("id")
      .single();
    conversationId = data!.id as string;
  }

  const ctx = toolContext({
    businessId: tenant.businessId,
    userId: tenant.user.id,
    db,
    role: tenant.role,
    currency: billing.currency,
  });

  // ── approval resume ──────────────────────────────────────────────────────
  if (typeof body.approveId === "string") {
    const { data: pending } = await db
      .from("assistant_pending_actions")
      .select("id, tool_name, args, status")
      .eq("id", body.approveId)
      .eq("business_id", tenant.businessId)
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (!pending || pending.status !== "pending") {
      return NextResponse.json({ error: "That action is no longer available." }, { status: 409 });
    }
    if (billing.readOnly) {
      return NextResponse.json({ error: "Your account is read-only. Changes are paused until payment is confirmed." }, { status: 403 });
    }

    const history = await loadHistory(db, conversationId);
    const out = await runAgent(ctx, history, "Please proceed.", {
      plan,
      approved: { tool: pending.tool_name as string, args: (pending.args as Record<string, unknown>) ?? {} },
    });

    await db.from("assistant_pending_actions").update({ status: "approved", resolved_at: new Date().toISOString() }).eq("id", pending.id);
    await saveTurn(db, conversationId, tenant.businessId, "Approved the change.", out.reply, out.model);
    const credits = await settleTurn(db, tenant.businessId, tenant.user.id, conversationId, out);

    return NextResponse.json({ conversationId, reply: out.reply, toolTraces: out.toolTraces, credits });
  }

  // ── normal message ───────────────────────────────────────────────────────
  const message = String(body.message ?? "").trim().slice(0, 4000);
  if (!message) return NextResponse.json({ error: "Empty message" }, { status: 400 });

  const history = await loadHistory(db, conversationId);
  const out = await runAgent(ctx, history, message, { plan });

  if (out.pendingAction) {
    if (billing.readOnly) {
      await saveTurn(
        db,
        conversationId,
        tenant.businessId,
        message,
        "I can't make changes while the account is read-only. Once payment is confirmed I can apply that.",
        out.model,
      );
      const credits = await settleTurn(db, tenant.businessId, tenant.user.id, conversationId, out);
      return NextResponse.json({
        conversationId,
        reply: "I can't make changes while the account is read-only. Confirm payment on the Billing page and I'll apply it.",
        toolTraces: out.toolTraces,
        credits,
      });
    }
    const { data: pa } = await db
      .from("assistant_pending_actions")
      .insert({
        conversation_id: conversationId,
        business_id: tenant.businessId,
        user_id: tenant.user.id,
        tool_name: out.pendingAction.tool,
        args: out.pendingAction.args,
        preview: out.pendingAction.preview,
      })
      .select("id")
      .single();

    await saveTurn(db, conversationId, tenant.businessId, message, `Proposed: ${out.pendingAction.preview}`, out.model);
    const credits = await settleTurn(db, tenant.businessId, tenant.user.id, conversationId, out);

    return NextResponse.json({
      conversationId,
      toolTraces: out.toolTraces,
      credits,
      pendingAction: { id: pa!.id, tool: out.pendingAction.tool, preview: out.pendingAction.preview, risk: TOOL_MAP.get(out.pendingAction.tool)?.risk },
    });
  }

  await saveTurn(db, conversationId, tenant.businessId, message, out.reply, out.model);
  const credits = await settleTurn(db, tenant.businessId, tenant.user.id, conversationId, out);

  return NextResponse.json({ conversationId, reply: out.reply, toolTraces: out.toolTraces, credits });
}

// ── helpers ────────────────────────────────────────────────────────────────
async function loadHistory(db: ReturnType<typeof getAdminSupabase>, conversationId: string): Promise<AgentMessage[]> {
  const { data } = await db
    .from("assistant_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(12);
  return (data ?? [])
    .reverse()
    .filter((m) => m.content)
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content as string }));
}

async function saveTurn(
  db: ReturnType<typeof getAdminSupabase>,
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
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const { data: conv } = await db.from("assistant_conversations").select("title").eq("id", conversationId).single();
  if (!conv?.title && userText) patch.title = userText.slice(0, 60);
  await db.from("assistant_conversations").update(patch).eq("id", conversationId);
}

/**
 * After a turn: record AI calls (daily ceiling), record per-tool usage
 * (admin analytics), and charge the store's credit balance. Returns the new
 * balance so the client can update its meter.
 *
 * Credit cost of a turn = 1 per Gemini call + each tool's `creditCost`
 * (read 0, write 1, consequential 2, web_search 10).
 */
async function settleTurn(
  db: ReturnType<typeof getAdminSupabase>,
  businessId: string,
  userId: string,
  conversationId: string,
  out: AgentOutcome,
): Promise<{ spendable: number; resetsOn: string } | null> {
  await recordAiCalls(db, businessId, userId, out.aiCalls, out.model);

  // per-tool usage rows (web_search records its own row inside the tool)
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
  if (cost <= 0) {
    try {
      const acc = await getCreditAccount(businessId);
      return { spendable: acc.spendable, resetsOn: acc.weekResetsOn };
    } catch {
      return null;
    }
  }
  const res = await chargeCredits(businessId, cost, {
    reason: "assistant",
    refType: "conversation",
    refId: conversationId,
    actorId: userId,
    actorType: "assistant",
    meta: { aiCalls: out.aiCalls, toolCredits: out.creditsUsed },
  });
  const acc = await getCreditAccount(businessId);
  void res;
  return { spendable: acc.spendable, resetsOn: acc.weekResetsOn };
}
