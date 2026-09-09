import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { decrypt } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { adminAgentConfigured } from "@/lib/agent/admin-agent";
import { adminTurn } from "@/lib/agent/admin-turn";
import { tgSend, chunkTelegram } from "@/lib/admin/telegram";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const ok = () => NextResponse.json({ ok: true });

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secret) return ok();

  const db = getAdminSupabase();
  const { data: bot } = await db
    .from("admin_telegram_bots")
    .select("id, admin_id, bot_token, chat_id, enabled")
    .eq("webhook_secret", secret)
    .maybeSingle();
  if (!bot || !bot.enabled) return ok();

  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return ok();
  }
  const msg = update.message as { chat?: { id?: number }; text?: string } | undefined;
  const text = msg?.text?.trim();
  const chatId = msg?.chat?.id != null ? String(msg.chat.id) : "";
  if (!text || !chatId) return ok();

  // only the linked admin chat
  if (chatId !== bot.chat_id) return ok();

  const token = decrypt(bot.bot_token as string);
  if (!token) return ok();

  const rl = rateLimit(`tg-admin:${chatId}`, 12, 60_000);
  if (!rl.ok) {
    await tgSend(token, chatId, "Slow down a moment.");
    return ok();
  }

  if (!adminAgentConfigured()) {
    await tgSend(token, chatId, "The assistant is not configured right now.");
    return ok();
  }

  await db.from("admin_telegram_bots").update({ last_inbound_at: new Date().toISOString() }).eq("id", bot.id);

  try {
    const res = await adminTurn({
      adminId: bot.admin_id as string,
      channel: "telegram",
      conversationId: null,
      telegramChatId: chatId,
      message: text,
    });
    const out = res.pendingPreview
      ? `⚠️ Confirm this action:\n<code>${escapeHtml(res.pendingPreview)}</code>\n\nReply <b>YES</b> to run it, or <b>NO</b> to cancel.`
      : res.reply ?? "…";
    for (const part of chunkTelegram(out)) await tgSend(token, chatId, part);
  } catch (e) {
    await tgSend(token, chatId, `Something went wrong: ${(e as Error).message}`);
  }
  return ok();
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
