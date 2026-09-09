import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { decrypt } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { runHermesTurn } from "@/lib/agent/hermes-turn";
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
    .from("owner_telegram_bots")
    .select("id, business_id, bot_token, chat_id, enabled")
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
  if (chatId !== bot.chat_id) return ok();

  const token = decrypt(bot.bot_token as string);
  if (!token) return ok();

  const rl = rateLimit(`tg-owner:${chatId}`, 10, 60_000);
  if (!rl.ok) {
    await tgSend(token, chatId, "Slow down a moment.");
    return ok();
  }

  // the owner who linked this bot (for audit + usage attribution)
  const { data: member } = await db
    .from("business_members")
    .select("user_id")
    .eq("business_id", bot.business_id)
    .eq("role", "owner")
    .maybeSingle();
  const userId = (member?.user_id as string) ?? null;
  if (!userId) {
    await tgSend(token, chatId, "This store has no owner on file — contact Zotomic support.");
    return ok();
  }

  await db.from("owner_telegram_bots").update({ last_inbound_at: new Date().toISOString() }).eq("id", bot.id);

  try {
    const res = await runHermesTurn({ businessId: bot.business_id as string, userId, message: text });
    for (const part of chunkTelegram(res.reply || "…")) await tgSend(token, chatId, part);
  } catch (e) {
    await tgSend(token, chatId, `Something went wrong: ${(e as Error).message}`);
  }
  return ok();
}
