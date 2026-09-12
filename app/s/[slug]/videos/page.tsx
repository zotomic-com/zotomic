import type { Metadata } from "next";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { getStoreBySlug, getStoreCategories, getStoreProducts } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { getStorefrontVideosForRender } from "@/lib/storefront/videos";
import { SectionRenderer } from "@/components/storefront/Sections";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  return { title: store?.config.videoPage.title || "Videos", robots: store?.config.videoPage.enabled ? undefined : { index: false } };
}

export default async function StoreVideosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const { videoPage } = store.config;
  if (!videoPage.enabled) notFound();

  const videos = await getStorefrontVideosForRender(store.businessId);
  if (!videos.length) notFound(); // feature off for this store, or the library is empty

  const basePath = await storeBasePath(slug);
  const [products, categories] = await Promise.all([getStoreProducts(store.businessId), getStoreCategories(store.businessId)]);
  const ctx = { products, categories, videos, currency: store.currency, basePath, storeSlug: store.slug };

  const enabledSections = videoPage.sections.filter((s) => s.enabled);

  return (
    <div>
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{videoPage.title || "Videos"}</h1>
      </div>
      {enabledSections.length === 0 ? (
        <p className="mx-auto max-w-6xl px-4 py-12 text-sm text-[var(--sf-muted)] sm:px-6">Nothing to show yet.</p>
      ) : (
        enabledSections.map((section) => (
          <Fragment key={section.id}>
            <SectionRenderer section={section} ctx={ctx} />
          </Fragment>
        ))
      )}
    </div>
  );
}
