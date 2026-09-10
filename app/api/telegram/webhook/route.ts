import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { decrypt } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { adminAgentConfigured } from "@/lib/agent/admin-agent";
import { adminTurn } from "@/lib/agent/admin-turn";
import { tgSend, chunkTelegram, tgGetFileBytes } from "@/lib/admin/telegram";
import { mediaKind, normalizeMime, type MediaPart } from "@/lib/ai/media";
import { mimeForPath } from "@/lib/ai/workspace";

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
  const msg = update.message as
    | {
        chat?: { id?: number };
        text?: string;
        caption?: string;
        photo?: { file_id: string; file_size?: number }[];
        voice?: { file_id: string; mime_type?: string; file_size?: number };
        audio?: { file_id: string; mime_type?: string; file_size?: number };
        video?: { file_id: string; mime_type?: string; file_size?: number };
        document?: { file_id: string; mime_type?: string; file_name?: string; file_size?: number };
      }
    | undefined;
  const chatId = msg?.chat?.id != null ? String(msg.chat.id) : "";
  if (!chatId || chatId !== bot.chat_id) return ok();

  const token = decrypt(bot.bot_token as string);
  if (!token) return ok();

  // ── media attachment (photo / voice / video / audio / document) ──────────
  const attachments: MediaPart[] = [];
  const mediaRef =
    msg?.voice ||
    msg?.audio ||
    msg?.video ||
    (msg?.photo?.length ? msg.photo[msg.photo.length - 1] : undefined) ||
    (msg?.document && mediaKind(normalizeMime(msg.document.mime_type || mimeForPath(msg.document.file_name || ""))) ? msg.document : undefined);
  if (mediaRef) {
    const ref = mediaRef as { file_id: string; mime_type?: string; file_name?: string };
    const dl = await tgGetFileBytes(token, ref.file_id);
    if (!dl.ok) {
      await tgSend(token, chatId, dl.error);
      return ok();
    }
    const declared =
      ref.mime_type ||
      (ref.file_name ? mimeForPath(ref.file_name) : "") ||
      dl.mimeType;
    const mimeType = normalizeMime(String(declared));
    if (!mediaKind(mimeType)) {
      await tgSend(token, chatId, "I can only understand images, voice notes and short videos.");
      return ok();
    }
    attachments.push({ mimeType, dataBase64: dl.base64, name: dl.name });
  }

  const text = (msg?.text || msg?.caption || "").trim() || (attachments.length ? "Have a look at this." : "");
  if (!text && !attachments.length) return ok();

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
      attachments: attachments.length ? attachments : undefined,
    });
    const confirmHint = res.confirmWord
      ? `Reply <b>${escapeHtml(res.confirmWord)}</b> to run it, or <b>NO</b> to cancel.`
      : `Reply <b>YES</b> to run it, or <b>NO</b> to cancel.`;
    const out = res.pendingPreview
      ? `⚠️ Confirm this action:\n<code>${escapeHtml(res.pendingPreview)}</code>\n\n${confirmHint}`
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
