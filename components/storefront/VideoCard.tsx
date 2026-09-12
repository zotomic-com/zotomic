"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { aspectClass, youtubeEmbedUrl, type VideoAspect } from "@/lib/youtube";

export interface StorefrontVideo {
  id: string;
  videoId: string;
  title: string | null;
  aspect: VideoAspect;
  thumbnail: string;
}

/** Thumbnail + play button; the real YouTube iframe only loads once clicked
 *  (facade pattern — no third-party script/network cost until the shopper asks for it). */
export function VideoCard({ video, className = "" }: { video: StorefrontVideo; className?: string }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className={`overflow-hidden rounded-[var(--sf-radius-lg)] bg-black ${aspectClass(video.aspect)} ${className}`}>
      {playing ? (
        <iframe
          src={youtubeEmbedUrl(video.videoId)}
          title={video.title ?? "Video"}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={video.title ? `Play ${video.title}` : "Play video"}
          className="group relative block h-full w-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={video.thumbnail}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />
          <span className="absolute inset-0 bg-black/15 transition-colors group-hover:bg-black/30" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-neutral-900 shadow-lg transition-transform group-hover:scale-110">
              <Play className="ml-0.5 h-6 w-6 fill-current" />
            </span>
          </span>
          {video.title && (
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-left text-xs font-semibold text-white [text-shadow:0_1px_4px_rgba(0,0,0,.5)] line-clamp-2">
              {video.title}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
