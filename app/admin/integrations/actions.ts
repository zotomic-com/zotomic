"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-server";
import { getAdminSupabase } from "@/lib/supabase";
import { setPlatformSetting, PLATFORM_KEYS, PLATFORM_KEY_GROUPS } from "@/lib/platform-settings";

const MASK = "••••••••";

export async function saveAutomationSettings(form: FormData) {
  const admin = await requireAdmin();

  for (const key of PLATFORM_KEY_GROUPS.integrations) {
    const raw = form.get(key);
    if (raw === null) continue;
    const value = String(raw).trim();
    if (PLATFORM_KEYS[key].secret && value === MASK) continue; // keep stored secret
    await setPlatformSetting(key, value, admin.id);
  }

  await getAdminSupabase().from("audit_logs").insert({
    actor_id: admin.id,
    actor_type: "admin",
    action: "platform.integrations_updated",
    summary: "Automation / gateway credentials updated",
  });

  revalidatePath("/admin/integrations");
  return { ok: true };
}
