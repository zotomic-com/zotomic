import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getProductReviews,
  getStoreBySlug,
  getStoreProduct,
  getStoreProductVariants,
  getStoreProducts,
} from "@/lib/storefront/store";
import { badgeFor } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { ProductCard } from "@/components/storefront/ProductCard";
import { ProductDetail } from "@/components/storefront/ProductDetail";
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
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <TrackEvent
        event="ViewContent"
        params={{ content_name: product.name, content_ids: [product.id], value: onSale ? product.salePrice! : product.price, currency: store.currency }}
      />
      <StorefrontEvent storeSlug={store.slug} type="product_view" productId={product.id} value={onSale ? product.salePrice! : product.price} />

      <ProductDetail
        product={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          price: product.price,
          salePrice: onSale ? product.salePrice : null,
          imageUrls: product.imageUrls,
          sold: product.sold,
          trackInventory: product.trackInventory,
          stockQty: product.stockQty,
          badge: badgeFor(product),
        }}
        currency={store.currency}
        storeSlug={store.slug}
        basePath={basePath}
        options={variantOptions}
        variants={variants}
        reviews={reviews}
        reviewAverage={average}
        reviewCount={count}
        commerce={{
          codEnabled: store.config.commerce.codEnabled,
          shippingFlatRate: store.config.commerce.shippingFlatRate,
          freeShippingOver: store.config.commerce.freeShippingOver,
          sizeChartUrl: store.config.commerce.sizeChartUrl,
        }}
        nav={store.config.nav}
      />

      {related.length > 0 && (
        <div className="mx-auto hidden max-w-6xl px-4 pb-16 sm:block sm:px-6">
          <h2 className="mb-6 text-lg font-extrabold tracking-tight">You might also like</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} currency={store.currency} basePath={basePath} storeSlug={store.slug} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
