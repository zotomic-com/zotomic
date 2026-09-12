/**
 * YouTube helpers for the storefront video gallery. Parsing/thumbnails/embed
 * URLs need no API key. Channel browsing (resolveYouTubeChannel /
 * listChannelUploads) needs a server-side YOUTUBE_API_KEY (a plain Google API
 * key with the YouTube Data API v3 enabled — no OAuth, we only ever read
 * public video metadata).
 */

export const VIDEO_ASPECTS = ["16:9", "9:16", "1:1", "4:5"] as const;
export type VideoAspect = (typeof VIDEO_ASPECTS)[number];

export const ASPECT_LABEL: Record<VideoAspect, string> = {
  "16:9": "Widescreen (16:9)",
  "9:16": "Reels / Shorts / TikTok (9:16)",
  "1:1": "Square (1:1)",
  "4:5": "Portrait (4:5)",
};

/** Tailwind aspect-ratio class for a given video aspect. */
export function aspectClass(a: string): string {
  switch (a) {
    case "9:16":
      return "aspect-[9/16]";
    case "1:1":
      return "aspect-square";
    case "4:5":
      return "aspect-[4/5]";
    default:
      return "aspect-video"; // 16:9
  }
}

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Extract an 11-char YouTube video id from any watch/embed/shorts/youtu.be link — or a bare id. */
export function parseYouTubeId(input: string): string | null {
  const s = (input || "").trim();
  if (!s) return null;
  if (ID_RE.test(s)) return s;
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id && ID_RE.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const v = u.searchParams.get("v");
      if (v && ID_RE.test(v)) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      // /embed/<id>, /shorts/<id>, /live/<id>
      const kind = parts[0];
      if (["embed", "shorts", "live"].includes(kind) && parts[1] && ID_RE.test(parts[1])) return parts[1];
    }
  } catch {
    /* not a URL — fall through */
  }
  return null;
}

export function youtubeThumb(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Privacy-friendly embed (youtube-nocookie), used only once the shopper clicks play. */
export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
}

/* ── channel browsing (needs YOUTUBE_API_KEY) ─────────────────────────────── */

export function youtubeChannelConfigured(): boolean {
  return !!process.env.YOUTUBE_API_KEY;
}

const YT_API = "https://www.googleapis.com/youtube/v3";

function parseIso8601Duration(d: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d || "");
  if (!m) return 0;
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

/** Pull a channel handle/id out of a pasted channel URL, or return the raw input. */
function normalizeChannelRef(input: string): { kind: "handle" | "id" | "raw"; value: string } {
  const s = (input || "").trim();
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0]?.startsWith("@")) return { kind: "handle", value: parts[0] };
    if (parts[0] === "channel" && parts[1]) return { kind: "id", value: parts[1] };
    if (parts[0] === "c" || parts[0] === "user") return { kind: "handle", value: `@${parts[1] ?? ""}` };
  } catch {
    /* not a URL */
  }
  if (s.startsWith("@")) return { kind: "handle", value: s };
  if (/^UC[\w-]{22}$/.test(s)) return { kind: "id", value: s };
  return { kind: "handle", value: s.startsWith("@") ? s : `@${s}` };
}

export interface ResolvedChannel {
  channelId: string;
  title: string;
  thumbnail: string | null;
  uploadsPlaylistId: string;
}

export async function resolveYouTubeChannel(input: string): Promise<ResolvedChannel | { error: string }> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { error: "Channel connect isn't configured yet." };
  const ref = normalizeChannelRef(input);
  const qs = new URLSearchParams({
    part: "snippet,contentDetails",
    key,
    ...(ref.kind === "id" ? { id: ref.value } : { forHandle: ref.value.replace(/^@/, "") }),
  });
  try {
    const res = await fetch(`${YT_API}/channels?${qs.toString()}`, { signal: AbortSignal.timeout(15_000) });
    const data = await res.json();
    if (!res.ok) return { error: data?.error?.message || `YouTube API ${res.status}` };
    const item = data.items?.[0];
    if (!item) return { error: "Couldn't find that channel. Check the handle or URL." };
    const uploads = item.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) return { error: "That channel has no public uploads." };
    return {
      channelId: item.id,
      title: item.snippet?.title ?? ref.value,
      thumbnail: item.snippet?.thumbnails?.default?.url ?? null,
      uploadsPlaylistId: uploads as string,
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export interface ChannelVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
  durationSec: number;
  /** best-effort guess from clip length — owner can still override in the picker */
  suggestedAspect: VideoAspect;
}

export async function listChannelUploads(
  uploadsPlaylistId: string,
  pageToken?: string,
): Promise<{ videos: ChannelVideo[]; nextPageToken: string | null } | { error: string }> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { error: "Channel connect isn't configured yet." };
  try {
    const qs = new URLSearchParams({
      part: "snippet",
      playlistId: uploadsPlaylistId,
      maxResults: "18",
      key,
      ...(pageToken ? { pageToken } : {}),
    });
    const res = await fetch(`${YT_API}/playlistItems?${qs.toString()}`, { signal: AbortSignal.timeout(15_000) });
    const data = await res.json();
    if (!res.ok) return { error: data?.error?.message || `YouTube API ${res.status}` };
    const items = (data.items ?? []) as {
      snippet: { title: string; publishedAt: string; thumbnails?: Record<string, { url: string }>; resourceId: { videoId: string } };
    }[];
    const ids = items.map((i) => i.snippet.resourceId.videoId).filter(Boolean);
    let durations = new Map<string, number>();
    if (ids.length) {
      const dqs = new URLSearchParams({ part: "contentDetails", id: ids.join(","), key });
      const dres = await fetch(`${YT_API}/videos?${dqs.toString()}`, { signal: AbortSignal.timeout(15_000) });
      const ddata = await dres.json();
      if (dres.ok) {
        durations = new Map(
          (ddata.items ?? []).map((v: { id: string; contentDetails?: { duration?: string } }) => [
            v.id,
            parseIso8601Duration(v.contentDetails?.duration ?? ""),
          ]),
        );
      }
    }
    const videos: ChannelVideo[] = items
      .filter((i) => i.snippet.resourceId.videoId)
      .map((i) => {
        const durationSec = durations.get(i.snippet.resourceId.videoId) ?? 0;
        return {
          videoId: i.snippet.resourceId.videoId,
          title: i.snippet.title,
          thumbnail:
            i.snippet.thumbnails?.medium?.url ?? i.snippet.thumbnails?.default?.url ?? youtubeThumb(i.snippet.resourceId.videoId),
          publishedAt: i.snippet.publishedAt,
          durationSec,
          suggestedAspect: durationSec > 0 && durationSec <= 60 ? "9:16" : "16:9",
        };
      });
    return { videos, nextPageToken: data.nextPageToken ?? null };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
