"use client";

import { useEffect, useState } from "react";
import { cldUrl } from "@/lib/cloudinary";

/** Auto-playing crossfade image layer for the hero. */
export function HeroSlides({
  images,
  className = "absolute inset-0",
  interval = 5000,
  showDots = false,
  scrim = false,
}: {
  images: string[];
  className?: string;
  interval?: number;
  showDots?: boolean;
  /** dark overlay for legibility of text placed over the slides */
  scrim?: boolean;
}) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (images.length < 2) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = setInterval(() => setI((v) => (v + 1) % images.length), interval);
    return () => clearInterval(t);
  }, [images.length, interval]);

  if (!images.length) return null;

  return (
    <div className={className} aria-hidden>
      {images.map((src, n) => (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={src + n}
          src={cldUrl(src, 1400)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[900ms] ease-in-out"
          style={{ opacity: n === i ? 1 : 0 }}
          loading={n === 0 ? "eager" : "lazy"}
        />
      ))}

      {scrim && <div aria-hidden className="absolute inset-0 bg-black/30" />}

      {showDots && images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
          {images.map((_, n) => (
            <button
              key={n}
              type="button"
              onClick={() => setI(n)}
              aria-label={`Slide ${n + 1}`}
              className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-white" : "w-1.5 bg-white/50"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
