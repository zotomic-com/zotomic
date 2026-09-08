"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Ruler, X } from "lucide-react";
import { addToCart } from "./cart-store";
import { QtyStepper } from "./QtyStepper";
import { pixel } from "@/components/tracking/Pixel";
import { storefrontEvent } from "./StorefrontTracker";

interface Variant {
  id: string;
  name: string;
  options: Record<string, string>;
  price: number;
  salePrice: number | null;
  stockQty: number;
  soldOut: boolean;
}

const COLOUR_HEX: Record<string, string> = {
  cream: "#f5efe0",
  beige: "#e8dcc0",
  tan: "#d2b48c",
  navy: "#1f2937",
  charcoal: "#374151",
  offwhite: "#f7f7f4",
};
const isColourOption = (name: string) => /colou?r|shade/i.test(name);
function swatch(value: string): string | null {
  const key = value.toLowerCase().replace(/\s+/g, "");
  if (COLOUR_HEX[key]) return COLOUR_HEX[key];
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return value;
  // let the browser resolve a CSS named colour; unknowns fall through to a text pill
  if (typeof window !== "undefined") {
    const el = document.createElement("span");
    el.style.color = "";
    el.style.color = value;
    if (el.style.color) return value;
  } else if (/^[a-z]+$/i.test(value)) {
    return value;
  }
  return null;
}

export function AddToCartButton({
  product,
  soldOut,
  currency,
  storeSlug,
  basePath = "",
  options = [],
  variants = [],
  sizeChartUrl = null,
}: {
  product: { id: string; name: string; price: number; image: string | null; slug: string };
  soldOut: boolean;
  currency: string;
  storeSlug: string;
  basePath?: string;
  options?: { name: string; values: string[] }[];
  variants?: Variant[];
  sizeChartUrl?: string | null;
}) {
  const router = useRouter();
  const hasVariants = options.length > 0 && variants.length > 0;
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [chart, setChart] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [mounted, setMounted] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { rootMargin: "0px 0px -40px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const selected = useMemo(() => {
    if (!hasVariants) return null;
    return variants.find((v) => options.every((o) => v.options[o.name] === choice[o.name])) ?? null;
  }, [hasVariants, variants, options, choice]);

  const disabled = hasVariants ? !selected || selected.soldOut : soldOut;
  const hasSizeOption = options.some((o) => /size/i.test(o.name));

  const add = (buyNow: boolean) => {
    const unit = hasVariants ? (selected!.salePrice ?? selected!.price) : product.price;
    addToCart(
      storeSlug,
      {
        id: selected?.id ?? product.id,
        productId: product.id,
        variantId: selected?.id,
        variantLabel: selected?.name,
        name: hasVariants ? `${product.name} — ${selected!.name}` : product.name,
        price: unit,
        image: product.image,
        slug: product.slug,
      },
      qty,
    );
    pixel.track("AddToCart", { content_name: product.name, value: unit * qty, currency });
    storefrontEvent(storeSlug, "add_to_cart", { productId: product.id, value: unit * qty });
    if (buyNow) {
      router.push(`${basePath}/checkout`);
      return;
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };

  const addLabel = hasVariants && !selected ? "Select options" : added ? "Added ✓" : soldOut || selected?.soldOut ? "Sold out" : "Add to cart";

  const Buttons = ({ compact = false }: { compact?: boolean }) => (
    <div className={compact ? "flex gap-2" : "space-y-2.5"}>
      <button
        onClick={() => add(false)}
        disabled={disabled}
        className={`${compact ? "flex-1" : "w-full"} rounded-[var(--sf-radius)] px-5 py-3 text-sm font-semibold transition ${
          disabled
            ? "cursor-not-allowed border border-[var(--sf-line)] text-[var(--sf-muted)]"
            : "border border-[var(--sf-accent)] text-[var(--sf-accent)] hover:bg-[var(--sf-accent-soft)]"
        }`}
      >
        {addLabel}
      </button>
      <button
        onClick={() => add(true)}
        disabled={disabled}
        className={`${compact ? "flex-1" : "w-full"} rounded-[var(--sf-radius)] px-5 py-3 text-sm font-semibold text-white transition ${
          disabled ? "cursor-not-allowed bg-[var(--sf-line)]" : "bg-[var(--sf-accent)] hover:opacity-90"
        }`}
      >
        Buy now
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {hasVariants &&
        options.map((o) => {
          const colour = isColourOption(o.name);
          return (
            <div key={o.name}>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">
                  {o.name}
                  {choice[o.name] ? <span className="ml-1 normal-case text-[var(--sf-fg)]">· {choice[o.name]}</span> : ""}
                </p>
                {/size/i.test(o.name) && sizeChartUrl && (
                  <button
                    type="button"
                    onClick={() => setChart(true)}
                    className="flex items-center gap-1 text-xs text-[var(--sf-accent)]"
                  >
                    <Ruler className="h-3.5 w-3.5" /> Size chart
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {o.values.map((val) => {
                  const active = choice[o.name] === val;
                  const hex = colour ? swatch(val) : null;
                  if (hex) {
                    return (
                      <button
                        key={val}
                        type="button"
                        title={val}
                        onClick={() => setChoice((c) => ({ ...c, [o.name]: val }))}
                        className={`h-8 w-8 rounded-full border-2 ${active ? "border-[var(--sf-accent)]" : "border-[var(--sf-line)]"}`}
                        style={{ backgroundColor: hex }}
                      />
                    );
                  }
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setChoice((c) => ({ ...c, [o.name]: val }))}
                      className={`min-w-9 rounded-[var(--sf-radius)] border px-3 py-1.5 text-sm ${
                        active
                          ? "border-[var(--sf-accent)] bg-[var(--sf-accent)] text-white"
                          : "border-[var(--sf-line)] text-[var(--sf-fg)] hover:border-[var(--sf-accent)]"
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

      {!hasVariants && !hasSizeOption && sizeChartUrl && (
        <button type="button" onClick={() => setChart(true)} className="flex items-center gap-1 text-xs text-[var(--sf-accent)]">
          <Ruler className="h-3.5 w-3.5" /> Size chart
        </button>
      )}

      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">Qty</span>
        <QtyStepper qty={qty} onChange={(n) => setQty(Math.max(1, n))} min={1} />
      </div>

      <Buttons />
      <div ref={sentinel} />

      {/* sticky mobile bar */}
      {stuck &&
        mounted &&
        createPortal(
          <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--sf-line)] bg-[var(--sf-bg)]/95 p-3 backdrop-blur sm:hidden">
            <Buttons compact />
          </div>,
          document.body,
        )}

      {chart &&
        sizeChartUrl &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
            onMouseDown={(e) => e.target === e.currentTarget && setChart(false)}
          >
            <div className="relative max-h-[85vh] max-w-lg overflow-auto rounded-[var(--sf-radius-lg)] bg-[var(--sf-bg)] p-2">
              <button
                onClick={() => setChart(false)}
                className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sizeChartUrl} alt="Size chart" className="w-full rounded-[var(--sf-radius)]" />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
