"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cldUrl } from "@/lib/cloudinary";

type Tone = "surface" | "dark" | "accent";

const TONE: Record<Tone, { card: string; heading: string; sub: string; tag: string }> = {
  surface: { card: "bg-[var(--sf-card)]", heading: "text-[var(--sf-fg)]", sub: "text-[var(--sf-muted)]", tag: "bg-[var(--sf-fg)]/10 text-[var(--sf-fg)]" },
  dark: { card: "bg-neutral-900", heading: "text-white", sub: "text-white/70", tag: "bg-white/15 text-white" },
  accent: { card: "bg-[var(--sf-accent)]", heading: "text-white", sub: "text-white/85", tag: "bg-black/25 text-white" },
};

/** Hero banner. With images: they fill the card as a full background, heading /
 *  button sit on top, dots inside the card. Without images: a coloured card. */
export function HeroCard({
  heading,
  sub,
  tag,
  ctaLabel,
  ctaHref,
  images,
  tone = "surface",
  contained = true,
  className = "",
}: {
  heading: string;
  sub?: string;
  tag?: string;
  ctaLabel?: string;
  ctaHref: string;
  images: string[];
  tone?: Tone;
  contained?: boolean;
  className?: string;
}) {
  const [i, setI] = useState(0);
  const hasImg = images.length > 0;

  useEffect(() => {
    if (images.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((v) => (v + 1) % images.length), 5000);
    return () => clearInterval(t);
  }, [images.length]);

  const t = TONE[tone] ?? TONE.surface;
  const headingCls = hasImg ? "text-white [text-shadow:0_2px_10px_rgba(0,0,0,.55)]" : t.heading;
  const subCls = hasImg ? "text-white/90 [text-shadow:0_1px_6px_rgba(0,0,0,.5)]" : t.sub;

  return (
    <section className={`${contained ? "mx-auto max-w-6xl px-4 pt-4 sm:px-6 sm:pt-6" : ""} ${className}`}>
      <div
        className={`relative min-h-[340px] overflow-hidden sm:min-h-[460px] ${
          contained ? "rounded-[var(--sf-radius-lg)]" : "rounded-b-[26px] sm:rounded-b-[36px]"
        } ${hasImg ? "bg-[var(--sf-card)]" : t.card}`}
      >
        {/* image layer */}
        {images.map((src, n) => (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={src + n}
            src={cldUrl(src, 1400)}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-700"
            style={{ opacity: n === i ? 1 : 0 }}
            loading={n === 0 ? "eager" : "lazy"}
          />
        ))}

        {/* text on top */}
        {(heading || ctaLabel) && (
          <div className="absolute inset-0 z-10 flex flex-col justify-center p-6 sm:p-12">
            {tag && (
              <span className={`mb-2 inline-block w-fit rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${t.tag}`}>
                {tag}
              </span>
            )}
            {heading && (
              <h1 className={`max-w-[74%] text-2xl font-extrabold leading-tight sm:max-w-md sm:text-4xl ${headingCls}`}>
                {heading}
              </h1>
            )}
            {sub && <p className={`mt-1.5 max-w-[68%] text-xs sm:max-w-sm sm:text-sm ${subCls}`}>{sub}</p>}
            {ctaLabel && (
              <Link
                href={ctaHref}
                className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-neutral-900 py-1.5 pl-4 pr-1.5 text-sm font-bold text-white sm:mt-6"
              >
                {ctaLabel}
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-neutral-900">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </Link>
            )}
          </div>
        )}

        {/* carousel dots — inside the card */}
        {images.length > 1 && (
          <div className="absolute bottom-3.5 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
            {images.map((_, n) => (
              <button
                key={n}
                type="button"
                onClick={() => setI(n)}
                aria-label={`Slide ${n + 1}`}
                className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-white" : "w-1.5 bg-white/60"}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
