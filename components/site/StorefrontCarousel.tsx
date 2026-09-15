import Link from "next/link";
import type { CSSProperties } from "react";
import { Crown, Flame, Sparkles } from "lucide-react";
import { getPublishedStorefronts, storeAvatarGradient } from "@/lib/storefront/directory";

/** Marquee needs at least this many cards in one lap to feel like a real strip, not a stutter. */
const MIN_CARDS = 12;

export async function StorefrontCarousel() {
  const stores = await getPublishedStorefronts();
  if (!stores.length) return null;

  // Repeat the real, live stores until there are enough for a full lap, then
  // duplicate that whole run once more — the marquee scrolls exactly one
  // copy's width (translateX -50%) so the loop is seamless, never resetting.
  const lap: typeof stores = [];
  while (lap.length < MIN_CARDS) lap.push(...stores);
  const track = [...lap, ...lap];

  return (
    <div className="border-t border-border bg-surface py-14">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Live on Zotomic</p>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">Storefronts already growing</h2>
        <p className="mt-2 text-sm text-fg-muted">Real businesses running their store on Zotomic.</p>
      </div>

      <div className="relative mt-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
        <div
          className="flex w-max animate-marquee gap-4 motion-reduce:animate-none"
          style={{ "--marquee-duration": `${lap.length * 3.5}s` } as CSSProperties}
        >
          {track.map((s, i) => (
            <Link
              key={`${s.slug}-${i}`}
              href={`/${s.slug}`}
              className="relative flex w-40 shrink-0 flex-col items-center gap-2 rounded-lg border border-border bg-app p-4 transition-colors hover:border-primary"
            >
              {(s.isFeatured || s.isHot || s.isNew) && (
                <span className="absolute left-2 top-2 flex flex-col gap-1">
                  {s.isFeatured && (
                    <span className="flex items-center gap-1 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold text-warning">
                      <Crown className="h-2.5 w-2.5" /> Featured
                    </span>
                  )}
                  {s.isHot && (
                    <span className="flex items-center gap-1 rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-bold text-danger">
                      <Flame className="h-2.5 w-2.5" /> Hot
                    </span>
                  )}
                  {s.isNew && (
                    <span className="flex items-center gap-1 rounded-full bg-success-soft px-1.5 py-0.5 text-[10px] font-bold text-success">
                      <Sparkles className="h-2.5 w-2.5" /> New
                    </span>
                  )}
                </span>
              )}
              {s.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.logoUrl} alt={s.name} className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br text-lg font-bold text-white ${storeAvatarGradient(s.slug)}`}
                >
                  {s.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="line-clamp-1 text-sm font-semibold text-navy">{s.name}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
