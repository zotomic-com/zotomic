import type { Metadata } from "next";
import { getStoreBySlug, getStoreCategories, getStoreProducts } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { ProductCard } from "@/components/storefront/ProductCard";
import { CategoryChips } from "@/components/storefront/CategoryChips";
import { StoreSearchBar } from "@/components/storefront/StoreSearchBar";

export const revalidate = 120;
export const metadata: Metadata = { title: "Products" };

export default async function StoreProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { slug } = await params;
  const { category, q } = await searchParams;
  const store = await getStoreBySlug(slug);
  if (!store || !store.published) return null;

  const basePath = await storeBasePath(slug);
  const [all, categories] = await Promise.all([
    getStoreProducts(store.businessId),
    getStoreCategories(store.businessId),
  ]);
  const term = (q ?? "").trim().toLowerCase();
  const products = all.filter((p) => {
    if (category && p.category !== category) return false;
    if (term) {
      const hay = `${p.name} ${p.description ?? ""} ${p.category ?? ""}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {term ? `Results for “${q}”` : category ?? "All products"}
        </h1>
        <p className="text-sm text-[var(--sf-muted)]">{products.length} item{products.length === 1 ? "" : "s"}</p>
      </div>

      <div className="mt-4">
        <StoreSearchBar basePath={basePath} initial={q ?? ""} />
      </div>

      {categories.length > 0 && (
        <div className="mt-5">
          <CategoryChips categories={categories} basePath={basePath} active={category} />
        </div>
      )}

      {products.length ? (
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} currency={store.currency} basePath={basePath} storeSlug={store.slug} />
          ))}
        </div>
      ) : (
        <p className="mt-10 text-sm text-[var(--sf-muted)]">No products here yet.</p>
      )}
    </div>
  );
}
