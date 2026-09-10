/**
 * One Admin-Assistant turn, shared by the web route and the Telegram webhook.
 * Handles conversation resolution, history, the confirm-before-acting flow
 * (persisted in admin_assistant_pending), running the agent, and persistence.
 */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";
import { runAdminAgent, type AdminMessage } from "@/lib/agent/admin-agent";
import { ADMIN_TOOL_MAP } from "@/lib/tools/admin-registry";
import type { MediaPart } from "@/lib/ai/media";

const HISTORY = 16;
const IDLE_RESET_MS = 6 * 60 * 60 * 1000;

const YES = /^(y|yes|yeah|yep|confirm|ok|okay|do it|go|proceed)\b/i;
const NO = /^(n|no|nope|cancel|stop|abort|nevermind|never mind)\b/i;

export interface AdminTurnResult {
  conversationId: string;
  reply: string | null;
  pendingPreview: string | null;
  /** word the admin must type to confirm a word-gated action */
  confirmWord: string | null;
}

export async function adminTurn(opts: {
  adminId: string;
  channel: "web" | "telegram";
  conversationId: string | null;
  /** required for telegram — the chat the message came from */
  telegramChatId?: string;
  message: string;
  attachments?: MediaPart[];
  approve?: boolean;
  /** typed word for word-gated confirmations (web) */
  confirmText?: string;
  cancel?: boolean;
}): Promise<AdminTurnResult> {
  const db = getAdminSupabase();
  const { adminId, channel } = opts;

  // ── resolve conversation ────────────────────────────────────────────────
  let conversationId = opts.conversationId;
  if (conversationId) {
    const { data } = await db
      .from("admin_assistant_conversations")
      .select("id, admin_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!data || data.admin_id !== adminId) conversationId = null;
  }
  if (!conversationId && channel === "telegram") {
    const { data } = await db
      .from("admin_assistant_conversations")
      .select("id, last_message_at")
      .eq("admin_id", adminId)
      .eq("channel", "telegram")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && Date.now() - new Date(data.last_message_at as string).getTime() < IDLE_RESET_MS) {
      conversationId = data.id as string;
    }
  }
  if (!conversationId) {
    const { data, error } = await db
      .from("admin_assistant_conversations")
      .insert({ admin_id: adminId, channel, title: opts.message.slice(0, 80) || "New chat" })
      .select("id")
      .single();
    if (error || !data) throw new Error("Could not start a chat.");
    conversationId = data.id as string;
  }

  const chatKey = channel === "telegram" ? `tg:${opts.telegramChatId}` : `web:${conversationId}`;

  const { data: pend } = await db
    .from("admin_assistant_pending")
    .select("tool, args, preview")
    .eq("chat_key", chatKey)
    .maybeSingle();

  const pendTool = pend ? ADMIN_TOOL_MAP.get(pend.tool as string) : undefined;
  const needWord = pendTool?.confirmWord;

  if (opts.cancel || (pend && NO.test(opts.message))) {
    if (pend) await db.from("admin_assistant_pending").delete().eq("chat_key", chatKey);
    return { conversationId, reply: "Cancelled.", pendingPreview: null, confirmWord: null };
  }

  let approve = false;
  if (pend) {
    if (needWord) {
      const typed = (opts.confirmText ?? opts.message ?? "").trim();
      approve = new RegExp(`^${needWord}$`, "i").test(typed);
      if (!approve && opts.approve && !opts.confirmText) {
        // client clicked confirm but didn't send the word
        return {
          conversationId,
          reply: `This one needs you to type ${needWord} to confirm.`,
          pendingPreview: pend.preview as string,
          confirmWord: needWord,
        };
      }
    } else {
      approve = opts.approve === true || YES.test(opts.message);
    }
  } else if (opts.approve) {
    return { conversationId, reply: "There's nothing waiting for confirmation.", pendingPreview: null, confirmWord: null };
  }

  const { data: histRows } = await db
    .from("admin_assistant_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(HISTORY * 2);
  const history: AdminMessage[] = (histRows ?? []).map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content as string,
  }));

  let approved: { tool: string; args: Record<string, unknown> } | undefined;
  if (approve) {
    if (!pend) return { conversationId, reply: "There's nothing waiting for confirmation.", pendingPreview: null, confirmWord: null };
    approved = { tool: pend.tool as string, args: (pend.args as Record<string, unknown>) ?? {} };
    await db.from("admin_assistant_pending").delete().eq("chat_key", chatKey);
  }

  const outcome = await runAdminAgent(adminId, history, approve ? "Confirmed. Proceed." : opts.message, {
    approved,
    attachments: approve ? undefined : opts.attachments,
  });

  const rows: { conversation_id: string; admin_id: string; role: string; content: string; tool_calls: unknown }[] = [];
  if (!approve && opts.message)
    rows.push({ conversation_id: conversationId, admin_id: adminId, role: "user", content: opts.message, tool_calls: [] });

  if (outcome.pendingAction) {
    await db.from("admin_assistant_pending").upsert(
      {
        chat_key: chatKey,
        admin_id: adminId,
        tool: outcome.pendingAction.tool,
        args: outcome.pendingAction.args,
        preview: outcome.pendingAction.preview,
      },
      { onConflict: "chat_key" },
    );
    if (rows.length) await db.from("admin_assistant_messages").insert(rows);
    await touch(conversationId);
    return {
      conversationId,
      reply: null,
      pendingPreview: outcome.pendingAction.preview,
      confirmWord: outcome.pendingAction.confirmWord ?? null,
    };
  }

  rows.push({
    conversation_id: conversationId,
    admin_id: adminId,
    role: "assistant",
    content: outcome.reply,
    tool_calls: outcome.toolTraces,
  });
  await db.from("admin_assistant_messages").insert(rows);
  await touch(conversationId);
  return { conversationId, reply: outcome.reply, pendingPreview: null, confirmWord: null };
}

async function touch(id: string) {
  await getAdminSupabase()
    .from("admin_assistant_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", id);
}
