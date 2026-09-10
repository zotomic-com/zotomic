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

/** Download a file the user sent to the bot. Returns base64 + mime, or an error. */
export async function tgGetFileBytes(
  token: string,
  fileId: string,
  maxBytes = 15 * 1024 * 1024,
): Promise<{ ok: true; base64: string; mimeType: string; name: string } | { ok: false; error: string }> {
  try {
    const meta = await fetch(`${API}${token}/getFile?file_id=${encodeURIComponent(fileId)}`, {
      signal: AbortSignal.timeout(10_000),
    }).then((r) => r.json());
    if (!meta.ok || !meta.result?.file_path) return { ok: false, error: meta.description || "Telegram wouldn't return the file." };
    const path = meta.result.file_path as string;
    if (meta.result.file_size && meta.result.file_size > maxBytes) {
      return { ok: false, error: `That file is ${(meta.result.file_size / 1024 / 1024).toFixed(1)} MB — over the ${Math.round(maxBytes / 1024 / 1024)} MB limit.` };
    }
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${path}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return { ok: false, error: `Download failed (${res.status}).` };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) return { ok: false, error: "File is too large." };
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const extMime: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
      oga: "audio/ogg", ogg: "audio/ogg", opus: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav",
      mp4: "video/mp4", mov: "video/mov", webm: "video/webm",
    };
    return {
      ok: true,
      base64: buf.toString("base64"),
      mimeType: extMime[ext] ?? "application/octet-stream",
      name: path.split("/").pop() ?? "file",
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
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
