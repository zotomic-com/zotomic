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
import { getAssistantCaps, CAP_LABEL, type AssistantCaps } from "@/lib/ai/assistant-powers";
import type { AdminCapability } from "@/lib/tools/admin-registry";
import { CONNECTOR_META, CONNECTOR_PROVIDERS, type ConnectorProvider } from "@/lib/ai/connectors";
import { createHash, randomBytes } from "crypto";

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

/* ────────────────────  assistant powers (media / files / dev-ops)  ──────── */

const CAP_COL: Record<AdminCapability, string> = {
  media: "cap_media",
  files: "cap_files",
  git: "cap_git",
  git_merge: "cap_git_merge",
  sql: "cap_sql",
  deploy: "cap_deploy",
};

export interface AssistantAction {
  kind: string;
  summary: string;
  outcome: string;
  at: string;
}

export async function getAssistantPowers(): Promise<{
  caps: AssistantCaps;
  labels: Record<string, string>;
  recent: AssistantAction[];
  envReady: { git: boolean; sql: boolean; deploy: boolean };
}> {
  await requireAdmin();
  const db = getAdminSupabase();
  const caps = await getAssistantCaps();
  const { data: rows } = await db
    .from("admin_assistant_actions")
    .select("kind, summary, outcome, created_at")
    .order("created_at", { ascending: false })
    .limit(15);
  return {
    caps,
    labels: CAP_LABEL,
    recent: (rows ?? []).map((r) => ({
      kind: r.kind as string,
      summary: r.summary as string,
      outcome: (r.outcome as string) ?? "ok",
      at: r.created_at as string,
    })),
    envReady: {
      git: !!process.env.GITHUB_TOKEN,
      sql: !!(process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL),
      deploy: !!(process.env.VERCEL_DEPLOY_TOKEN || process.env.VERCEL_API_TOKEN) && !!process.env.VERCEL_PROJECT_ID,
    },
  };
}

export async function setAssistantCap(
  cap: AdminCapability,
  on: boolean,
): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const col = CAP_COL[cap];
  if (!col) return { error: "Unknown capability." };
  const patch: Record<string, unknown> = { [col]: !!on, updated_at: new Date().toISOString(), updated_by: admin.id };
  // enabling merge/git implies git; disabling git disables merge
  if (cap === "git_merge" && on) patch.cap_git = true;
  if (cap === "git" && !on) patch.cap_git_merge = false;
  const { error } = await getAdminSupabase().from("admin_assistant_settings").update(patch).eq("id", 1);
  if (error) return { error: "Could not save." };
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

/* ────────────────────────────  connectors  ─────────────────────────────── */

export interface ConnectorRow {
  id: string;
  provider: ConnectorProvider;
  providerName: string;
  label: string | null;
  enabled: boolean;
  status: string | null;
  meta: Record<string, unknown> | null;
  tokenHint: string;
  lastUsedAt: string | null;
}

export interface ConnectorProviderInfo {
  id: ConnectorProvider;
  name: string;
  tokenLabel: string;
  setup: string;
  configFields: { key: string; label: string }[];
  oauth: boolean;
  connected: boolean;
}

export async function listConnectors(): Promise<{ connectors: ConnectorRow[]; providers: ConnectorProviderInfo[] }> {
  await requireAdmin();
  const db = getAdminSupabase();
  const { data } = await db
    .from("admin_connectors")
    .select("id, provider, label, secret, config, meta, enabled, status, last_used_at")
    .order("created_at", { ascending: true });
  const rows: ConnectorRow[] = (data ?? []).map((r) => {
    const tok = decrypt((r.secret as string) ?? "") || "";
    return {
      id: r.id as string,
      provider: r.provider as ConnectorProvider,
      providerName: CONNECTOR_META[r.provider as ConnectorProvider]?.name ?? (r.provider as string),
      label: (r.label as string) ?? null,
      enabled: !!r.enabled,
      status: (r.status as string) ?? null,
      meta: (r.meta as Record<string, unknown>) ?? null,
      tokenHint: tok ? `…${tok.slice(-4)}` : "—",
      lastUsedAt: (r.last_used_at as string) ?? null,
    };
  });
  const have = new Set(rows.filter((r) => r.enabled).map((r) => r.provider));
  return {
    connectors: rows,
    providers: CONNECTOR_PROVIDERS.map((p) => ({
      id: p,
      name: CONNECTOR_META[p].name,
      tokenLabel: CONNECTOR_META[p].tokenLabel,
      setup: CONNECTOR_META[p].setup,
      configFields: CONNECTOR_META[p].configFields,
      oauth: !!CONNECTOR_META[p].oauth,
      connected: have.has(p),
    })),
  };
}

