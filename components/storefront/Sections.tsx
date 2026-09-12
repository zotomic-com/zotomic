import Link from "next/link";
import { cldUrl } from "@/lib/cloudinary";
import type { Section } from "@/lib/storefront/config";
import type { StoreCategory, StoreProduct } from "@/lib/storefront/store";
import { ProductCard } from "./ProductCard";
import { ProductCarousel } from "./ProductCarousel";
import { CategoryChips } from "./CategoryChips";
import { HeroCard } from "./HeroCard";
import { VideoCarousel } from "./VideoCarousel";
import { VideoGallery } from "./VideoGallery";
import type { StorefrontVideo } from "./VideoCard";

interface Ctx {
  products: StoreProduct[];
  categories: StoreCategory[];
  videos?: StorefrontVideo[];
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
  const tone = (["surface", "dark", "accent"].includes(s(d, "tone")) ? s(d, "tone") : "surface") as
    | "surface"
    | "dark"
    | "accent";
  const heading = s(d, "heading", "Welcome");
  const sub = s(d, "subheading");
  const tag = s(d, "tag");
  const ctaLabel = s(d, "ctaLabel");
  const ctaHref = `${ctx.basePath}${s(d, "ctaHref", "/products")}`;

  // Always the banner card. `style: "full"` just makes it an edge-to-edge band.
  return (
    <HeroCard
      heading={heading}
      sub={sub}
      tag={tag}
      ctaLabel={ctaLabel}
      ctaHref={ctaHref}
      images={slides}
      tone={tone}
      contained={style !== "full"}
    />
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

    case "video_carousel": {
      const limit = Number(d.limit) > 0 ? Number(d.limit) : 8;
      const videos = (ctx.videos ?? []).slice(0, limit);
      if (!videos.length) return null;
      return (
        <Wrap>
          <SectionHead title={s(d, "heading", "Watch")} />
          <VideoCarousel videos={videos} />
        </Wrap>
      );
    }

    case "video_gallery": {
      const limit = Number(d.limit) > 0 ? Number(d.limit) : 12;
      const videos = (ctx.videos ?? []).slice(0, limit);
      if (!videos.length) return null;
      return (
        <Wrap>
          <SectionHead title={s(d, "heading", "Video gallery")} />
          <VideoGallery videos={videos} />
        </Wrap>
      );
    }

    case "category_grid": {
      if (!ctx.categories.length) return null;
      return (
        <Wrap>
          <SectionHead title={s(d, "heading", "Categories")} seeAllHref={`${ctx.basePath}/products`} />
          <CategoryChips categories={ctx.categories} basePath={ctx.basePath} />
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
