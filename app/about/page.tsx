import type { Metadata } from "next";
import { CtaBand, PageHero, Section } from "@/components/site/marketing";
import { getStructuralPage } from "@/lib/site-content";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getStructuralPage("about");
  return { title: c.seoTitle, description: c.seoDescription };
}

export default async function AboutPage() {
  const c = await getStructuralPage("about");

  return (
    <>
      <PageHero eyebrow={c.badge} title={c.title} subtitle={c.subtitle} />
      {c.body && (
        <Section title={c.bodyTitle}>
          <p className="max-w-2xl text-sm leading-relaxed text-fg-muted">{c.body}</p>
        </Section>
      )}
      {c.items.length > 0 && (
        <Section title={c.itemsTitle || undefined}>
          <ul className="max-w-2xl space-y-2 text-sm text-fg-muted">
            {c.items.map((item, i) => (
              <li key={i}>• {item.text}</li>
            ))}
          </ul>
        </Section>
      )}
      {c.ctaEnabled && <CtaBand title={c.ctaTitle || undefined} subtitle={c.ctaSubtitle || undefined} />}
    </>
  );
}