export async function addConnector(form: {
  provider: string;
  label?: string;
  token: string;
  config?: Record<string, string>;
}): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const provider = form.provider as ConnectorProvider;
  if (!CONNECTOR_PROVIDERS.includes(provider)) return { error: "Pick a provider." };
  if (provider === "google") return { error: "Google needs an OAuth client set up first — coming soon." };
  const token = form.token.trim();
  if (token.length < 8) return { error: "That token looks too short." };
  const config = form.config ?? {};
  for (const f of CONNECTOR_META[provider].configFields) {
    if (!config[f.key]?.trim()) return { error: `${f.label} is required.` };
  }

  let meta: Record<string, unknown> = {};
  try {
    if (provider === "slack") {
      const { slackVerify } = await import("@/lib/ai/connectors");
      meta = await slackVerify(token);
    } else if (provider === "notion") {
      const { notionVerify } = await import("@/lib/ai/connectors");
      meta = await notionVerify(token);
    } else if (provider === "sentry") {
      const { sentryVerify } = await import("@/lib/ai/connectors");
      await sentryVerify(token, config.org, config.project);
      meta = { org: config.org, project: config.project };
    }
  } catch (e) {
    return { error: `Couldn't verify: ${(e as Error).message}` };
  }

  const { error } = await getAdminSupabase().from("admin_connectors").insert({
    provider,
    label: form.label?.trim().slice(0, 60) || CONNECTOR_META[provider].name,
    secret: encrypt(token),
    config,
    meta,
    status: "ok",
    created_by: admin.id,
  });
  if (error) return { error: error.message.includes("duplicate") ? "A connector with that label already exists." : "Could not save." };
  revalidatePath("/admin/assistants");
  return { ok: true };
}

export async function updateConnector(
  id: string,
  patch: { enabled?: boolean; label?: string },
): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  const row: Record<string, unknown> = {};
  if (patch.enabled !== undefined) row.enabled = !!patch.enabled;
  if (patch.label !== undefined) row.label = patch.label.trim().slice(0, 60) || null;
  if (!Object.keys(row).length) return { ok: true };
  const { error } = await getAdminSupabase().from("admin_connectors").update(row).eq("id", id);
  if (error) return { error: "Could not save." };
  revalidatePath("/admin/assistants");
  return { ok: true };
}

export async function deleteConnector(id: string): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  await getAdminSupabase().from("admin_connectors").delete().eq("id", id);
  revalidatePath("/admin/assistants");
  return { ok: true };
}

export async function testConnector(id: string): Promise<{ ok: true; detail: string } | { error: string }> {
  await requireAdmin();
  const db = getAdminSupabase();
  const { data: row } = await db.from("admin_connectors").select("provider, secret, config").eq("id", id).maybeSingle();
  if (!row) return { error: "Not found." };
  const token = decrypt((row.secret as string) ?? "");
  if (!token) return { error: "Stored token unreadable." };
  const cfg = (row.config as Record<string, string>) ?? {};
  try {
    if (row.provider === "slack") {
      const { slackVerify } = await import("@/lib/ai/connectors");
      const m = await slackVerify(token);
      await db.from("admin_connectors").update({ status: "ok" }).eq("id", id);
      revalidatePath("/admin/assistants");
      return { ok: true, detail: `Slack: ${m.team ?? "connected"}` };
    }
    if (row.provider === "notion") {
      const { notionVerify } = await import("@/lib/ai/connectors");
      await notionVerify(token);
      await db.from("admin_connectors").update({ status: "ok" }).eq("id", id);
      revalidatePath("/admin/assistants");
      return { ok: true, detail: "Notion: connected" };
    }
    if (row.provider === "sentry") {
      const { sentryVerify } = await import("@/lib/ai/connectors");
      await sentryVerify(token, cfg.org, cfg.project);
      await db.from("admin_connectors").update({ status: "ok" }).eq("id", id);
      revalidatePath("/admin/assistants");
      return { ok: true, detail: `Sentry: ${cfg.org}/${cfg.project}` };
    }
    return { error: "Unsupported provider." };
  } catch (e) {
    await db.from("admin_connectors").update({ status: `error: ${(e as Error).message}`.slice(0, 200) }).eq("id", id);
    revalidatePath("/admin/assistants");
    return { error: (e as Error).message };
  }
}

