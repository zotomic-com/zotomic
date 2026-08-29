import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreBySlug } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { StoreShell } from "@/components/storefront/StoreShell";

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return { title: "Store not found" };
  return {
    title: { default: store.name, template: `%s${store.config.seo.titleSuffix}` },
    description: store.config.seo.description,
    robots: store.config.seo.allowAiCrawlers ? undefined : { index: true, follow: true },
    openGraph: {
      title: store.name,
      description: store.config.seo.description,
      images: store.config.seo.ogImageUrl ? [store.config.seo.ogImageUrl] : undefined,
    },
  };
}

export default async function StoreLayout({ children, params }: Props) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const basePath = await storeBasePath(slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: store.name,
    description: store.config.seo.description,
    ...(store.config.contact.phone ? { telephone: store.config.contact.phone } : {}),
    ...(store.config.contact.address ? { address: store.config.contact.address } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <StoreShell config={store.config} basePath={basePath} storeSlug={store.slug}>
        {children}
      </StoreShell>
    </>
  );
}
