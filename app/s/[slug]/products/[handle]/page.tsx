import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flame, Star, Truck } from "lucide-react";
import {
  getProductReviews,
  getStoreBySlug,
  getStoreProduct,
  getStoreProductVariants,
  getStoreProducts,
} from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { money } from "@/lib/money";
import { ProductCard } from "@/components/storefront/ProductCard";
import { ProductGallery } from "@/components/storefront/ProductGallery";
import { AddToCartButton } from "@/components/storefront/AddToCartButton";
import { WishlistHeart } from "@/components/storefront/WishlistHeart";
import { TrackEvent } from "@/components/tracking/TrackEvent";
import { StorefrontEvent } from "@/components/storefront/StorefrontTracker";

export const revalidate = 120;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; handle: string }>;
}): Promise<Metadata> {
  const { slug, handle } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return {};
  const product = await getStoreProduct(store.businessId, handle);
  if (!product) return { title: "Not found" };
  return {
    title: product.name,
    description: (product.description ?? "").slice(0, 155) || `${product.name} — ${store.name}`,
    openGraph: { images: product.imageUrls.slice(0, 1) },
  };
}

export default async function StoreProductPage({
  params,
}: {
  params: Promise<{ slug: string; handle: string }>;
}) {
  const { slug, handle } = await params;
  const store = await getStoreBySlug(slug);
  if (!store || !store.published) notFound();

  const basePath = await storeBasePath(slug);
  const product = await getStoreProduct(store.businessId, handle);
  if (!product) notFound();

  const { options: variantOptions, variants } = await getStoreProductVariants(
    store.businessId,
    product.id,
    product.price,
  );
  const onSale = product.salePrice != null && product.salePrice < product.price;
  const soldOut = variants.length
    ? variants.every((v) => v.soldOut)
    : product.trackInventory && product.stockQty <= 0;
  const lowStock = !variants.length && product.trackInventory && product.stockQty > 0 && product.stockQty <= 5;
  const related = (await getStoreProducts(store.businessId))
    .filter((p) => p.id !== product.id && p.category === product.category)
    .slice(0, 4);

  const { reviews, average, count } = await getProductReviews(store.businessId, product.id);
  const c = store.config.commerce;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    image: product.imageUrls,
    offers: {
      "@type": "Offer",
      price: (onSale ? product.salePrice! : product.price).toFixed(2),
      priceCurrency: store.currency,
      availability: soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
    },
    ...(count
      ? {
          aggregateRating: { "@type": "AggregateRating", ratingValue: average.toFixed(1), reviewCount: count },
          review: reviews.slice(0, 5).map((r) => ({
            "@type": "Review",
            reviewRating: { "@type": "Rating", ratingValue: r.rating },
            author: { "@type": "Person", name: r.reviewerName },
            ...(r.body ? { reviewBody: r.body } : {}),
          })),
        }
      : {}),
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <TrackEvent
        event="ViewContent"
        params={{ content_name: product.name, content_ids: [product.id], value: onSale ? product.salePrice! : product.price, currency: store.currency }}
      />
      <StorefrontEvent storeSlug={store.slug} type="product_view" productId={product.id} value={onSale ? product.salePrice! : product.price} />

      <nav className="mb-5 text-xs text-[var(--sf-muted)]">
        <Link href={basePath || "/"} className="hover:underline">Home</Link> ·{" "}
        <Link href={`${basePath}/products`} className="hover:underline">Products</Link>
        {product.category && (
          <>
            {" · "}
            <Link href={`${basePath}/products?category=${encodeURIComponent(product.category)}`} className="hover:underline">
              {product.category}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-8 md:grid-cols-2 md:gap-10">
        <ProductGallery images={product.imageUrls} name={product.name} />

        <div className="md:sticky md:top-24 md:self-start">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{product.name}</h1>
            <WishlistHeart
              storeSlug={store.slug}
              item={{ id: product.id, name: product.name, price: onSale ? product.salePrice! : product.price, image: product.imageUrls[0] ?? null, slug: product.slug }}
              size={20}
              className="mt-1 shrink-0 rounded-full border border-[var(--sf-line)] p-2"
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--sf-muted)]">
            {count > 0 && (
              <a href="#reviews" className="flex items-center gap-1">
                <span className="flex">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className="h-3.5 w-3.5 text-amber-400" fill={average >= n - 0.25 ? "currentColor" : "none"} />
                  ))}
                </span>
                <span className="font-medium text-[var(--sf-fg)]">{average.toFixed(1)}</span>
                <span>({count})</span>
              </a>
            )}
            {product.sold > 0 && (
              <span className="flex items-center gap-1">
                <Flame className="h-3.5 w-3.5" /> {product.sold} sold
              </span>
            )}
            {lowStock && <span className="font-semibold text-red-600">Only {product.stockQty} left</span>}
          </div>

          <p className="mt-3 text-2xl font-bold">
            {onSale ? (
              <>
                {money(product.salePrice!, store.currency)}{" "}
                <span className="text-base font-medium text-[var(--sf-muted)] line-through">{money(product.price, store.currency)}</span>
              </>
            ) : (
              money(product.price, store.currency)
            )}
          </p>

          {product.description && (
            <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm text-[var(--sf-muted)]">{product.description}</p>
          )}

          <div className="mt-5">
            <AddToCartButton
              product={{ id: product.id, name: product.name, price: onSale ? product.salePrice! : product.price, image: product.imageUrls[0] ?? null, slug: product.slug }}
              soldOut={soldOut}
              currency={store.currency}
              storeSlug={store.slug}
              basePath={basePath}
              options={variantOptions}
              variants={variants}
              sizeChartUrl={c.sizeChartUrl}
            />
          </div>

          <div className="mt-5 space-y-2 rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-card)] p-3 text-sm text-[var(--sf-muted)]">
            <p className="flex items-center gap-2">
              <Truck className="h-4 w-4 shrink-0" />
              {c.codEnabled ? "Cash on delivery available" : "Prepaid orders only"}
            </p>
            <p className="pl-6">
              Delivery {money(c.shippingFlatRate, store.currency)}
              {c.freeShippingOver ? ` · free over ${money(c.freeShippingOver, store.currency)}` : ""}
            </p>
          </div>
        </div>
      </div>

      {product.description && product.description.length > 220 && (
        <div className="mt-14 max-w-2xl">
          <h2 className="text-lg font-extrabold tracking-tight">Description</h2>
          <p className="mt-3 whitespace-pre-line text-sm text-[var(--sf-muted)]">{product.description}</p>
        </div>
      )}

      {count > 0 && (
        <div id="reviews" className="mt-14 scroll-mt-24">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold tracking-tight">Reviews</h2>
            <span className="flex items-center gap-1 text-sm text-[var(--sf-muted)]">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              {average.toFixed(1)} ({count})
            </span>
          </div>
          <ul className="mt-4 space-y-4">
            {reviews.map((r) => (
              <li key={r.id} className="border-b border-[var(--sf-line)] pb-4">
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
        </div>
      )}

      {related.length > 0 && (
        <div className="mt-14">
          <h2 className="mb-6 text-lg font-extrabold tracking-tight">You might also like</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} currency={store.currency} basePath={basePath} storeSlug={store.slug} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
