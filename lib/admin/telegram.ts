/**
 * Multi-bot Telegram plumbing for the Admin Assistant. Each `admin_telegram_bots`
 * row is one BotFather bot + the admin's chat with it. Inbound updates hit
 * /api/telegram/webhook and are matched by the secret-token header.
 */
import "server-only";
import { randomBytes } from "crypto";

const API = "https://api.telegram.org/bot";

export function newWebhookSecret(): string {
  return randomBytes(24).toString("hex");
}

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://zotomic.com").replace(/\/$/, "");
}

export function adminWebhookUrl(): string {
  return `${siteBase()}/api/telegram/webhook`;
}

export function ownerWebhookUrl(): string {
  return `${siteBase()}/api/telegram/owner-webhook`;
}

export async function tgGetMe(token: string): Promise<{ ok: boolean; username?: string; error?: string }> {
  try {
    const res = await fetch(`${API}${token}/getMe`, { signal: AbortSignal.timeout(10_000) });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.description || "Invalid bot token" };
    return { ok: true, username: data.result?.username };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function tgSend(token: string, chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(12_000),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.description || "Telegram rejected the message" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function tgSetWebhook(
  token: string,
  secret: string,
  url: string = adminWebhookUrl(),
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API}${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: secret,
        allowed_updates: ["message"],
        drop_pending_updates: true,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.description || "setWebhook failed" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function tgDeleteWebhook(token: string): Promise<void> {
  try {
    await fetch(`${API}${token}/deleteWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: true }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    /* best effort */
  }
}

/** Split a long reply into Telegram-sized chunks (4096 char limit). */
export function chunkTelegram(text: string, size = 3800): string[] {
  if (text.length <= size) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf("\n", size);
    if (cut < size * 0.6) cut = size;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  if (rest) out.push(rest);
  return out;
}
