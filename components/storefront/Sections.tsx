import Link from "next/link";
import type { Section } from "@/lib/storefront/config";
import type { StoreProduct } from "@/lib/storefront/store";
import { ProductCard } from "./ProductCard";

interface Ctx {
  products: StoreProduct[];
  currency: string;
  basePath: string;
  storeSlug: string;
}

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">{children}</section>
);
const H = ({ children }: { children: React.ReactNode }) =>
  children ? <h2 className="mb-6 text-2xl font-extrabold tracking-tight">{children}</h2> : null;

const s = (d: Record<string, unknown>, k: string, fb = "") => (typeof d[k] === "string" ? (d[k] as string) : fb);

function Grid({ products, ...ctx }: { products: StoreProduct[] } & Omit<Ctx, "products">) {
  if (!products.length)
    return <p className="text-sm text-[var(--sf-muted)]">No products published yet.</p>;
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
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

export function SectionRenderer({ section, ctx }: { section: Section; ctx: Ctx }) {
  if (!section.enabled) return null;
  const d = section.data;

  switch (section.type) {
    case "hero": {
      const img = s(d, "imageUrl");
      return (
        <section className="relative">
          <div
            className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-20 sm:px-6"
            style={img ? { backgroundImage: `url(${img})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
          >
            <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">
              {s(d, "heading", "Welcome")}
            </h1>
            {s(d, "subheading") && (
              <p className="max-w-xl text-[var(--sf-muted)]">{s(d, "subheading")}</p>
            )}
            {s(d, "ctaLabel") && (
              <Link
                href={`${ctx.basePath}${s(d, "ctaHref", "/products")}`}
                className="mt-2 rounded-[var(--sf-radius)] bg-[var(--sf-accent)] px-5 py-2.5 text-sm font-semibold text-white"
              >
                {s(d, "ctaLabel")}
              </Link>
            )}
          </div>
        </section>
      );
    }

    case "featured_products": {
      const limit = typeof d.limit === "number" ? d.limit : 4;
      return (
        <Wrap>
          <H>{s(d, "heading", "Featured")}</H>
          <Grid products={ctx.products.slice(0, limit)} currency={ctx.currency} basePath={ctx.basePath} storeSlug={ctx.storeSlug} />
        </Wrap>
      );
    }

    case "product_grid":
      return (
        <Wrap>
          <H>{s(d, "heading", "All products")}</H>
          <Grid products={ctx.products} currency={ctx.currency} basePath={ctx.basePath} storeSlug={ctx.storeSlug} />
        </Wrap>
      );

    case "category_grid": {
      const cats = [...new Set(ctx.products.map((p) => p.category).filter(Boolean))] as string[];
      return (
        <Wrap>
          <H>{s(d, "heading", "Shop by category")}</H>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {cats.map((c) => (
              <Link
                key={c}
                href={`${ctx.basePath}/products?category=${encodeURIComponent(c)}`}
                className="rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-card)] p-6 text-center text-sm font-semibold"
              >
                {c}
              </Link>
            ))}
          </div>
        </Wrap>
      );
    }

    case "image_text": {
      const flip = Boolean(d.flip);
      return (
        <Wrap>
          <div className={`grid items-center gap-8 md:grid-cols-2 ${flip ? "md:[direction:rtl]" : ""}`}>
            <div className="md:[direction:ltr]">
              <h2 className="text-2xl font-extrabold tracking-tight">{s(d, "heading")}</h2>
              <p className="mt-3 whitespace-pre-line text-[var(--sf-muted)]">{s(d, "body")}</p>
            </div>
            <div className="aspect-video overflow-hidden rounded-[var(--sf-radius)] bg-[var(--sf-card)] md:[direction:ltr]">
              {s(d, "imageUrl") && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={s(d, "imageUrl")} alt="" className="h-full w-full object-cover" loading="lazy" />
              )}
            </div>
          </div>
        </Wrap>
      );
    }

    case "rich_text":
      return (
        <Wrap>
          <H>{s(d, "heading")}</H>
          <p className="max-w-2xl whitespace-pre-line text-[var(--sf-muted)]">{s(d, "body")}</p>
        </Wrap>
      );

    case "testimonials": {
      const items = (Array.isArray(d.items) ? d.items : []) as { quote: string; name: string }[];
      if (!items.length) return null;
      return (
        <Wrap>
          <H>{s(d, "heading", "What customers say")}</H>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((t, i) => (
              <blockquote key={i} className="rounded-[var(--sf-radius)] border border-[var(--sf-line)] p-5">
                <p className="text-sm">&ldquo;{t.quote}&rdquo;</p>
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
          <H>{s(d, "heading", "Questions")}</H>
          <div className="max-w-2xl space-y-3">
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
          <div className="rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-card)] p-8 text-center">
            <h2 className="text-xl font-extrabold">{s(d, "heading", "Join our list")}</h2>
            {s(d, "subheading") && <p className="mt-1 text-sm text-[var(--sf-muted)]">{s(d, "subheading")}</p>}
            <form className="mx-auto mt-4 flex max-w-sm gap-2">
              <input
                type="email"
                required
                placeholder="you@example.com"
                className="h-10 flex-1 rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-bg)] px-3 text-sm"
              />
              <button className="rounded-[var(--sf-radius)] bg-[var(--sf-accent)] px-4 text-sm font-semibold text-white">
                Sign up
              </button>
            </form>
          </div>
        </Wrap>
      );

    case "logo_strip": {
      const logos = (Array.isArray(d.logos) ? d.logos : []) as string[];
      if (!logos.length) return null;
      return (
        <Wrap>
          <div className="flex flex-wrap items-center justify-center gap-8 opacity-70">
            {logos.map((l, i) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img key={i} src={l} alt="" className="h-8 w-auto" loading="lazy" />
            ))}
          </div>
        </Wrap>
      );
    }

    case "contact":
      return (
        <Wrap>
          <H>{s(d, "heading", "Visit us")}</H>
          <p className="text-sm text-[var(--sf-muted)]">
            See the <Link href={`${ctx.basePath}/contact`} className="underline">contact page</Link>.
          </p>
        </Wrap>
      );

    default:
      return null;
  }
}
