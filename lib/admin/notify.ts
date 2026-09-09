/** Push a short alert to every enabled Admin-Assistant Telegram bot. Best-effort. */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";
import { decrypt } from "@/lib/auth";
import { tgSend, chunkTelegram } from "@/lib/admin/telegram";

export async function pushAdminAlert(text: string): Promise<void> {
  try {
    const db = getAdminSupabase();
    const { data: bots } = await db
      .from("admin_telegram_bots")
      .select("bot_token, chat_id")
      .eq("enabled", true);
    for (const b of bots ?? []) {
      const token = decrypt(b.bot_token as string);
      if (!token) continue;
      for (const part of chunkTelegram(text)) await tgSend(token, b.chat_id as string, part);
    }
  } catch (e) {
    console.error("pushAdminAlert failed", (e as Error).message);
  }
}
