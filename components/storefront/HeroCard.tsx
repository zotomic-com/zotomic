"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cldUrl } from "@/lib/cloudinary";

type Tone = "surface" | "dark" | "accent";

const TONE: Record<Tone, { card: string; sub: string; tag: string }> = {
  surface: { card: "bg-[var(--sf-card)] text-[var(--sf-fg)]", sub: "text-[var(--sf-muted)]", tag: "bg-[var(--sf-fg)]/10 text-[var(--sf-fg)]" },
  dark: { card: "bg-neutral-900 text-white", sub: "text-white/70", tag: "bg-white/15 text-white" },
  accent: { card: "bg-[var(--sf-accent)] text-white", sub: "text-white/85", tag: "bg-black/25 text-white" },
};

/** Rounded banner-card hero. Auto-crossfades its images. No overlay/scrim —
 *  the owner uploads artwork composed for the storefront. */
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
  /** contained + rounded (default) vs full-bleed band */
  contained?: boolean;
  className?: string;
}) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (images.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((v) => (v + 1) % images.length), 5000);
    return () => clearInterval(t);
  }, [images.length]);

  const t = TONE[tone] ?? TONE.surface;

  return (
    <section className={`${contained ? "mx-auto max-w-6xl px-4 pt-4 sm:px-6 sm:pt-6" : ""} ${className}`}>
      <div className={`relative overflow-hidden ${contained ? "rounded-[var(--sf-radius-lg)]" : ""} ${t.card}`}>
        <div className="grid sm:grid-cols-2">
          <div className="relative z-10 max-w-[60%] p-5 sm:max-w-none sm:p-12">
            {tag && (
              <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${t.tag}`}>
                {tag}
              </span>
            )}
            <h1 className="mt-2 text-xl font-extrabold leading-tight sm:mt-3 sm:text-4xl">{heading}</h1>
            {sub && <p className={`mt-1.5 text-xs sm:text-sm ${t.sub}`}>{sub}</p>}
            {ctaLabel && (
              <Link
                href={ctaHref}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-neutral-900 py-1.5 pl-4 pr-1.5 text-sm font-bold text-white sm:mt-6"
              >
                {ctaLabel}
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-neutral-900">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </Link>
            )}
          </div>

          <div className="pointer-events-none absolute right-0 top-0 h-full w-1/2 sm:relative sm:h-auto sm:min-h-[300px] sm:w-auto">
            {images.map((src, n) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={src + n}
                src={cldUrl(src, 900)}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-700"
                style={{ opacity: n === i ? 1 : 0 }}
                loading={n === 0 ? "eager" : "lazy"}
              />
            ))}
          </div>
        </div>
      </div>

      {images.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {images.map((_, n) => (
            <button
              key={n}
              type="button"
              onClick={() => setI(n)}
              aria-label={`Slide ${n + 1}`}
              className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-[var(--sf-accent)]" : "w-1.5 bg-[var(--sf-fg)]/20"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
