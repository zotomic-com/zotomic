import type { Metadata } from "next";
import { CtaBand, PageHero, Section } from "@/components/site/marketing";
import { getStructuralPage } from "@/lib/site-content";
import { siteIcon } from "@/lib/site-icons";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getStructuralPage("assistant");
  return { title: c.seoTitle, description: c.seoDescription };
}

export default async function AssistantPage() {
  const c = await getStructuralPage("assistant");

  return (
    <>
      <PageHero eyebrow={c.badge} title={c.title} subtitle={c.subtitle} />
      <Section title={c.itemsTitle || undefined}>
        <ul className="space-y-2">
          {c.items.map((item, i) => {
            const Icon = siteIcon(item.icon);
            return (
              <li key={i} className="flex items-start gap-2.5 text-sm text-fg-muted">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {item.title ? <span><strong className="text-fg">{item.title}: </strong>{item.text}</span> : item.text}
              </li>
            );
          })}
        </ul>
      </Section>
      {c.items2.length > 0 && (
        <Section>
          <div className="grid gap-4 sm:grid-cols-2">
            {c.items2.map((b, i) => {
              const Icon = siteIcon(b.icon);
              return (
                <div key={i} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
                  <Icon className="h-5 w-5 text-primary" />
                  <p className="mt-3 text-sm font-bold text-fg">{b.title}</p>
                  <p className="mt-1 text-sm text-fg-muted">{b.text}</p>
                </div>
              );
            })}
          </div>
        </Section>
      )}
      {c.ctaEnabled && <CtaBand title={c.ctaTitle || undefined} subtitle={c.ctaSubtitle || undefined} />}
    </>
  );
}
