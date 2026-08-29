import { NextRequest, NextResponse } from "next/server";
import { resolveTenant, isTenantError } from "@/lib/tenant";
import { getAdminSupabase } from "@/lib/supabase";
import { getBilling } from "@/lib/billing";
import { PLANS } from "@/lib/plans";
import { runAgent, type AgentMessage } from "@/lib/agent/hermes";
import { toolContext } from "@/lib/tools/registry";
import { TOOL_MAP } from "@/lib/tools/registry";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const tenant = await resolveTenant(req);
  if (isTenantError(tenant)) return tenant;

  const body = await req.json().catch(() => ({}));
  const db = getAdminSupabase();

  const billing = await getBilling(tenant.businessId);
  const plan = billing.plan;

  // daily message cap by plan
  const cap = PLANS.find((p) => p.id === plan)?.limits.assistantMessagesPerDay ?? 10;
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db
    .from("assistant_messages")
    .select("id", { count: "exact", head: true })
    .eq("business_id", tenant.businessId)
    .eq("role", "user")
    .gte("created_at", since);
  if ((count ?? 0) >= cap) {
    return NextResponse.json(
      { error: `You've reached today's assistant limit (${cap} messages). It resets in 24 hours.` },
      { status: 429 },
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
    await recordUsage(db, tenant.businessId, tenant.user.id, out.creditsUsed, out.toolTraces.length);

    return NextResponse.json({ conversationId, reply: out.reply, toolTraces: out.toolTraces });
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
      return NextResponse.json({
        conversationId,
        reply: "I can't make changes while the account is read-only. Confirm payment on the Billing page and I'll apply it.",
        toolTraces: out.toolTraces,
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
    await recordUsage(db, tenant.businessId, tenant.user.id, out.creditsUsed, out.toolTraces.length);

    return NextResponse.json({
      conversationId,
      toolTraces: out.toolTraces,
      pendingAction: { id: pa!.id, tool: out.pendingAction.tool, preview: out.pendingAction.preview, risk: TOOL_MAP.get(out.pendingAction.tool)?.risk },
    });
  }

  await saveTurn(db, conversationId, tenant.businessId, message, out.reply, out.model);
  await recordUsage(db, tenant.businessId, tenant.user.id, out.creditsUsed, out.toolTraces.length);

  return NextResponse.json({ conversationId, reply: out.reply, toolTraces: out.toolTraces });
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
  await db.from("assistant_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
}

async function recordUsage(
  db: ReturnType<typeof getAdminSupabase>,
  businessId: string,
  userId: string,
  credits: number,
  toolCalls: number,
) {
  if (credits <= 0 && toolCalls === 0) credits = 0;
  await db.from("usage_ledger").insert({
    business_id: businessId,
    user_id: userId,
    kind: "tool_call",
    units: Math.max(1, toolCalls),
    cost: credits,
  });
}
