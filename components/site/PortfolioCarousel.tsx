import type { CSSProperties } from "react";
import { ExternalLink } from "lucide-react";
import { getPortfolioItems } from "@/lib/portfolio";

/** Marquee needs at least this many cards in one lap to feel like a real strip, not a stutter. */
const MIN_CARDS = 8;

export async function PortfolioCarousel() {
  const items = await getPortfolioItems();
  if (!items.length) return null;

  // Repeat the real work until there are enough for a full lap, then duplicate
  // that whole run once more — the marquee scrolls exactly one copy's width
  // (translateX -50%) so the loop is seamless, never resetting.
  const lap: typeof items = [];
  while (lap.length < MIN_CARDS) lap.push(...items);
  const track = [...lap, ...lap];

  return (
    <div className="border-t border-border bg-surface py-14">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Recent work</p>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">Sites we&apos;ve built</h2>
        <p className="mt-2 text-sm text-fg-muted">A few of the projects we&apos;ve designed and shipped.</p>
      </div>

      <div className="relative mt-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
        <div
          className="flex w-max animate-marquee gap-4 motion-reduce:animate-none"
          style={{ "--marquee-duration": `${lap.length * 4}s` } as CSSProperties}
        >
          {track.map((it, i) => (
            <a
              key={`${it.id}-${i}`}
              href={it.projectUrl ?? undefined}
              target={it.projectUrl ? "_blank" : undefined}
              rel={it.projectUrl ? "noopener noreferrer" : undefined}
              className="flex w-64 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-app shadow-sm transition-colors hover:border-primary"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.imageUrl} alt={it.title} className="h-36 w-full object-cover" />
              <div className="p-4">
                <p className="flex items-center gap-1.5 text-sm font-bold text-navy">
                  {it.title}
                  {it.projectUrl && <ExternalLink className="h-3.5 w-3.5 text-fg-subtle" />}
                </p>
                {it.description && <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{it.description}</p>}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
