"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Flame, Maximize2, Ruler, Star, Truck } from "lucide-react";
import { money } from "@/lib/money";
import { cldUrl } from "@/lib/cloudinary";
import { isColourOpt, isSizeOpt, resolveSwatch } from "@/lib/storefront/colour";
import { Stars } from "./Stars";
import { addToCart } from "./cart-store";
import { pixel } from "@/components/tracking/Pixel";
import { storefrontEvent } from "./StorefrontTracker";
import { WishlistHeart } from "./WishlistHeart";
import { MenuDrawer } from "./MenuDrawer";
import { BottomSheet } from "./BottomSheet";
import { ImageZoom } from "./ImageZoom";
import type { ProductBadge } from "@/lib/storefront/store";

interface Variant {
  id: string;
  name: string;
  options: Record<string, string>;
  price: number;
  salePrice: number | null;
  stockQty: number;
  soldOut: boolean;
}
interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  reviewerName: string;
}

const BADGE = { sale: "Sale", hot: "Hot", best: "Best", new: "New" } as const;
const BADGE_BG: Record<Exclude<ProductBadge, null>, string> = {
  sale: "bg-[var(--sf-accent)]",
  hot: "bg-red-600",
  best: "bg-amber-500",
  new: "bg-black",
};


export function ProductDetail({
  product,
  currency,
  storeSlug,
  basePath,
  options,
  variants,
  reviews,
  reviewAverage,
  reviewCount,
  commerce,
  nav,
}: {
  product: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    price: number;
    salePrice: number | null;
    imageUrls: string[];
    sold: number;
    trackInventory: boolean;
    stockQty: number;
    badge: ProductBadge;
  };
  currency: string;
  storeSlug: string;
  basePath: string;
  options: { name: string; values: string[] }[];
  variants: Variant[];
  reviews: Review[];
  reviewAverage: number;
  reviewCount: number;
  commerce: { codEnabled: boolean; shippingFlatRate: number; freeShippingOver: number | null; sizeChartUrl: string | null };
  nav: { label: string; href: string }[];
}) {
  const router = useRouter();
  const hasVariants = options.length > 0 && variants.length > 0;
  const sizeOpt = hasVariants ? options.find((o) => isSizeOpt(o.name)) ?? null : null;
  const colourOpt = hasVariants ? options.find((o) => isColourOpt(o.name)) ?? null : null;
  const otherOpts = options.filter((o) => o !== sizeOpt && o !== colourOpt);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [sheet, setSheet] = useState<null | "details" | "reviews" | "sizechart">(null);
  const [zoom, setZoom] = useState(false);
  const [img, setImg] = useState(0);
  const [added, setAdded] = useState(false);
  const [sizePage, setSizePage] = useState(0); // mobile: 3 sizes per page
  const [showReviews, setShowReviews] = useState(false); // desktop: reviews open on click

  // lock page scroll behind the full-screen mobile layer
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => {
      document.documentElement.style.overflow = mq.matches ? "hidden" : "";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      document.documentElement.style.overflow = "";
    };
  }, []);

  const selected = useMemo(
    () => (hasVariants ? variants.find((v) => options.every((o) => v.options[o.name] === choice[o.name])) ?? null : null),
    [hasVariants, variants, options, choice],
  );
  const needsSelection = hasVariants && !selected;
  const onSale = product.salePrice != null && product.salePrice < product.price;
  const price = hasVariants && selected ? (selected.salePrice ?? selected.price) : onSale ? product.salePrice! : product.price;
  const compareAt = hasVariants && selected ? (selected.salePrice != null ? selected.price : null) : onSale ? product.price : null;
  const soldOut = hasVariants ? variants.every((v) => v.soldOut) : product.trackInventory && product.stockQty <= 0;
  const stockLeft = hasVariants ? (selected ? selected.stockQty : null) : product.trackInventory ? product.stockQty : null;
  const lowStock = stockLeft != null && stockLeft > 0 && stockLeft <= 5;
  const images = product.imageUrls.length ? product.imageUrls : [];

  const add = (buyNow: boolean) => {
    if (needsSelection || soldOut || selected?.soldOut) return;
    addToCart(
      storeSlug,
      {
        id: selected?.id ?? product.id,
        productId: product.id,
        variantId: selected?.id,
        variantLabel: selected?.name,
        name: selected ? `${product.name} — ${selected.name}` : product.name,
        price,
        image: images[0] ?? null,
        slug: product.slug,
      },
      qty,
    );
    pixel.track("AddToCart", { content_name: product.name, value: price * qty, currency });
    storefrontEvent(storeSlug, "add_to_cart", { productId: product.id, value: price * qty });
    if (buyNow) router.push(`${basePath}/checkout`);
    else {
      setAdded(true);
      setTimeout(() => setAdded(false), 1600);
    }
  };

  const back = () => (history.length > 1 ? router.back() : router.push(`${basePath}/products`));

  // swipe between images on the mobile hero
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onImgTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onImgTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current || images.length < 2) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
    setImg((i) => (dx < 0 ? Math.min(images.length - 1, i + 1) : Math.max(0, i - 1)));
  };

  /* ── shared bits ─────────────────────────────────────────────── */

  const soldLine = product.sold > 0 && (
    <span className="flex items-center gap-1">
      <Flame className="h-3.5 w-3.5" /> {product.sold} sold
    </span>
  );

  /** desktop: ★★★★★ 4.5 (120)  ·  N sold */
  const RatingRow = () => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--sf-muted)]">
      {reviewCount > 0 ? (
        <button onClick={() => setSheet("reviews")} className="text-[var(--sf-fg)]">
          <Stars value={reviewAverage} count={reviewCount} />
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <span className="flex">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} className="h-3.5 w-3.5 text-[var(--sf-line)]" />
            ))}
          </span>
          No reviews yet
        </span>
      )}
      {soldLine}
    </div>
  );

  /** mobile: "N sold" on top, then a single ★ 4.5 */
  const MobileRating = () => (
    <div className="space-y-0.5 text-sm text-[var(--sf-muted)]">
      {soldLine}
      {reviewCount > 0 ? (
        <button onClick={() => setSheet("reviews")} className="block text-[var(--sf-fg)]">
          <Stars value={reviewAverage} single starClass="h-4 w-4" />
        </button>
      ) : (
        <span className="flex items-center gap-1">
          <Star className="h-4 w-4 text-[var(--sf-line)]" /> No reviews yet
        </span>
      )}
    </div>
  );

  /** compact tappable size values as text. On mobile only 3 show at once with a
   *  chevron to page through the rest. */
  const SizeTokens = ({
    light,
    className = "",
    paged = false,
  }: {
    light?: boolean;
    className?: string;
    paged?: boolean;
  }) => {
    if (!sizeOpt) return null;
    const per = 3;
    const pages = Math.ceil(sizeOpt.values.length / per);
    const shown = paged && pages > 1 ? sizeOpt.values.slice(sizePage * per, sizePage * per + per) : sizeOpt.values;
    return (
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold ${className}`}>
        {shown.map((val) => {
          const active = choice[sizeOpt.name] === val;
          return (
            <button
              key={val}
              onClick={() => setChoice((c) => ({ ...c, [sizeOpt.name]: val }))}
              className={
                active
                  ? "text-[var(--sf-accent)] underline underline-offset-4"
                  : light
                    ? "text-white/70 hover:text-white"
                    : "text-[var(--sf-muted)] hover:text-[var(--sf-fg)]"
              }
            >
              {val}
            </button>
          );
        })}
        {paged && pages > 1 && (
          <button
            onClick={() => setSizePage((p) => (p + 1) % pages)}
            aria-label="More sizes"
            className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--sf-line)] text-[var(--sf-fg)]"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  };

  const SizeGuideLink = ({ light }: { light?: boolean }) =>
    sizeOpt && commerce.sizeChartUrl ? (
      <button
        onClick={() => setSheet("sizechart")}
        className={`flex items-center gap-1 text-xs font-medium ${light ? "text-white" : "text-[var(--sf-accent)]"}`}
      >
        <Ruler className="h-3.5 w-3.5" /> Size guide
      </button>
    ) : null;

  /** round filled colour circles. `overlay` = a compact row that floats over the
   *  product image (smaller on narrow phones). */
  const ColourCircles = ({ overlay, light }: { overlay?: boolean; light?: boolean }) => {
    if (!colourOpt) return null;
    return (
      <div className="flex flex-wrap gap-2">
        {colourOpt.values.map((val) => {
          const active = choice[colourOpt.name] === val;
          const hex = resolveSwatch(val) ?? "#d1d5db";
          return (
            <button
              key={val}
              title={val}
              onClick={() => setChoice((c) => ({ ...c, [colourOpt.name]: val }))}
              className={`rounded-full border-2 transition ${
                overlay ? "h-6 w-6 shadow-md min-[380px]:h-7 min-[380px]:w-7" : "h-8 w-8"
              } ${
                active
                  ? "border-[var(--sf-accent)] ring-2 ring-[var(--sf-accent)]/40"
                  : overlay
                    ? "border-white/80"
                    : light
                      ? "border-white/40"
                      : "border-[var(--sf-line)]"
              }`}
              style={{ backgroundColor: hex }}
            />
          );
        })}
      </div>
    );
  };

  /** only rendered when the item is actually low on stock */
  const LowStock = () =>
    lowStock ? (
      <p className="flex items-center gap-1.5 font-bold text-red-500">
        <Flame className="h-4 w-4" />
        Only <span className="text-lg leading-none">{stockLeft}</span> left
      </p>
    ) : null;

  const Price = ({ big }: { big?: boolean }) => (
    <p className={big ? "text-2xl font-bold sm:text-3xl" : "text-lg font-bold"}>
      {money(price, currency)}
      {compareAt != null && (
        <span className="ml-2 text-sm font-medium text-[var(--sf-muted)] line-through">{money(compareAt, currency)}</span>
      )}
    </p>
  );

  function OptionPicker({ light, opts = otherOpts }: { light?: boolean; opts?: { name: string; values: string[] }[] }) {
    if (!opts.length) return null;
    return (
      <div className="space-y-3">
        {opts.map((o) => {
          const colour = isColourOpt(o.name);
          return (
            <div key={o.name}>
              <div className="mb-1.5 flex items-center justify-between">
                <p className={`text-xs font-semibold uppercase tracking-wide ${light ? "text-white/70" : "text-[var(--sf-muted)]"}`}>
                  {o.name}
                  {choice[o.name] ? <span className={`ml-1 normal-case ${light ? "text-white" : "text-[var(--sf-fg)]"}`}>· {choice[o.name]}</span> : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {o.values.map((val) => {
                  const active = choice[o.name] === val;
                  const hex = colour ? resolveSwatch(val) : null;
                  if (hex) {
                    return (
                      <button
                        key={val}
                        title={val}
                        onClick={() => setChoice((c) => ({ ...c, [o.name]: val }))}
                        className={`h-8 w-8 rounded-full border-2 ${active ? "border-[var(--sf-accent)] ring-2 ring-[var(--sf-accent)]/40" : light ? "border-white/40" : "border-[var(--sf-line)]"}`}
                        style={{ backgroundColor: hex }}
                      />
                    );
                  }
                  return (
                    <button
                      key={val}
                      onClick={() => setChoice((c) => ({ ...c, [o.name]: val }))}
                      className={`min-w-9 rounded-[var(--sf-radius)] border px-3 py-1.5 text-sm ${
                        active
                          ? "border-[var(--sf-accent)] bg-[var(--sf-accent)] text-white"
                          : light
                            ? "border-white/40 text-white"
                            : "border-[var(--sf-line)] text-[var(--sf-fg)]"
                      }`}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const Qty = () => (
    <div className="inline-flex items-center rounded-full border border-[var(--sf-line)]">
      <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3 py-1.5 text-lg leading-none" aria-label="Decrease">−</button>
      <span className="w-8 text-center text-sm tabular-nums">{qty}</span>
      <button onClick={() => setQty((q) => q + 1)} className="px-3 py-1.5 text-lg leading-none" aria-label="Increase">+</button>
    </div>
  );

  /** single rounded pill split into Add to cart | Buy now — solid blue */
  const BuyBar = () => {
    const disabled = soldOut || selected?.soldOut;
    if (disabled) {
      return (
        <div className="w-full rounded-full bg-[var(--sf-line)] py-3.5 text-center text-sm font-semibold text-[var(--sf-muted)]">
          Sold out
        </div>
      );
    }
    if (needsSelection) {
      return (
        <button
          onClick={() => setSheet(null)}
          className="w-full rounded-full bg-[var(--sf-accent)] py-3.5 text-center text-sm font-bold text-white shadow-lg"
        >
          Select {options.map((o) => o.name.toLowerCase()).join(" & ")}
        </button>
      );
    }
    return (
      <div className="flex w-full overflow-hidden rounded-full bg-[var(--sf-accent)] text-white shadow-lg">
        <button onClick={() => add(false)} className="flex-1 py-3.5 text-sm font-bold">
          {added ? "Added ✓" : "Add to cart"}
        </button>
        <span aria-hidden className="my-2 w-px bg-white/40" />
        <button onClick={() => add(true)} className="flex-1 py-3.5 text-sm font-bold">
          Buy now
        </button>
      </div>
    );
  };

  const DeliveryNote = () => (
    <div className="space-y-1.5 rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-card)] p-3 text-sm text-[var(--sf-muted)]">
      <p className="flex items-center gap-2">
        <Truck className="h-4 w-4 shrink-0" />
        {commerce.codEnabled ? "Cash on delivery available" : "Prepaid orders only"}
      </p>
      <p className="pl-6">
        Delivery {money(commerce.shippingFlatRate, currency)}
        {commerce.freeShippingOver ? ` · free over ${money(commerce.freeShippingOver, currency)}` : ""}
      </p>
    </div>
  );

  const ReviewsList = () =>
    reviewCount === 0 ? (
      <p className="text-sm text-[var(--sf-muted)]">No reviews yet.</p>
    ) : (
      <ul className="space-y-4">
        {reviews.map((r) => (
          <li key={r.id} className="border-b border-[var(--sf-line)] pb-4 last:border-0">
            <div className="flex items-center gap-2">
              <span className="flex">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className="h-3.5 w-3.5 text-amber-400" fill={r.rating >= n ? "currentColor" : "none"} />
                ))}
              </span>
              <span className="text-xs font-semibold">{r.reviewerName}</span>
            </div>
            {r.title && <p className="mt-1.5 text-sm font-semibold">{r.title}</p>}
            {r.body && <p className="mt-1 text-sm text-[var(--sf-muted)]">{r.body}</p>}
          </li>
        ))}
      </ul>
    );

  return (
    <>
      {/* ══════════ MOBILE — immersive ══════════ */}
      <div className="fixed inset-0 z-40 bg-black sm:hidden">
        {/* image frame — full height, swipe between images */}
        <div
          className="absolute inset-0 overflow-hidden"
          onTouchStart={onImgTouchStart}
          onTouchEnd={onImgTouchEnd}
        >
          {images[img] ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={cldUrl(images[img], 1000)}
              alt={product.name}
              onClick={() => setZoom(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-neutral-800 text-sm text-white/50">No image</div>
          )}
        </div>

        {/* top bar — solid white circular buttons */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-3">
          {(() => {
            const b = "flex h-9 w-9 items-center justify-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-black/5";
            return (
              <>
                <button onClick={back} aria-label="Back" className={`pointer-events-auto ${b}`}>
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="pointer-events-auto flex items-center gap-2">
                  <button onClick={() => setZoom(true)} aria-label="Zoom" className={b}>
                    <Maximize2 className="h-4 w-4" />
                  </button>
                  <WishlistHeart
                    storeSlug={storeSlug}
                    item={{ id: product.id, name: product.name, price, image: images[0] ?? null, slug: product.slug }}
                    size={18}
                    className={b}
                  />
                  <MenuDrawer nav={nav} basePath={basePath} storeSlug={storeSlug} triggerClassName={b} />
                </div>
              </>
            );
          })()}
        </div>

        {/* image dots */}
        {images.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center gap-1.5">
            {images.map((_, n) => (
              <span key={n} className={`h-1.5 rounded-full transition-all ${n === img ? "w-4 bg-white" : "w-1.5 bg-white/50"}`} />
            ))}
          </div>
        )}

        {/* bottom stack: colour selector · info panel · buy bar */}
        <div className="absolute inset-x-0 bottom-0 z-10">
        {colourOpt && (
          <div className="px-4 pb-2.5">
            <ColourCircles overlay />
          </div>
        )}

        {/* solid info panel */}
        <div className="mx-2 max-h-[48vh] overflow-y-auto rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-bg)] p-4 text-[var(--sf-fg)] shadow-xl">
          {product.badge && (
            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${BADGE_BG[product.badge]}`}>
              {BADGE[product.badge]}
            </span>
          )}
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <h1 className="text-xl font-extrabold tracking-tight">{product.name}</h1>
            {sizeOpt && (
              <div className="max-w-[48%] shrink-0 pt-0.5 text-right">
                <SizeTokens className="justify-end" paged />
                <div className="mt-0.5 flex justify-end">
                  <SizeGuideLink />
                </div>
              </div>
            )}
          </div>
          <div className="mt-2">
            <MobileRating />
          </div>

          {otherOpts.length > 0 && (
            <div className="mt-3">
              <OptionPicker opts={otherOpts} />
            </div>
          )}

          <div className="mt-3 space-y-2">
            <LowStock />
            <div className="flex items-center justify-between">
              <Price big />
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">Qty</span>
                <Qty />
              </div>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button onClick={() => setSheet("details")} className="flex-1 rounded-full border border-[var(--sf-line)] py-2 text-xs font-semibold">
              Details
            </button>
            <button onClick={() => setSheet("reviews")} className="flex-1 rounded-full border border-[var(--sf-line)] py-2 text-xs font-semibold">
              Reviews{reviewCount ? ` (${reviewCount})` : ""}
            </button>
          </div>
        </div>

        {/* buy bar — solid blue */}
        <div className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          <BuyBar />
        </div>
        </div>
      </div>

      {/* ══════════ DESKTOP / tablet ══════════ */}
      <div className="mx-auto hidden max-w-6xl px-4 py-8 sm:block sm:px-6">
        <button onClick={back} className="mb-5 flex items-center gap-1 text-sm text-[var(--sf-muted)] hover:text-[var(--sf-fg)]">
          <ChevronLeft className="h-4 w-4" /> Back
        </button>

        <div className="grid gap-10 md:grid-cols-2">
          {/* gallery */}
          <div className="flex gap-4">
            {images.length > 1 && (
              <div className="flex flex-col gap-2">
                {images.slice(0, 6).map((u, n) => (
                  <button
                    key={u + n}
                    onClick={() => setImg(n)}
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded-[var(--sf-radius)] border-2 ${img === n ? "border-[var(--sf-accent)]" : "border-transparent opacity-70 hover:opacity-100"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cldUrl(u, 120)} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* image + a strip the exact width of the image below it */}
            <div className="min-w-0 flex-1">
              <button
                onClick={() => setZoom(true)}
                className="group relative block aspect-square w-full overflow-hidden rounded-[var(--sf-radius-lg)] bg-[var(--sf-card)]"
              >
                {images[img] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={cldUrl(images[img], 1000)} alt={product.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-sm text-[var(--sf-muted)]">No image</span>
                )}
                <span className="absolute right-3 top-3 rounded-full bg-black/40 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <Maximize2 className="h-4 w-4" />
                </span>
              </button>

              {(reviewCount > 0 || product.sold > 0 || lowStock) && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[var(--sf-radius)] border border-[var(--sf-line)] px-4 py-3 text-sm">
                  {reviewCount > 0 ? (
                    <button onClick={() => setShowReviews(true)} className="text-[var(--sf-fg)]">
                      <Stars value={reviewAverage} count={reviewCount} />
                    </button>
                  ) : (
                    <span className="text-[var(--sf-muted)]">No reviews yet</span>
                  )}
                  {product.sold > 0 && (
                    <span className="text-[var(--sf-muted)]">
                      sold - <span className="font-semibold text-[var(--sf-fg)]">{product.sold}</span>
                    </span>
                  )}
                  {lowStock && (
                    <span className="font-semibold text-red-600">
                      low stock - {String(stockLeft).padStart(2, "0")}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* info */}
          <div className="md:sticky md:top-24 md:self-start">
            <div className="flex items-start justify-between gap-3">
              <div>
                {product.badge && (
                  <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${BADGE_BG[product.badge]}`}>
                    {BADGE[product.badge]}
                  </span>
                )}
                <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{product.name}</h1>
              </div>
              <WishlistHeart
                storeSlug={storeSlug}
                item={{ id: product.id, name: product.name, price, image: images[0] ?? null, slug: product.slug }}
                size={20}
                className="mt-1 shrink-0 rounded-full border border-[var(--sf-line)] p-2"
              />
            </div>

            <div className="mt-2">
              <RatingRow />
            </div>
            <div className="mt-3">
              <Price big />
            </div>
            <div className="mt-2 text-sm">
              <LowStock />
            </div>

            {product.description && (
              <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm text-[var(--sf-muted)]">{product.description}</p>
            )}

            {colourOpt && (
              <div className="mt-5">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">
                  Colour{choice[colourOpt.name] ? <span className="ml-1 normal-case text-[var(--sf-fg)]">· {choice[colourOpt.name]}</span> : ""}
                </p>
                <ColourCircles />
              </div>
            )}

            {sizeOpt && (
              <div className="mt-5">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">
                    Size{choice[sizeOpt.name] ? <span className="ml-1 normal-case text-[var(--sf-fg)]">· {choice[sizeOpt.name]}</span> : ""}
                  </p>
                  <SizeGuideLink />
                </div>
                <div className="flex flex-wrap gap-2">
                  {sizeOpt.values.map((val) => {
                    const active = choice[sizeOpt.name] === val;
                    return (
                      <button
                        key={val}
                        onClick={() => setChoice((c) => ({ ...c, [sizeOpt.name]: val }))}
                        className={`min-w-10 rounded-[var(--sf-radius)] border px-3 py-1.5 text-sm ${
                          active
                            ? "border-[var(--sf-accent)] bg-[var(--sf-accent)] text-white"
                            : "border-[var(--sf-line)] text-[var(--sf-fg)] hover:border-[var(--sf-fg)]"
                        }`}
                      >
                        {val}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {otherOpts.length > 0 && (
              <div className="mt-5">
                <OptionPicker opts={otherOpts} />
              </div>
            )}

            <div className="mt-5 flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">Qty</span>
              <Qty />
            </div>

            <div className="mt-5">
              <BuyBar />
            </div>

            <div className="mt-5">
              <DeliveryNote />
            </div>
          </div>
        </div>

        {/* labelled sections — description (always open) & reviews (click to open) */}
        <div className="mt-14 grid gap-10 md:grid-cols-2">
          <section>
            <h2 className="text-lg font-extrabold tracking-tight">Description</h2>
            <p className="mt-3 whitespace-pre-line text-sm text-[var(--sf-muted)]">
              {product.description || "No description provided for this product yet."}
            </p>
          </section>

          <section>
            <button
              onClick={() => setShowReviews((v) => !v)}
              className="flex w-full items-center gap-2 text-left"
              aria-expanded={showReviews}
            >
              <h2 className="text-lg font-extrabold tracking-tight">Ratings &amp; reviews</h2>
              {reviewCount > 0 && <Stars value={reviewAverage} count={reviewCount} className="text-sm text-[var(--sf-fg)]" />}
              <ChevronDown className={`ml-auto h-5 w-5 shrink-0 text-[var(--sf-muted)] transition-transform ${showReviews ? "rotate-180" : ""}`} />
            </button>
            {showReviews ? (
              <div className="mt-4">
                <ReviewsList />
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--sf-muted)]">
                {reviewCount > 0
                  ? `Click to read ${reviewCount} customer review${reviewCount === 1 ? "" : "s"}.`
                  : "No reviews yet."}
              </p>
            )}
          </section>
        </div>
      </div>

      {/* ══════════ overlays ══════════ */}
      {zoom && images.length > 0 && (
        <ImageZoom images={images} index={img} alt={product.name} onClose={() => setZoom(false)} />
      )}

      <BottomSheet open={sheet === "details"} onClose={() => setSheet(null)} title="Product details">
        {product.description ? (
          <p className="whitespace-pre-line text-sm text-[var(--sf-muted)]">{product.description}</p>
        ) : (
          <p className="text-sm text-[var(--sf-muted)]">No description provided.</p>
        )}
        <div className="mt-4">
          <DeliveryNote />
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "reviews"} onClose={() => setSheet(null)} title={`Reviews${reviewCount ? ` · ${reviewAverage.toFixed(1)} (${reviewCount})` : ""}`}>
        <ReviewsList />
      </BottomSheet>

      <BottomSheet open={sheet === "sizechart"} onClose={() => setSheet(null)} title="Size chart">
        {commerce.sizeChartUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={commerce.sizeChartUrl} alt="Size chart" className="w-full rounded-[var(--sf-radius)]" />
        )}
      </BottomSheet>
    </>
  );
}
