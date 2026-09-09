"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";
import { getAdminSupabase } from "@/lib/supabase";
import { encrypt, decrypt } from "@/lib/auth";
import {
  newWebhookSecret,
  tgGetMe,
  tgSetWebhook,
  tgDeleteWebhook,
  tgSend,
  ownerWebhookUrl,
} from "@/lib/admin/telegram";

export interface OwnerTgBotRow {
  id: string;
  label: string;
  botUsername: string | null;
  chatId: string;
  enabled: boolean;
  lastInboundAt: string | null;
  tokenHint: string;
}

export async function listOwnerTelegramBots(): Promise<{ bots: OwnerTgBotRow[]; webhookUrl: string }> {
  const { businessId } = await requireBusiness({ allowReadOnly: true });
  const db = getAdminSupabase();
  const { data } = await db
    .from("owner_telegram_bots")
    .select("id, label, bot_username, chat_id, enabled, last_inbound_at, bot_token")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  return {
    webhookUrl: ownerWebhookUrl(),
    bots: (data ?? []).map((b) => {
      const tok = decrypt(b.bot_token as string) || "";
      return {
        id: b.id as string,
        label: b.label as string,
        botUsername: (b.bot_username as string) ?? null,
        chatId: b.chat_id as string,
        enabled: !!b.enabled,
        lastInboundAt: (b.last_inbound_at as string) ?? null,
        tokenHint: tok ? `…${tok.slice(-6)}` : "—",
      };
    }),
  };
}

export async function addOwnerTelegramBot(form: {
  label: string;
  token: string;
  chatId: string;
}): Promise<{ ok: true; username?: string } | { error: string }> {
  const { businessId, user } = await requireBusiness({ allowReadOnly: true });
  const label = form.label.trim().slice(0, 60) || "Telegram";
  const token = form.token.trim();
  const chatId = form.chatId.trim();
  if (!/^\d+:[\w-]+$/.test(token)) return { error: "That doesn't look like a bot token (from @BotFather)." };
  if (!/^-?\d+$/.test(chatId)) return { error: "Chat ID must be numeric (get it from @userinfobot)." };

  const db = getAdminSupabase();
  const { data: existing } = await db
    .from("owner_telegram_bots")
    .select("id, bot_token")
    .eq("business_id", businessId);
  for (const e of existing ?? []) {
    if (decrypt(e.bot_token as string) === token) return { error: "That bot is already connected." };
  }

  const me = await tgGetMe(token);
  if (!me.ok) return { error: me.error || "Could not verify the bot token." };

  const secret = newWebhookSecret();
  const hook = await tgSetWebhook(token, secret, ownerWebhookUrl());
  if (!hook.ok) return { error: `Telegram rejected the webhook: ${hook.error}` };

  const { error } = await db.from("owner_telegram_bots").insert({
    business_id: businessId,
    label,
    bot_token: encrypt(token),
    bot_username: me.username ?? null,
    chat_id: chatId,
    webhook_secret: secret,
    created_by: user.id,
  });
  if (error) {
    await tgDeleteWebhook(token);
    return { error: "Could not save the bot." };
  }

  await writeAudit(businessId, user.id, "assistant.telegram_connected", {
    summary: `Connected Telegram bot ${me.username ? "@" + me.username : label}`,
  });
  await tgSend(token, chatId, "✅ Connected to your Zotomic Assistant. Ask me anything about your store — try \"how were sales this week?\"");
  revalidatePath("/app/assistant");
  return { ok: true, username: me.username };
}

export async function updateOwnerTelegramBot(
  id: string,
  patch: { label?: string; chatId?: string; enabled?: boolean },
): Promise<{ ok: true } | { error: string }> {
  const { businessId } = await requireBusiness({ allowReadOnly: true });
  const db = getAdminSupabase();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.label !== undefined) row.label = patch.label.trim().slice(0, 60) || "Telegram";
  if (patch.chatId !== undefined) {
    if (!/^-?\d+$/.test(patch.chatId.trim())) return { error: "Chat ID must be numeric." };
    row.chat_id = patch.chatId.trim();
  }
  if (patch.enabled !== undefined) row.enabled = !!patch.enabled;
  const { error } = await db.from("owner_telegram_bots").update(row).eq("business_id", businessId).eq("id", id);
  if (error) return { error: "Could not save." };
  revalidatePath("/app/assistant");
  return { ok: true };
}

export async function deleteOwnerTelegramBot(id: string): Promise<{ ok: true } | { error: string }> {
  const { businessId } = await requireBusiness({ allowReadOnly: true });
  const db = getAdminSupabase();
  const { data: bot } = await db
    .from("owner_telegram_bots")
    .select("bot_token")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
  if (bot?.bot_token) {
    const tok = decrypt(bot.bot_token as string);
    if (tok) await tgDeleteWebhook(tok);
  }
  await db.from("owner_telegram_bots").delete().eq("business_id", businessId).eq("id", id);
  revalidatePath("/app/assistant");
  return { ok: true };
}

export async function testOwnerTelegramBot(id: string): Promise<{ ok: true } | { error: string }> {
  const { businessId } = await requireBusiness({ allowReadOnly: true });
  const db = getAdminSupabase();
  const { data: bot } = await db
    .from("owner_telegram_bots")
    .select("bot_token, chat_id")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
  if (!bot) return { error: "Not found." };
  const tok = decrypt(bot.bot_token as string);
  if (!tok) return { error: "Bad stored token." };
  const res = await tgSend(tok, bot.chat_id as string, "🔔 Test message from your Zotomic Assistant.");
  return res.ok ? { ok: true } : { error: res.error || "Send failed." };
}
