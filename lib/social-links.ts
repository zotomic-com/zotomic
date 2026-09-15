import { unstable_cache, revalidateTag } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase";

export type SocialPlatform = "facebook" | "instagram" | "x" | "linkedin" | "youtube" | "whatsapp" | "tiktok" | "other";

export interface SocialLink {
  id: string;
  platform: SocialPlatform;
  url: string;
  sortOrder: number;
}

function rowToLink(r: Record<string, unknown>): SocialLink {
  return {
    id: r.id as string,
    platform: r.platform as SocialPlatform,
    url: r.url as string,
    sortOrder: r.sort_order as number,
  };
}

/** Every social link, in order — shown in the public footer. Cached. */
export const getSocialLinks = unstable_cache(
  async (): Promise<SocialLink[]> => {
    const db = getAdminSupabase();
    const { data } = await db.from("platform_social_links").select("*").order("sort_order");
    return (data ?? []).map(rowToLink);
  },
  ["social-links"],
  { revalidate: 300, tags: ["social-links"] },
);

export interface SocialLinkInput {
  platform: SocialPlatform;
  url: string;
}

export async function createSocialLink(input: SocialLinkInput) {
  const db = getAdminSupabase();
  const { data: existing } = await db
    .from("platform_social_links")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((existing?.sort_order as number) ?? -1) + 1;
  await db.from("platform_social_links").insert({
    platform: input.platform,
    url: input.url.trim().slice(0, 300),
    sort_order: nextOrder,
  });
  revalidateTag("social-links");
}

export async function updateSocialLink(id: string, patch: Partial<SocialLinkInput>) {
  const db = getAdminSupabase();
  const update: Record<string, unknown> = {};
  if (patch.platform !== undefined) update.platform = patch.platform;
  if (patch.url !== undefined) update.url = patch.url.trim().slice(0, 300);
  await db.from("platform_social_links").update(update).eq("id", id);
  revalidateTag("social-links");
}

export async function deleteSocialLink(id: string) {
  const db = getAdminSupabase();
  await db.from("platform_social_links").delete().eq("id", id);
  revalidateTag("social-links");
}

export async function reorderSocialLink(id: string, direction: "up" | "down") {
  const db = getAdminSupabase();
  const { data: list } = await db.from("platform_social_links").select("id, sort_order").order("sort_order");
  const rows = list ?? [];
  const idx = rows.findIndex((r) => r.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= rows.length) return;
  const a = rows[idx];
  const b = rows[swapIdx];
  await db.from("platform_social_links").update({ sort_order: b.sort_order }).eq("id", a.id);
  await db.from("platform_social_links").update({ sort_order: a.sort_order }).eq("id", b.id);
  revalidateTag("social-links");
}
