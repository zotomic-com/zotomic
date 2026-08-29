import { getPlatformSetting } from "@/lib/platform-settings";

/** Send a message via the platform Telegram bot (token set by admin). */
export async function sendTelegram(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const token = await getPlatformSetting("telegram_bot_token");
  if (!token) return { ok: false, error: "Telegram bot is not configured by the platform admin." };
  if (!chatId) return { ok: false, error: "No Telegram chat ID set. Add it in Settings." };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(12000),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.description || "Telegram rejected the message" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Verify a bot token + return the bot's @username. */
export async function verifyBot(token: string): Promise<{ ok: boolean; username?: string; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.description || "Invalid token" };
    return { ok: true, username: data.result?.username };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
