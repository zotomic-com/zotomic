"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-server";
import { getAdminSupabase } from "@/lib/supabase";
import { encrypt, decrypt } from "@/lib/auth";
import { newWebhookSecret, tgGetMe, tgSetWebhook, tgDeleteWebhook, tgSend, adminWebhookUrl } from "@/lib/admin/telegram";
import {
  PROVIDER_META,
  SEARCH_PROVIDERS,
  utcMonth,
  type SearchProvider,
} from "@/lib/ai/search-keys";

export interface TgBotRow {
  id: string;
  label: string;
  botUsername: string | null;
  chatId: string;
  enabled: boolean;
  lastInboundAt: string | null;
  tokenHint: string;
}

export async function listTelegramBots(): Promise<{ bots: TgBotRow[]; webhookUrl: string }> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const { data } = await db
    .from("admin_telegram_bots")
    .select("id, label, bot_username, chat_id, enabled, last_inbound_at, bot_token")
    .eq("admin_id", admin.id)
    .order("created_at", { ascending: true });
  return {
    webhookUrl: adminWebhookUrl(),
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

export async function addTelegramBot(form: {
  label: string;
  token: string;
  chatId: string;
}): Promise<{ ok: true; username?: string } | { error: string }> {
  const admin = await requireAdmin();
  const label = form.label.trim().slice(0, 60) || "Telegram";
  const token = form.token.trim();
  const chatId = form.chatId.trim();
  if (!/^\d+:[\w-]+$/.test(token)) return { error: "That doesn't look like a bot token (from @BotFather)." };
  if (!/^-?\d+$/.test(chatId)) return { error: "Chat ID must be numeric (get it from @userinfobot)." };

  const db = getAdminSupabase();
  const { data: existing } = await db.from("admin_telegram_bots").select("id, bot_token").eq("admin_id", admin.id);
  for (const e of existing ?? []) {
    if (decrypt(e.bot_token as string) === token) return { error: "That bot is already connected." };
  }

  const me = await tgGetMe(token);
  if (!me.ok) return { error: me.error || "Could not verify the bot token." };

  const secret = newWebhookSecret();
  const hook = await tgSetWebhook(token, secret);
  if (!hook.ok) return { error: `Telegram rejected the webhook: ${hook.error}` };

  const { error } = await db.from("admin_telegram_bots").insert({
    admin_id: admin.id,
    label,
    bot_token: encrypt(token),
    bot_username: me.username ?? null,
    chat_id: chatId,
    webhook_secret: secret,
  });
  if (error) {
    await tgDeleteWebhook(token);
    return { error: "Could not save the bot." };
  }

  await tgSend(token, chatId, "✅ Connected to Zotomic. Send me a message any time — try \"what needs attention?\"");
  revalidatePath("/admin/assistants");
  return { ok: true, username: me.username };
}

export async function updateTelegramBot(
  id: string,
  patch: { label?: string; chatId?: string; enabled?: boolean },
): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.label !== undefined) row.label = patch.label.trim().slice(0, 60) || "Telegram";
  if (patch.chatId !== undefined) {
    if (!/^-?\d+$/.test(patch.chatId.trim())) return { error: "Chat ID must be numeric." };
    row.chat_id = patch.chatId.trim();
  }
  if (patch.enabled !== undefined) row.enabled = !!patch.enabled;
  const { error } = await db.from("admin_telegram_bots").update(row).eq("admin_id", admin.id).eq("id", id);
  if (error) return { error: "Could not save." };
  revalidatePath("/admin/assistants");
  return { ok: true };
}

export async function deleteTelegramBot(id: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const { data: bot } = await db
    .from("admin_telegram_bots")
    .select("bot_token")
    .eq("admin_id", admin.id)
    .eq("id", id)
    .maybeSingle();
  if (bot?.bot_token) {
    const tok = decrypt(bot.bot_token as string);
    if (tok) await tgDeleteWebhook(tok);
  }
  await db.from("admin_telegram_bots").delete().eq("admin_id", admin.id).eq("id", id);
  revalidatePath("/admin/assistants");
  return { ok: true };
}

export async function testTelegramBot(id: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const { data: bot } = await db
    .from("admin_telegram_bots")
    .select("bot_token, chat_id")
    .eq("admin_id", admin.id)
    .eq("id", id)
    .maybeSingle();
  if (!bot) return { error: "Not found." };
  const tok = decrypt(bot.bot_token as string);
  if (!tok) return { error: "Bad stored token." };
  const res = await tgSend(tok, bot.chat_id as string, "🔔 Test message from Zotomic.");
  return res.ok ? { ok: true } : { error: res.error || "Send failed." };
}

/* ─────────────────────────  web-search API keys  ───────────────────────── */

export interface SearchProviderInfo {
  id: SearchProvider;
  name: string;
  monthlyLimit: number;
  signup: string;
  hint: string;
  keyHint: string;
}

export interface SearchKeyRow {
  id: string;
  provider: SearchProvider;
  providerName: string;
  label: string | null;
  keyHint: string;
  enabled: boolean;
  monthlyLimit: number | null;
  usageCount: number; // this UTC month
  providerLeft: number | null;
  lastStatus: string | null;
  lastUsedAt: string | null;
}

