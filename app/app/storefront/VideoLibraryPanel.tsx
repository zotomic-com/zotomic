"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, Trash2, Power, Plus, Video, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ASPECT_LABEL, VIDEO_ASPECTS, youtubeThumb, type VideoAspect, type ChannelVideo } from "@/lib/youtube";
import type { StoreVideo, VideoAccess } from "@/lib/storefront/videos";
import {
  addVideoAction,
  updateVideoAction,
  deleteVideoAction,
  reorderVideoAction,
  connectChannelAction,
  browseChannelAction,
  importChannelVideoAction,
} from "./video-actions";

export function VideoLibraryPanel({
  videos,
  access,
  channelConnectAvailable,
}: {
  videos: StoreVideo[];
  access: VideoAccess;
  channelConnectAvailable: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [aspect, setAspect] = useState<VideoAspect>("16:9");

  const [channelInput, setChannelInput] = useState("");
  const [channel, setChannel] = useState<{ title: string; thumbnail: string | null } | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [channelVideos, setChannelVideos] = useState<ChannelVideo[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set(videos.map((v) => v.videoId)));

  const run = (fn: () => Promise<{ ok?: boolean; error?: string } | unknown>, ok = "Saved") =>
    start(async () => {
      const res = (await fn()) as { error?: string } | undefined;
      if (res?.error) return toast(res.error, "error");
      toast(ok, "success");
      router.refresh();
    });

  const pct = access.cap > 0 ? Math.min(100, Math.round((access.used / access.cap) * 100)) : 0;

  return (
    <div className="space-y-4">
      {!access.featureOn && (
        <div className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
          The video gallery has been turned off for this store. Contact Zotomic support if you think this is a mistake.
        </div>
      )}

      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-fg">
            {access.used} / {access.cap} videos used
            {access.capIsOverride && <span className="text-fg-subtle"> (custom limit)</span>}
          </span>
          <span className="text-fg-subtle capitalize">{access.plan} plan</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <span className={`block h-full ${pct >= 90 ? "bg-danger" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* add by pasting a link */}
      <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="text-sm font-semibold text-fg">Add a video</p>
        <p className="text-xs text-fg-subtle">
          Upload it to YouTube first, then paste the watch, share, or embed link here.
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
          <Field label="YouTube link">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/…" />
          </Field>
          <Field label="Title (optional)">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Shown as a caption" />
          </Field>
        </div>
        <Field label="Frame">
          <Select value={aspect} onChange={(e) => setAspect(e.target.value as VideoAspect)}>
            {VIDEO_ASPECTS.map((a) => (
              <option key={a} value={a}>
                {ASPECT_LABEL[a]}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          size="sm"
          disabled={pending || !url.trim() || !access.canAdd}
          onClick={() =>
            run(async () => {
              const res = await addVideoAction(url, title, aspect);
              if ("ok" in res) {
                setUrl("");
                setTitle("");
              }
              return res;
            }, "Video added")
          }
        >
          <Plus className="h-4 w-4" /> Add video
        </Button>
        {!access.canAdd && access.featureOn && <p className="text-xs text-danger">You&apos;re at your video limit.</p>}
      </div>

      {/* connect a channel */}
      {channelConnectAvailable && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
            <Video className="h-4 w-4 text-danger" /> Connect your YouTube channel
          </p>
          <p className="text-xs text-fg-subtle">
            Browse your channel&apos;s public uploads and add the ones you want — no separate login needed.
          </p>
          <div className="flex gap-2">
            <Input
              value={channelInput}
              onChange={(e) => setChannelInput(e.target.value)}
              placeholder="@yourchannel or channel URL"
              className="flex-1"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || !channelInput.trim()}
              onClick={() =>
                start(async () => {
                  const res = await connectChannelAction(channelInput);
                  if ("error" in res) return toast(res.error, "error");
                  setChannel({ title: res.title ?? channelInput, thumbnail: res.thumbnail });
                  setBrowsing(true);
                  const page = await browseChannelAction(channelInput);
                  if ("error" in page) return toast(page.error, "error");
                  setChannelVideos(page.videos);
                  setNextPageToken(page.nextPageToken);
                })
              }
            >
              Connect
            </Button>
          </div>

          {channel && browsing && (
            <div className="mt-2 space-y-2">
              <p className="text-xs font-medium text-fg">{channel.title}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {channelVideos.map((v) => {
                  const already = importedIds.has(v.videoId);
                  return (
                    <div key={v.videoId} className="overflow-hidden rounded-sm border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={v.thumbnail || youtubeThumb(v.videoId)} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                      <div className="p-1.5">
                        <p className="line-clamp-2 text-[11px] font-medium text-fg">{v.title}</p>
                        <Button
                          size="sm"
                          variant={already ? "ghost" : "secondary"}
                          disabled={pending || already || !access.canAdd}
                          className="mt-1 w-full"
                          onClick={() =>
                            run(async () => {
                              const res = await importChannelVideoAction(v.videoId, v.title, v.suggestedAspect);
                              if ("ok" in res) setImportedIds((s) => new Set(s).add(v.videoId));
                              return res;
                            }, "Added")
                          }
                        >
                          {already ? "Added" : "Add"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {nextPageToken && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const page = await browseChannelAction(channelInput, nextPageToken ?? undefined);
                      if ("error" in page) return toast(page.error, "error");
                      setChannelVideos((cur) => [...cur, ...page.videos]);
                      setNextPageToken(page.nextPageToken);
                    })
                  }
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* library */}
      {videos.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {videos.map((v, i) => (
            <li key={v.id} className="flex items-center gap-2.5 px-3 py-2.5 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.thumbnail} alt="" className="h-10 w-16 shrink-0 rounded-sm object-cover" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-medium text-fg">{v.title || v.videoId}</span>
                  <Badge tone="neutral">{v.aspect}</Badge>
                  {!v.enabled && <Badge tone="neutral">hidden</Badge>}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-fg-subtle">
                <button onClick={() => run(() => reorderVideoAction(v.id, "up"), "Reordered")} disabled={pending || i === 0} className="disabled:opacity-30 hover:text-fg">
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => run(() => reorderVideoAction(v.id, "down"), "Reordered")}
                  disabled={pending || i === videos.length - 1}
                  className="disabled:opacity-30 hover:text-fg"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button onClick={() => run(() => updateVideoAction(v.id, { enabled: !v.enabled }), "Updated")} disabled={pending} className="hover:text-fg">
                  <Power className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm("Remove this video?")) run(() => deleteVideoAction(v.id), "Removed");
                  }}
                  disabled={pending}
                  className="hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {videos.length === 0 && <p className="text-xs text-fg-subtle">No videos yet.</p>}
    </div>
  );
}
