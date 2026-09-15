import type { Metadata } from "next";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/site/marketing";
import { getStructuralPage } from "@/lib/site-content";
import { siteIcon } from "@/lib/site-icons";
import { StorefrontCarousel } from "@/components/site/StorefrontCarousel";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getStructuralPage("storefront");
  return { title: c.seoTitle, description: c.seoDescription };
}

export default async function StorefrontPage() {
  const c = await getStructuralPage("storefront");
  const items = c.items.map((i) => ({ icon: siteIcon(i.icon), title: i.title, text: i.text }));

  return (
    <>
      <PageHero eyebrow={c.badge} title={c.title} subtitle={c.subtitle} />
      <Section>
        <FeatureGrid items={items} />
      </Section>
      <StorefrontCarousel />
      {c.ctaEnabled && <CtaBand title={c.ctaTitle || undefined} subtitle={c.ctaSubtitle || undefined} />}
    </>
  );
}
