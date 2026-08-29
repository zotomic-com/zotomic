import Link from "next/link";
import { getStoreBySlug, getStoreProducts } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { SectionRenderer } from "@/components/storefront/Sections";

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

  const products = await getStoreProducts(store.businessId);
  const ctx = { products, currency: store.currency, basePath };

  return (
    <>
      {store.config.sections.map((section) => (
        <SectionRenderer key={section.id} section={section} ctx={ctx} />
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
