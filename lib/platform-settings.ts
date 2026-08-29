import { unstable_cache } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase";
import { encrypt, decrypt } from "@/lib/auth";

/** Admin-only platform configuration. Secret values are AES-encrypted at rest. */
export const PLATFORM_KEYS = {
  telegram_bot_token: { secret: true, label: "Telegram bot token" },
  meta_pixel_id: { secret: false, label: "Meta Pixel ID (zotomic.com)" },
  ga4_measurement_id: { secret: false, label: "GA4 Measurement ID (zotomic.com)" },
  ga4_api_secret: { secret: true, label: "GA4 API Secret (server-side)" },
} as const;

export type PlatformKey = keyof typeof PLATFORM_KEYS;

export async function getPlatformSetting(key: PlatformKey): Promise<string | null> {
  const db = getAdminSupabase();
  const { data } = await db.from("platform_settings").select("value").eq("key", key).maybeSingle();
  if (!data?.value) return null;
  return PLATFORM_KEYS[key].secret ? decrypt(data.value) || null : data.value;
}

export async function getPlatformSettings(): Promise<Record<string, string>> {
  const db = getAdminSupabase();
  const { data } = await db.from("platform_settings").select("key, value");
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    const k = row.key as PlatformKey;
    if (!PLATFORM_KEYS[k]) continue;
    out[k] = PLATFORM_KEYS[k].secret ? decrypt(row.value as string) || "" : (row.value as string);
  }
  return out;
}

export async function setPlatformSetting(key: PlatformKey, value: string, adminId: string) {
  const db = getAdminSupabase();
  const stored = value ? (PLATFORM_KEYS[key].secret ? encrypt(value) : value) : null;
  await db
    .from("platform_settings")
    .upsert({ key, value: stored, updated_by: adminId, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

/** Public (non-secret) platform tracking config for the marketing site. Cached 5 min. */
export const getPublicTracking = unstable_cache(
  async (): Promise<{ metaPixelId: string; ga4Id: string }> => {
    try {
      const db = getAdminSupabase();
      const { data } = await db
        .from("platform_settings")
        .select("key, value")
        .in("key", ["meta_pixel_id", "ga4_measurement_id"]);
      const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
      return { metaPixelId: map.meta_pixel_id ?? "", ga4Id: map.ga4_measurement_id ?? "" };
    } catch {
      return { metaPixelId: "", ga4Id: "" };
    }
  },
  ["public-tracking"],
  { revalidate: 300, tags: ["platform-settings"] },
);

/** Server-side GA4 event (Measurement Protocol) for the marketing site. */
export async function ga4ServerEvent(clientId: string, name: string, params: Record<string, unknown> = {}) {
  const [mid, secret] = await Promise.all([
    getPlatformSetting("ga4_measurement_id"),
    getPlatformSetting("ga4_api_secret"),
  ]);
  if (!mid || !secret) return;
  try {
    await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${mid}&api_secret=${secret}`, {
      method: "POST",
      body: JSON.stringify({
        client_id: clientId || `${Date.now()}.${Math.random().toString(36).slice(2)}`,
        events: [{ name, params }],
      }),
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    /* non-fatal */
  }
}
