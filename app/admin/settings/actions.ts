"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-server";
import { getAdminSupabase } from "@/lib/supabase";
import { setPlatformSetting, PLATFORM_KEYS, type PlatformKey } from "@/lib/platform-settings";
import { verifyBot } from "@/lib/telegram";

export async function savePlatformSettings(form: FormData) {
  const admin = await requireAdmin();
  const results: Record<string, string> = {};

  for (const key of Object.keys(PLATFORM_KEYS) as PlatformKey[]) {
    const raw = form.get(key);
    if (raw === null) continue;
    const value = String(raw).trim();
    // don't overwrite a stored secret with the masked placeholder
    if (PLATFORM_KEYS[key].secret && value === "••••••••") continue;
    await setPlatformSetting(key, value, admin.id);
    if (key === "telegram_bot_token" && value) {
      const check = await verifyBot(value);
      results.telegram = check.ok ? `Bot @${check.username} connected` : `Telegram: ${check.error}`;
    }
  }

  await getAdminSupabase().from("audit_logs").insert({
    actor_id: admin.id,
    actor_type: "admin",
    action: "platform.settings_updated",
    summary: "Platform settings updated",
  });

  revalidatePath("/admin/settings");
  return { ok: true, note: results.telegram };
}
