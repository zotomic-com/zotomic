import type { Metadata } from "next";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/site/marketing";
import { getStructuralPage } from "@/lib/site-content";
import { siteIcon } from "@/lib/site-icons";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getStructuralPage("features");
  return { title: c.seoTitle, description: c.seoDescription };
}

export default async function FeaturesPage() {
  const c = await getStructuralPage("features");
  const items = c.items.map((i) => ({ icon: siteIcon(i.icon), title: i.title, text: i.text }));

  return (
    <>
      <PageHero eyebrow={c.badge} title={c.title} subtitle={c.subtitle} />
      <Section>
        <FeatureGrid items={items} />
      </Section>
      {c.ctaEnabled && <CtaBand title={c.ctaTitle || undefined} subtitle={c.ctaSubtitle || undefined} />}
    </>
  );
}
