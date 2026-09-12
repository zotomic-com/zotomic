import { Fragment } from "react";
import Link from "next/link";
import { getStoreBySlug, getStoreCategories, getStoreProducts } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { SectionRenderer } from "@/components/storefront/Sections";
import { CategoryChips } from "@/components/storefront/CategoryChips";
import { getStorefrontVideosForRender } from "@/lib/storefront/videos";

export const revalidate = 120;

export default async function StoreHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return null;

  const basePath = await storeBasePath(slug);

  if (!store.published) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <p className="text-2xl font-extrabold">{store.name}</p>
        <p className="mt-2 text-sm text-[var(--sf-muted)]">This store is coming soon.</p>
      </div>
    );
  }

  const sections = store.config.sections;
  const needsVideos = sections.some((s) => s.enabled && (s.type === "video_carousel" || s.type === "video_gallery"));

  const [products, categories, videos] = await Promise.all([
    getStoreProducts(store.businessId),
    getStoreCategories(store.businessId),
    needsVideos ? getStorefrontVideosForRender(store.businessId) : Promise.resolve([]),
  ]);
  const ctx = { products, categories, videos, currency: store.currency, basePath, storeSlug: store.slug };
  const firstEnabled = sections.find((s) => s.enabled);
  // auto-place a category strip right under the hero, unless the owner put a
  // "Shop by category" section somewhere themselves
  const autoCategories =
    categories.length > 0 &&
    firstEnabled?.type === "hero" &&
    !sections.some((s) => s.enabled && s.type === "category_grid");

  return (
    <>
      {sections.map((section) => (
        <Fragment key={section.id}>
          <SectionRenderer section={section} ctx={ctx} />
          {autoCategories && section.id === firstEnabled?.id && (
            <section className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
              <div className="mb-3 flex items-end justify-between gap-3">
                <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">Categories</h2>
                <Link href={`${basePath}/products`} className="shrink-0 text-sm font-semibold text-[var(--sf-accent)] hover:underline">
                  See all
                </Link>
              </div>
              <CategoryChips categories={categories} basePath={basePath} />
            </section>
          )}
        </Fragment>
      ))}
      {store.config.sections.every((s) => !s.enabled) && (
        <div className="mx-auto max-w-6xl px-4 py-20 text-center">
          <p className="text-sm text-[var(--sf-muted)]">
            Nothing to show yet.{" "}
            <Link href={`${basePath}/products`} className="underline">
              Browse products
            </Link>
          </p>
        </div>
      )}
    </>
  );
}
