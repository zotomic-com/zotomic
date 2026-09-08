import Link from "next/link";
import { cldUrl } from "@/lib/cloudinary";
import type { Section } from "@/lib/storefront/config";
import type { StoreCategory, StoreProduct } from "@/lib/storefront/store";
import { ProductCard } from "./ProductCard";
import { ProductCarousel } from "./ProductCarousel";
import { CategoryChips } from "./CategoryChips";
import { HeroSlides } from "./HeroSlides";

interface Ctx {
  products: StoreProduct[];
  categories: StoreCategory[];
  currency: string;
  basePath: string;
  storeSlug: string;
}

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">{children}</section>
);

function SectionHead({ title, seeAllHref }: { title?: string; seeAllHref?: string }) {
  if (!title) return null;
  return (
    <div className="mb-6 flex items-end justify-between gap-3">
      <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h2>
      {seeAllHref && (
        <Link href={seeAllHref} className="shrink-0 text-sm font-semibold text-[var(--sf-accent)] hover:underline">
          See all
        </Link>
      )}
    </div>
  );
}

const s = (d: Record<string, unknown>, k: string, fb = "") => (typeof d[k] === "string" ? (d[k] as string) : fb);

function Grid({ products, ...ctx }: { products: StoreProduct[] } & Omit<Ctx, "products" | "categories">) {
  if (!products.length)
    return <p className="text-sm text-[var(--sf-muted)]">No products published yet.</p>;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <ProductCard
          key={p.id}
          product={p}
          currency={ctx.currency}
          basePath={ctx.basePath}
          storeSlug={ctx.storeSlug}
        />
      ))}
    </div>
  );
}

function Hero({ section, ctx }: { section: Section; ctx: Ctx }) {
  const d = section.data;
  const imgs = (Array.isArray(d.images) ? (d.images as unknown[]).filter((x) => typeof x === "string" && x) : []) as string[];
  const legacy = s(d, "imageUrl");
  const slides = (imgs.length ? imgs : legacy ? [legacy] : []).slice(0, 3);
  const style = s(d, "style", "full");
  const tone = s(d, "tone", "surface");
  const heading = s(d, "heading", "Welcome");
  const sub = s(d, "subheading");
  const ctaLabel = s(d, "ctaLabel");
  const ctaHref = `${ctx.basePath}${s(d, "ctaHref", "/products")}`;

  const Cta = () =>
    ctaLabel ? (
      <Link
        href={ctaHref}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--sf-accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
      >
        {ctaLabel}
        <span aria-hidden>→</span>
      </Link>
    ) : null;

  if (style === "card") {
    const bg =
      tone === "dark"
        ? "bg-[#111418] text-white"
        : tone === "accent"
          ? "bg-[var(--sf-accent-soft)] text-[var(--sf-fg)]"
          : "bg-[var(--sf-card)] text-[var(--sf-fg)]";
    return (
      <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <div className={`grid overflow-hidden rounded-[var(--sf-radius-lg)] sm:grid-cols-2 ${bg}`}>
          <div className="flex flex-col justify-center p-8 sm:p-12">
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-4xl">{heading}</h1>
            {sub && <p className={`mt-2 max-w-sm text-sm ${tone === "dark" ? "text-white/70" : "text-[var(--sf-muted)]"}`}>{sub}</p>}
            <Cta />
          </div>
          <div className="relative min-h-[220px] bg-[var(--sf-card)] sm:min-h-[340px]">
            {slides.length ? (
              <HeroSlides images={slides} showDots />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-[var(--sf-muted)]">Add a banner image</div>
            )}
          </div>
        </div>
      </section>
    );
  }

  // full-bleed
  return (
    <section className="relative isolate overflow-hidden bg-[var(--sf-card)]">
      {slides.length > 0 && <HeroSlides images={slides} className="absolute inset-0 z-0" showDots scrim />}
      <div
        className={`relative z-10 mx-auto flex max-w-6xl flex-col items-start px-4 py-24 sm:px-6 sm:py-36 ${slides.length ? "text-white" : "text-[var(--sf-fg)]"}`}
      >
        <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight drop-shadow-sm sm:text-5xl">{heading}</h1>
        {sub && <p className={`mt-3 max-w-xl ${slides.length ? "text-white/90" : "text-[var(--sf-muted)]"}`}>{sub}</p>}
        <Cta />
      </div>
    </section>
  );
}

