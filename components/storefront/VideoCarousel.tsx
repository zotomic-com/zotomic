"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { VideoCard, type StorefrontVideo } from "./VideoCard";

/** Horizontal snap-scroll row of videos — same shell as ProductCarousel. Each
 *  card keeps its own aspect ratio, so 16:9 and 9:16 clips can sit side by side. */
export function VideoCarousel({ videos, interval = 4200 }: { videos: StorefrontVideo[]; interval?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const paused = useRef(false);

  const step = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = (el.firstElementChild as HTMLElement | null)?.clientWidth ?? 240;
    const amount = card + 16;
    const max = el.scrollWidth - el.clientWidth;
    if (dir === 1 && el.scrollLeft >= max - 4) el.scrollTo({ left: 0, behavior: "smooth" });
    else if (dir === -1 && el.scrollLeft <= 4) el.scrollTo({ left: max, behavior: "smooth" });
    else el.scrollBy({ left: dir * amount, behavior: "smooth" });
  };

  useEffect(() => {
    if (videos.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (paused.current) return;
      const el = ref.current;
      if (!el || el.scrollWidth <= el.clientWidth + 8) return;
      step(1);
    }, interval);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos.length, interval]);

  if (!videos.length) return null;

  return (
    <div
      className="group/carousel relative"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onTouchStart={() => (paused.current = true)}
      onTouchEnd={() => setTimeout(() => (paused.current = false), 4000)}
    >
      <div ref={ref} className="no-scrollbar flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto pb-2">
        {videos.map((v) => (
          <div key={v.id} className="w-[72%] shrink-0 snap-start sm:w-[42%] lg:w-[30%]">
            <VideoCard video={v} className="h-full" />
          </div>
        ))}
      </div>

      {videos.length > 2 && (
        <>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous"
            className="absolute -left-3 top-[42%] hidden h-9 w-9 items-center justify-center rounded-full border border-[var(--sf-line)] bg-[var(--sf-bg)] text-[var(--sf-fg)] shadow-md transition-opacity group-hover/carousel:opacity-100 sm:flex sm:opacity-0"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next"
            className="absolute -right-3 top-[42%] hidden h-9 w-9 items-center justify-center rounded-full border border-[var(--sf-line)] bg-[var(--sf-bg)] text-[var(--sf-fg)] shadow-md transition-opacity group-hover/carousel:opacity-100 sm:flex sm:opacity-0"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  );
}
