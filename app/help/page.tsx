import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/site/marketing";
import { getStructuralPage } from "@/lib/site-content";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getStructuralPage("help");
  return { title: c.seoTitle, description: c.seoDescription };
}

export default async function HelpPage() {
  const c = await getStructuralPage("help");

  return (
    <>
      <PageHero eyebrow={c.badge} title={c.title} subtitle={c.subtitle || undefined} />
      <Section>
        <div className="space-y-4">
          {c.items.map((f, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
              <p className="text-sm font-bold text-fg">{f.title}</p>
              <p className="mt-1.5 text-sm text-fg-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Still stuck?">
        <p className="text-sm text-fg-muted">
          Reach us any time via the{" "}
          <Link href="/contact" className="font-semibold text-primary">
            contact form
          </Link>
          . We reply within 24 hours.
        </p>
      </Section>
    </>
  );
}
