import type { Metadata } from "next";
import { CtaBand, PageHero, Section } from "@/components/site/marketing";
import { getStructuralPage } from "@/lib/site-content";
import { siteIcon } from "@/lib/site-icons";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getStructuralPage("intelligence");
  return { title: c.seoTitle, description: c.seoDescription };
}

export default async function IntelligencePage() {
  const c = await getStructuralPage("intelligence");

  return (
    <>
      <PageHero eyebrow={c.badge} title={c.title} subtitle={c.subtitle} />
      <Section>
        <div className="space-y-4">
          {c.items.map((b, i) => {
            const Icon = siteIcon(b.icon);
            return (
              <div key={i} className="flex gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-bold text-fg">{b.title}</p>
                  <p className="mt-1 text-sm text-fg-muted">{b.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Section>
      {c.body && (
        <Section title={c.bodyTitle}>
          <p className="max-w-2xl text-sm text-fg-muted">{c.body}</p>
        </Section>
      )}
      {c.ctaEnabled && <CtaBand title={c.ctaTitle || undefined} subtitle={c.ctaSubtitle || undefined} />}
    </>
  );
}
