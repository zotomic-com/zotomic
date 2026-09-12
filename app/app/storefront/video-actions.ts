"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";
import * as V from "@/lib/storefront/videos";
import {
  resolveYouTubeChannel,
  listChannelUploads,
  youtubeWatchUrl,
  youtubeChannelConfigured,
  type ChannelVideo,
} from "@/lib/youtube";

const REV = () => revalidatePath("/app/storefront");

export async function listVideosAction(): Promise<V.StoreVideo[]> {
  const { businessId } = await requireBusiness({ allowReadOnly: true });
  return V.getStoreVideos(businessId);
}

export async function videoAccessAction(): Promise<V.VideoAccess> {
  const { businessId } = await requireBusiness({ allowReadOnly: true });
  return V.getVideoAccess(businessId);
}

export async function addVideoAction(
  url: string,
  title: string,
  aspect: string,
): Promise<{ ok: true; id: string } | { error: string }> {
  const { businessId, user } = await requireBusiness();
  const res = await V.addStoreVideo(businessId, { url, title, aspect, createdBy: user.id });
  if ("ok" in res) {
    await writeAudit(businessId, user.id, "storefront.video_added", { summary: title || url });
    REV();
  }
  return res;
}

export async function updateVideoAction(
  id: string,
  patch: { title?: string; aspect?: string; enabled?: boolean },
): Promise<{ ok: true } | { error: string }> {
  const { businessId } = await requireBusiness();
  const res = await V.updateStoreVideo(businessId, id, patch);
  if ("ok" in res) REV();
  return res;
}

export async function deleteVideoAction(id: string): Promise<{ ok: true } | { error: string }> {
  const { businessId, user } = await requireBusiness();
  const res = await V.deleteStoreVideo(businessId, id);
  if ("ok" in res) {
    await writeAudit(businessId, user.id, "storefront.video_deleted", { targetId: id });
    REV();
  }
  return res;
}

export async function reorderVideoAction(id: string, dir: "up" | "down"): Promise<{ ok: true } | { error: string }> {
  const { businessId } = await requireBusiness();
  const res = await V.reorderStoreVideo(businessId, id, dir);
  if ("ok" in res) REV();
  return res;
}

/* ── connect a YouTube channel + browse its uploads ───────────────────────── */

export interface ChannelState {
  configured: boolean;
  channelId: string | null;
  title: string | null;
  thumbnail: string | null;
}

export async function connectChannelAction(handleOrUrl: string): Promise<ChannelState | { error: string }> {
  await requireBusiness({ allowReadOnly: true });
  if (!youtubeChannelConfigured()) return { error: "Channel connect isn't configured yet." };
  const res = await resolveYouTubeChannel(handleOrUrl);
  if ("error" in res) return res;
  return { configured: true, channelId: res.channelId, title: res.title, thumbnail: res.thumbnail };
}

export async function browseChannelAction(
  handleOrUrl: string,
  pageToken?: string,
): Promise<{ videos: ChannelVideo[]; nextPageToken: string | null } | { error: string }> {
  await requireBusiness({ allowReadOnly: true });
  if (!youtubeChannelConfigured()) return { error: "Channel connect isn't configured yet." };
  const ch = await resolveYouTubeChannel(handleOrUrl);
  if ("error" in ch) return ch;
  const res = await listChannelUploads(ch.uploadsPlaylistId, pageToken);
  if ("error" in res) return res;
  return res;
}

export async function importChannelVideoAction(
  videoId: string,
  title: string,
  aspect: string,
): Promise<{ ok: true; id: string } | { error: string }> {
  const { businessId, user } = await requireBusiness();
  const res = await V.addStoreVideo(businessId, { url: youtubeWatchUrl(videoId), title, aspect, createdBy: user.id });
  if ("ok" in res) {
    await writeAudit(businessId, user.id, "storefront.video_added", { summary: `${title || videoId} (from channel)` });
    REV();
  }
  return res;
}