export function SectionRenderer({ section, ctx }: { section: Section; ctx: Ctx }) {
  if (!section.enabled) return null;
  const d = section.data;
  const gridCtx = { currency: ctx.currency, basePath: ctx.basePath, storeSlug: ctx.storeSlug };

  switch (section.type) {
    case "hero":
      return <Hero section={section} ctx={ctx} />;

    case "featured_products":
      return (
        <Wrap>
          <SectionHead title={s(d, "heading", "Featured")} seeAllHref={`${ctx.basePath}/products`} />
          <ProductCarousel products={ctx.products.slice(0, 10)} {...gridCtx} />
        </Wrap>
      );

    case "product_grid":
      return (
        <Wrap>
          <SectionHead title={s(d, "heading", "All products")} seeAllHref={`${ctx.basePath}/products`} />
          <Grid products={ctx.products} {...gridCtx} />
        </Wrap>
      );

    case "category_grid": {
      if (!ctx.categories.length) return null;
      const hasPhotos = ctx.categories.some((c) => c.imageUrl);
      return (
        <Wrap>
          <SectionHead title={s(d, "heading", "Shop by category")} seeAllHref={`${ctx.basePath}/products`} />
          {hasPhotos ? (
            <CategoryChips categories={ctx.categories} basePath={ctx.basePath} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {ctx.categories.map((c) => (
                <Link
                  key={c.slug}
                  href={`${ctx.basePath}/products?category=${encodeURIComponent(c.name)}`}
                  className="rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] bg-[var(--sf-card)] p-6 text-center text-sm font-semibold transition-colors hover:border-[var(--sf-accent)]"
                >
                  {c.name}
                  <span className="mt-1 block text-xs font-normal text-[var(--sf-muted)]">{c.count} item{c.count === 1 ? "" : "s"}</span>
                </Link>
              ))}
            </div>
          )}
        </Wrap>
      );
    }

    case "image_text": {
      const flip = Boolean(d.flip);
      return (
        <Wrap>
          <div className="grid items-center gap-8 md:grid-cols-2">
            <div className={flip ? "md:order-2" : ""}>
              <h2 className="text-2xl font-extrabold tracking-tight">{s(d, "heading")}</h2>
              <p className="mt-3 whitespace-pre-line text-[var(--sf-muted)]">{s(d, "body")}</p>
            </div>
            <div className={`aspect-[4/3] overflow-hidden rounded-[var(--sf-radius-lg)] bg-[var(--sf-card)] ${flip ? "md:order-1" : ""}`}>
              {s(d, "imageUrl") && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={cldUrl(s(d, "imageUrl"), 900)} alt="" className="h-full w-full object-cover" loading="lazy" />
              )}
            </div>
          </div>
        </Wrap>
      );
    }

    case "rich_text":
      return (
        <Wrap>
          <SectionHead title={s(d, "heading")} />
          <p className="max-w-2xl whitespace-pre-line text-[var(--sf-muted)]">{s(d, "body")}</p>
        </Wrap>
      );

    case "testimonials": {
      const items = (Array.isArray(d.items) ? d.items : []) as { quote: string; name: string }[];
      if (!items.length) return null;
      return (
        <Wrap>
          <SectionHead title={s(d, "heading", "What customers say")} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((t, i) => (
              <blockquote key={i} className="rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] bg-[var(--sf-elevated)] p-5 shadow-[var(--sf-shadow)]">
                <p className="text-sm leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                <footer className="mt-3 text-xs font-semibold text-[var(--sf-muted)]">— {t.name}</footer>
              </blockquote>
            ))}
          </div>
        </Wrap>
      );
    }

    case "faq": {
      const items = (Array.isArray(d.items) ? d.items : []) as { q: string; a: string }[];
      return (
        <Wrap>
          <SectionHead title={s(d, "heading", "Questions")} />
          <div className="max-w-2xl space-y-2.5">
            {items.map((f, i) => (
              <details key={i} className="rounded-[var(--sf-radius)] border border-[var(--sf-line)] p-4">
                <summary className="cursor-pointer text-sm font-semibold">{f.q}</summary>
                <p className="mt-2 text-sm text-[var(--sf-muted)]">{f.a}</p>
              </details>
            ))}
          </div>
        </Wrap>
      );
    }

    case "newsletter":
      return (
        <Wrap>
          <div className="rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] bg-[var(--sf-card)] p-8 text-center sm:p-12">
            <h2 className="text-xl font-extrabold sm:text-2xl">{s(d, "heading", "Join our list")}</h2>
            {s(d, "subheading") && <p className="mt-1 text-sm text-[var(--sf-muted)]">{s(d, "subheading")}</p>}
            <form className="mx-auto mt-5 flex max-w-sm gap-2">
              <input
                type="email"
                required
                placeholder="you@example.com"
                className="h-11 flex-1 rounded-full border border-[var(--sf-line)] bg-[var(--sf-bg)] px-4 text-sm"
              />
              <button className="rounded-full bg-[var(--sf-accent)] px-5 text-sm font-semibold text-white">Sign up</button>
            </form>
          </div>
        </Wrap>
      );

    case "logo_strip": {
      const logos = (Array.isArray(d.logos) ? d.logos : []) as string[];
      if (!logos.length) return null;
      return (
        <Wrap>
          <div className="flex flex-wrap items-center justify-center gap-8 opacity-60">
            {logos.map((l, i) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img key={i} src={l} alt="" className="h-7 w-auto sm:h-8" loading="lazy" />
            ))}
          </div>
        </Wrap>
      );
    }

    case "contact":
      return (
        <Wrap>
          <SectionHead title={s(d, "heading", "Visit us")} />
          <p className="text-sm text-[var(--sf-muted)]">
            See the <Link href={`${ctx.basePath}/contact`} className="underline">contact page</Link>.
          </p>
        </Wrap>
      );

    default:
      return null;
  }
}
