/**
 * Storefront video gallery/carousel — owner-managed YouTube library. Shared
 * data layer used by the owner's editor actions, the storefront renderer, and
 * the admin tools/dashboard (all three just pass a businessId). Server-only.
 */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";
import { PLANS, type PlanId } from "@/lib/plans";
import { deriveEntitlements } from "@/lib/entitlements";
import { parseYouTubeId, youtubeThumb, type VideoAspect, VIDEO_ASPECTS } from "@/lib/youtube";

export interface StoreVideo {
  id: string;
  businessId: string;
  url: string;
  videoId: string;
  title: string | null;
  aspect: VideoAspect;
  sortOrder: number;
  enabled: boolean;
  thumbnail: string;
  createdAt: string;
}

function mapRow(r: Record<string, unknown>): StoreVideo {
  return {
    id: r.id as string,
    businessId: r.business_id as string,
    url: r.url as string,
    videoId: r.video_id as string,
    title: (r.title as string) ?? null,
    aspect: (VIDEO_ASPECTS as readonly string[]).includes(r.aspect as string) ? (r.aspect as VideoAspect) : "16:9",
    sortOrder: Number(r.sort_order ?? 0),
    enabled: r.enabled !== false,
    thumbnail: youtubeThumb(r.video_id as string),
    createdAt: r.created_at as string,
  };
}

/** All videos for a store, in display order. `enabledOnly` for the live storefront. */
export async function getStoreVideos(businessId: string, opts: { enabledOnly?: boolean } = {}): Promise<StoreVideo[]> {
  const db = getAdminSupabase();
  let q = db.from("storefront_videos").select("*").eq("business_id", businessId).order("sort_order", { ascending: true });
  if (opts.enabledOnly) q = q.eq("enabled", true);
  const { data } = await q;
  return (data ?? []).map(mapRow);
}

export interface VideoAccess {
  plan: PlanId;
  /** the feature is switched on for this store at all (admin can force it off) */
  featureOn: boolean;
  /** effective cap — plan default unless the admin set a numeric override */
  cap: number;
  used: number;
  canAdd: boolean;
  capIsOverride: boolean;
}

export async function getVideoAccess(businessId: string): Promise<VideoAccess> {
  const db = getAdminSupabase();
  const [{ data: sub }, { data: biz }, videos] = await Promise.all([
    db.from("subscriptions").select("plan").eq("business_id", businessId).maybeSingle(),
    db.from("businesses").select("feature_overrides").eq("id", businessId).maybeSingle(),
    getStoreVideos(businessId),
  ]);
  const plan = (sub?.plan ?? "free") as PlanId;
  const overrides = (biz?.feature_overrides as Record<string, unknown>) ?? {};
  const ent = deriveEntitlements(plan, overrides);
  const planCap = PLANS.find((p) => p.id === plan)?.limits.videos ?? 0;
  const override = overrides.video_gallery_cap;
  const cap = typeof override === "number" && override >= 0 ? override : planCap;
  const used = videos.length;
  return {
    plan,
    featureOn: ent.video_gallery,
    cap,
    used,
    canAdd: ent.video_gallery && used < cap,
    capIsOverride: typeof override === "number",
  };
}

export async function addStoreVideo(
  businessId: string,
  input: { url: string; title?: string; aspect?: string; createdBy?: string },
): Promise<{ ok: true; id: string } | { error: string }> {
  const videoId = parseYouTubeId(input.url);
  if (!videoId) return { error: "That doesn't look like a YouTube link. Paste the video's watch, share, or embed link." };

  const access = await getVideoAccess(businessId);
  if (!access.featureOn) return { error: "The video gallery has been turned off for this store." };
  if (!access.canAdd) {
    return { error: `You've reached your plan's video limit (${access.cap}). Ask Zotomic to raise it, or remove one first.` };
  }

  const db = getAdminSupabase();
  const { data: existing } = await db
    .from("storefront_videos")
    .select("id")
    .eq("business_id", businessId)
    .eq("video_id", videoId)
    .maybeSingle();
  if (existing) return { error: "That video is already in your library." };

  const { count } = await db
    .from("storefront_videos")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  const aspect: VideoAspect = (VIDEO_ASPECTS as readonly string[]).includes(input.aspect ?? "") ? (input.aspect as VideoAspect) : "16:9";

  const { data, error } = await db
    .from("storefront_videos")
    .insert({
      business_id: businessId,
      url: input.url.trim().slice(0, 500),
      video_id: videoId,
      title: input.title?.trim().slice(0, 200) || null,
      aspect,
      sort_order: count ?? 0,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not add the video." };
  return { ok: true, id: data.id as string };
}

export async function updateStoreVideo(
  businessId: string,
  id: string,
  patch: { title?: string; aspect?: string; enabled?: boolean },
): Promise<{ ok: true } | { error: string }> {
  const db = getAdminSupabase();
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title.trim().slice(0, 200) || null;
  if (patch.aspect !== undefined && (VIDEO_ASPECTS as readonly string[]).includes(patch.aspect)) row.aspect = patch.aspect;
  if (patch.enabled !== undefined) row.enabled = !!patch.enabled;
  if (!Object.keys(row).length) return { ok: true };
  const { error } = await db.from("storefront_videos").update(row).eq("business_id", businessId).eq("id", id);
  if (error) return { error: "Could not save." };
  return { ok: true };
}

export async function deleteStoreVideo(businessId: string, id: string): Promise<{ ok: true } | { error: string }> {
  const db = getAdminSupabase();
  const { error } = await db.from("storefront_videos").delete().eq("business_id", businessId).eq("id", id);
  if (error) return { error: "Could not delete." };
  return { ok: true };
}

export async function reorderStoreVideo(
  businessId: string,
  id: string,
  dir: "up" | "down",
): Promise<{ ok: true } | { error: string }> {
  const db = getAdminSupabase();
  const { data: rows } = await db
    .from("storefront_videos")
    .select("id, sort_order")
    .eq("business_id", businessId)
    .order("sort_order", { ascending: true });
  const list = rows ?? [];
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return { error: "Not found." };
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return { ok: true };
  const a = list[idx];
  const b = list[swapIdx];
  await db.from("storefront_videos").update({ sort_order: b.sort_order }).eq("id", a.id);
  await db.from("storefront_videos").update({ sort_order: a.sort_order }).eq("id", b.id);
  return { ok: true };
}

/** Enabled videos ready for the storefront renderer — empty if the feature is off for this store. */
export async function getStorefrontVideosForRender(
  businessId: string,
): Promise<{ id: string; videoId: string; title: string | null; aspect: VideoAspect; thumbnail: string }[]> {
  const access = await getVideoAccess(businessId);
  if (!access.featureOn) return [];
  const videos = await getStoreVideos(businessId, { enabledOnly: true });
  return videos.map((v) => ({ id: v.id, videoId: v.videoId, title: v.title, aspect: v.aspect, thumbnail: v.thumbnail }));
}

/** Admin abuse-cleanup: wipe a store's entire video library. Returns how many were removed. */
export async function wipeStoreVideos(businessId: string): Promise<number> {
  const db = getAdminSupabase();
  const { data } = await db.from("storefront_videos").select("id").eq("business_id", businessId);
  const n = data?.length ?? 0;
  if (n) await db.from("storefront_videos").delete().eq("business_id", businessId);
  return n;
}
