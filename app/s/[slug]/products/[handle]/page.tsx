import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import {
  getProductReviews,
  getStoreBySlug,
  getStoreProduct,
  getStoreProductVariants,
  getStoreProducts,
} from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { money } from "@/lib/money";
import { cldUrl } from "@/lib/cloudinary";
import { ProductCard } from "@/components/storefront/ProductCard";
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
  const related = (await getStoreProducts(store.businessId))
    .filter((p) => p.id !== product.id && p.category === product.category)
    .slice(0, 4);

  const { reviews, average, count } = await getProductReviews(store.businessId, product.id);

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
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: average.toFixed(1),
            reviewCount: count,
          },
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
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <TrackEvent
        event="ViewContent"
        params={{ content_name: product.name, content_ids: [product.id], value: onSale ? product.salePrice! : product.price, currency: store.currency }}
      />
      <StorefrontEvent storeSlug={store.slug} type="product_view" productId={product.id} value={onSale ? product.salePrice! : product.price} />

      <nav className="mb-6 text-xs text-[var(--sf-muted)]">
        <Link href={basePath || "/"} className="hover:underline">Home</Link> ·{" "}
        <Link href={`${basePath}/products`} className="hover:underline">Products</Link> ·{" "}
        <span>{product.name}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="grid gap-3">
          <div className="aspect-square overflow-hidden rounded-[var(--sf-radius)] bg-[var(--sf-card)]">
            {product.imageUrls[0] ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={cldUrl(product.imageUrls[0], 900)}
                alt={product.name}
                width={900}
                height={900}
                className="h-full w-full object-cover"
                decoding="async"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[var(--sf-muted)]">
                No image
              </div>
            )}
          </div>
          {product.imageUrls.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {product.imageUrls.slice(1, 5).map((u, i) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img key={i} src={u} alt="" className="aspect-square w-full rounded-[var(--sf-radius)] object-cover" />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight">{product.name}</h1>
            <WishlistHeart
              storeSlug={store.slug}
              item={{
                id: product.id,
                name: product.name,
                price: onSale ? product.salePrice! : product.price,
                image: product.imageUrls[0] ?? null,
                slug: product.slug,
              }}
              size={22}
              className="mt-1 shrink-0 rounded-full border border-[var(--sf-line)] p-2"
            />
          </div>
          <p className="mt-2 text-xl">
            {onSale ? (
              <>
                <span className="font-bold">{money(product.salePrice!, store.currency)}</span>{" "}
                <span className="text-[var(--sf-muted)] line-through">{money(product.price, store.currency)}</span>
              </>
            ) : (
              <span className="font-bold">{money(product.price, store.currency)}</span>
            )}
          </p>

          {product.description && (
            <p className="mt-4 whitespace-pre-line text-sm text-[var(--sf-muted)]">{product.description}</p>
          )}

          <div className="mt-6">
            <AddToCartButton
              product={{
                id: product.id,
                name: product.name,
                price: onSale ? product.salePrice! : product.price,
                image: product.imageUrls[0] ?? null,
                slug: product.slug,
              }}
              soldOut={soldOut}
              currency={store.currency}
              storeSlug={store.slug}
              options={variantOptions}
              variants={variants}
            />
          </div>

          <div className="mt-6 space-y-2 border-t border-[var(--sf-line)] pt-4 text-sm text-[var(--sf-muted)]">
            <p>{store.config.commerce.codEnabled ? "Cash on delivery available" : "Prepaid orders only"}</p>
            <p>
              Delivery: {money(store.config.commerce.shippingFlatRate, store.currency)} flat
              {store.config.commerce.freeShippingOver
                ? ` · free over ${money(store.config.commerce.freeShippingOver, store.currency)}`
                : ""}
            </p>
          </div>
        </div>
      </div>

      {count > 0 && (
        <div className="mt-16">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold tracking-tight">Reviews</h2>
            <span className="flex items-center gap-1 text-sm text-[var(--sf-muted)]">
              <Star className="h-4 w-4 text-[var(--sf-accent)]" fill="currentColor" />
              {average.toFixed(1)} ({count})
            </span>
          </div>
          <ul className="mt-4 space-y-4">
            {reviews.map((r) => (
              <li key={r.id} className="border-b border-[var(--sf-line)] pb-4">
                <div className="flex items-center gap-2">
                  <span className="flex">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className="h-3.5 w-3.5 text-[var(--sf-accent)]"
                        fill={r.rating >= n ? "currentColor" : "none"}
                      />
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
        <div className="mt-16">
          <h2 className="mb-6 text-xl font-extrabold tracking-tight">You might also like</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} currency={store.currency} basePath={basePath} storeSlug={store.slug} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