/* ─────────────────────────────  skills  ───────────────────────────── */

export interface SkillRow {
  id: string;
  slug: string;
  name: string;
  triggers: string[];
  instructions: string;
  builtin: boolean;
  enabled: boolean;
}

export async function listSkillsAction(): Promise<SkillRow[]> {
  await requireAdmin();
  const { listSkills } = await import("@/lib/ai/skills");
  return listSkills();
}

export async function saveSkill(input: {
  id?: string;
  name: string;
  triggers: string;
  instructions: string;
}): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const name = input.name.trim().slice(0, 80);
  const instructions = input.instructions.trim().slice(0, 8000);
  const triggers = input.triggers
    .split(/[\n,]/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3)
    .slice(0, 12);
  if (name.length < 2) return { error: "Give the skill a name." };
  if (instructions.length < 10) return { error: "The instructions are too short." };
  if (!triggers.length) return { error: "Add at least one trigger phrase." };

  const db = getAdminSupabase();
  if (input.id) {
    const { error } = await db.from("admin_assistant_skills").update({ name, triggers, instructions }).eq("id", input.id);
    if (error) return { error: "Could not save." };
  } else {
    const slug =
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || `skill-${Date.now().toString(36)}`;
    const { error } = await db
      .from("admin_assistant_skills")
      .insert({ slug, name, triggers, instructions, builtin: false, created_by: admin.id });
    if (error) return { error: error.message.includes("duplicate") ? "A skill with that name exists." : "Could not save." };
  }
  revalidatePath("/admin/assistants");
  return { ok: true };
}

export async function toggleSkill(id: string, enabled: boolean): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  const { error } = await getAdminSupabase().from("admin_assistant_skills").update({ enabled: !!enabled }).eq("id", id);
  if (error) return { error: "Could not save." };
  revalidatePath("/admin/assistants");
  return { ok: true };
}

export async function deleteSkill(id: string): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  const db = getAdminSupabase();
  const { data } = await db.from("admin_assistant_skills").select("builtin").eq("id", id).maybeSingle();
  if (data?.builtin) return { error: "Built-in skills can be disabled but not deleted." };
  await db.from("admin_assistant_skills").delete().eq("id", id);
  revalidatePath("/admin/assistants");
  return { ok: true };
}

/* ───────────────────────  Zotomic as an MCP server  ───────────────────── */

export interface McpTokenRow {
  id: string;
  label: string;
  scopes: string[];
  enabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export async function listMcpTokens(): Promise<{ tokens: McpTokenRow[]; url: string }> {
  await requireAdmin();
  const { data } = await getAdminSupabase()
    .from("admin_mcp_tokens")
    .select("id, label, scopes, enabled, last_used_at, created_at")
    .order("created_at", { ascending: true });
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://zotomic.com").replace(/\/$/, "");
  return {
    url: `${base}/api/mcp`,
    tokens: (data ?? []).map((r) => ({
      id: r.id as string,
      label: r.label as string,
      scopes: (r.scopes as string[]) ?? [],
      enabled: !!r.enabled,
      lastUsedAt: (r.last_used_at as string) ?? null,
      createdAt: r.created_at as string,
    })),
  };
}

export async function createMcpToken(input: {
  label: string;
  allowWrites: boolean;
}): Promise<{ ok: true; token: string } | { error: string }> {
  const admin = await requireAdmin();
  const label = input.label.trim().slice(0, 60) || "MCP client";
  const token = `ztm_${randomBytes(24).toString("base64url")}`;
  const hash = createHash("sha256").update(token).digest("hex");
  const scopes = input.allowWrites ? ["read", "write"] : ["read"];
  const { error } = await getAdminSupabase()
    .from("admin_mcp_tokens")
    .insert({ label, token_hash: hash, scopes, created_by: admin.id });
  if (error) return { error: "Could not create the token." };
  revalidatePath("/admin/assistants");
  return { ok: true, token };
}

export async function deleteMcpToken(id: string): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  await getAdminSupabase().from("admin_mcp_tokens").delete().eq("id", id);
  revalidatePath("/admin/assistants");
  return { ok: true };
}
