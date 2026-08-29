import type { Metadata } from "next";
import Link from "next/link";
import { getStoreBySlug, getStoreProducts } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { ProductCard } from "@/components/storefront/ProductCard";

export const revalidate = 120;
export const metadata: Metadata = { title: "Products" };

export default async function StoreProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ category?: string }>;
}) {
  const { slug } = await params;
  const { category } = await searchParams;
  const store = await getStoreBySlug(slug);
  if (!store || !store.published) return null;

  const basePath = await storeBasePath(slug);
  const all = await getStoreProducts(store.businessId);
  const categories = [...new Set(all.map((p) => p.category).filter(Boolean))] as string[];
  const products = category ? all.filter((p) => p.category === category) : all;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight">
        {category ?? "All products"}
      </h1>

      {categories.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`${basePath}/products`}
            className={`rounded-[var(--sf-radius)] border border-[var(--sf-line)] px-3 py-1 text-xs ${
              !category ? "bg-[var(--sf-accent)] text-white" : ""
            }`}
          >
            All
          </Link>
          {categories.map((c) => (
            <Link
              key={c}
              href={`${basePath}/products?category=${encodeURIComponent(c)}`}
              className={`rounded-[var(--sf-radius)] border border-[var(--sf-line)] px-3 py-1 text-xs ${
                category === c ? "bg-[var(--sf-accent)] text-white" : ""
              }`}
            >
              {c}
            </Link>
          ))}
        </div>
      )}

      {products.length ? (
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} currency={store.currency} basePath={basePath} storeSlug={store.slug} />
          ))}
        </div>
      ) : (
        <p className="mt-8 text-sm text-[var(--sf-muted)]">No products here yet.</p>
      )}
    </div>
  );
}
