import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreBySlug, getStoreProduct, getStoreProducts } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { money } from "@/lib/money";
import { ProductCard } from "@/components/storefront/ProductCard";
import { AddToCartButton } from "@/components/storefront/AddToCartButton";

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

  const onSale = product.salePrice != null && product.salePrice < product.price;
  const soldOut = product.trackInventory && product.stockQty <= 0;
  const related = (await getStoreProducts(store.businessId))
    .filter((p) => p.id !== product.id && p.category === product.category)
    .slice(0, 4);

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
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

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
              <img src={product.imageUrls[0]} alt={product.name} className="h-full w-full object-cover" />
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
          <h1 className="text-2xl font-extrabold tracking-tight">{product.name}</h1>
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

      {related.length > 0 && (
        <div className="mt-16">
          <h2 className="mb-6 text-xl font-extrabold tracking-tight">You might also like</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} currency={store.currency} basePath={basePath} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
