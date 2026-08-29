import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreBySlug } from "@/lib/storefront/store";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  return { title: store?.config.pages.about.title ?? "About" };
}

export default async function StoreAboutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const about = store.config.pages.about;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{about.title || "About us"}</h1>
      <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-[var(--sf-muted)]">
        {about.body || store.config.brand.tagline || `Welcome to ${store.name}.`}
      </p>
    </div>
  );
}