export async function listSearchKeys(): Promise<{ keys: SearchKeyRow[]; providers: SearchProviderInfo[] }> {
  await requireAdmin();
  const db = getAdminSupabase();
  const { data } = await db
    .from("search_api_keys")
    .select("id, provider, label, api_key, enabled, monthly_limit, usage_month, usage_count, provider_left, last_status, last_used_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const month = utcMonth();
  return {
    providers: SEARCH_PROVIDERS.map((p) => ({ id: p, ...PROVIDER_META[p] })),
    keys: (data ?? []).map((r) => {
      const tok = decrypt(r.api_key as string) || "";
      const provider = r.provider as SearchProvider;
      return {
        id: r.id as string,
        provider,
        providerName: PROVIDER_META[provider]?.name ?? provider,
        label: (r.label as string) ?? null,
        keyHint: tok ? `…${tok.slice(-4)}` : "—",
        enabled: !!r.enabled,
        monthlyLimit: (r.monthly_limit as number) ?? PROVIDER_META[provider]?.monthlyLimit ?? null,
        usageCount: r.usage_month === month ? Number(r.usage_count ?? 0) : 0,
        providerLeft: (r.provider_left as number) ?? null,
        lastStatus: (r.last_status as string) ?? null,
        lastUsedAt: (r.last_used_at as string) ?? null,
      };
    }),
  };
}

export async function addSearchKey(form: {
  provider: string;
  apiKey: string;
  label?: string;
}): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const provider = form.provider as SearchProvider;
  if (!SEARCH_PROVIDERS.includes(provider)) return { error: "Pick a provider." };
  const key = form.apiKey.trim();
  if (key.length < 8) return { error: "That API key looks too short." };

  const db = getAdminSupabase();
  const { data: existing } = await db.from("search_api_keys").select("id, api_key, sort_order");
  for (const e of existing ?? []) {
    if (decrypt(e.api_key as string) === key) return { error: "That key is already saved." };
  }
  const nextOrder = (existing ?? []).reduce((m, r) => Math.max(m, Number(r.sort_order ?? 0)), -1) + 1;

  const { error } = await db.from("search_api_keys").insert({
    provider,
    label: form.label?.trim().slice(0, 60) || null,
    api_key: encrypt(key),
    sort_order: nextOrder,
    monthly_limit: PROVIDER_META[provider].monthlyLimit,
    created_by: admin.id,
  });
  if (error) return { error: "Could not save the key." };
  revalidatePath("/admin/assistants");
  return { ok: true };
}

export async function updateSearchKey(
  id: string,
  patch: { label?: string; enabled?: boolean; monthlyLimit?: number },
): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  const db = getAdminSupabase();
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) row.label = patch.label.trim().slice(0, 60) || null;
  if (patch.enabled !== undefined) row.enabled = !!patch.enabled;
  if (patch.monthlyLimit !== undefined) {
    const n = Math.round(Number(patch.monthlyLimit));
    row.monthly_limit = Number.isFinite(n) && n > 0 ? n : null;
  }
  if (!Object.keys(row).length) return { ok: true };
  const { error } = await db.from("search_api_keys").update(row).eq("id", id);
  if (error) return { error: "Could not save." };
  revalidatePath("/admin/assistants");
  return { ok: true };
}

export async function deleteSearchKey(id: string): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  await getAdminSupabase().from("search_api_keys").delete().eq("id", id);
  revalidatePath("/admin/assistants");
  return { ok: true };
}

/** Move a key up/down in the fallback order (swap sort_order with its neighbour). */
export async function reorderSearchKey(id: string, dir: "up" | "down"): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  const db = getAdminSupabase();
  const { data: rows } = await db
    .from("search_api_keys")
    .select("id, sort_order")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const list = rows ?? [];
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return { error: "Not found." };
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return { ok: true };
  const a = list[idx];
  const b = list[swapIdx];
  // rewrite the whole column to 0..n so ties can't stick
  const ordered = [...list];
  ordered[idx] = b;
  ordered[swapIdx] = a;
  for (let i = 0; i < ordered.length; i++) {
    await db.from("search_api_keys").update({ sort_order: i }).eq("id", ordered[i].id as string);
  }
  revalidatePath("/admin/assistants");
  return { ok: true };
}

export async function testSearchKey(id: string): Promise<{ ok: true; count: number } | { error: string }> {
  await requireAdmin();
  const db = getAdminSupabase();
  const { data: row } = await db.from("search_api_keys").select("provider, api_key").eq("id", id).maybeSingle();
  if (!row) return { error: "Not found." };
  const key = decrypt(row.api_key as string);
  if (!key) return { error: "Stored key could not be read." };
  const { probeSearchProvider } = await import("@/lib/ai/web-search");
  const res = await probeSearchProvider(row.provider as SearchProvider, key);
  await (await import("@/lib/ai/search-keys")).recordSearchKeyUse(id, res.ok, { error: res.error });
  revalidatePath("/admin/assistants");
  return res.ok ? { ok: true, count: res.count } : { error: res.error || "No results — the key may be invalid or out of quota." };
}
