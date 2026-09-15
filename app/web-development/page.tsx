import type { Metadata } from "next";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { PageHero, Section, FeatureGrid, Steps } from "@/components/site/marketing";
import { getStructuralPage } from "@/lib/site-content";
import { siteIcon } from "@/lib/site-icons";
import { getWebDevPricingPackages } from "@/lib/webdev-pricing";
import { PortfolioCarousel } from "@/components/site/PortfolioCarousel";
import { WebDevLeadForm } from "@/components/site/WebDevLeadForm";

const PROCESS_STEPS = [
  { title: "Consult", text: "A short call to understand what you need and what success looks like." },
  { title: "Design", text: "A look and layout built around your brand, shared with you before any code is written." },
  { title: "Build", text: "The site gets built, tested on real devices, and reviewed with you along the way." },
  { title: "Launch", text: "We publish it, make sure everything works, and hand it over — fully yours." },
];

export async function generateMetadata(): Promise<Metadata> {
  const c = await getStructuralPage("web-development");
  return { title: c.seoTitle, description: c.seoDescription };
}

export default async function WebDevelopmentPage() {
  const [c, packages] = await Promise.all([getStructuralPage("web-development"), getWebDevPricingPackages()]);
  const items = c.items.map((i) => ({ icon: siteIcon(i.icon), title: i.title, text: i.text }));

  return (
    <>
      <PageHero eyebrow={c.badge} title={c.title} subtitle={c.subtitle}>
        <Button href="#inquiry" size="lg">
          Start your project
        </Button>
      </PageHero>

      <PortfolioCarousel />

      <Section title={c.itemsTitle || "What's included"}>
        <FeatureGrid items={items} />
      </Section>

      <Section title="How it works">
        <Steps items={PROCESS_STEPS} />
      </Section>

      {packages.length > 0 && (
        <Section title="Packages">
          <div className="grid gap-4 lg:grid-cols-3">
            {packages.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "flex flex-col rounded-lg border bg-surface p-6 shadow-sm",
                  p.featured ? "border-primary ring-1 ring-primary" : "border-border",
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-fg">{p.name}</p>
                  {p.badge && (
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">{p.badge}</span>
                  )}
                </div>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-navy">{p.priceLabel}</p>
                <p className="mt-1 text-sm text-fg-muted">{p.tagline}</p>
                {p.buttonText && (
                  <Button href={p.buttonHref || "#inquiry"} variant={p.featured ? "primary" : "outline"} className="mt-5 w-full">
                    {p.buttonText}
                  </Button>
                )}
                <ul className="mt-6 space-y-2">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-fg-muted">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}

      {c.items2.length > 0 && (
        <Section title={c.items2Title || "Questions"}>
          <div className="space-y-4">
            {c.items2.map((f, i) => (
              <div key={i} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
                <p className="text-sm font-bold text-fg">{f.title}</p>
                <p className="mt-1.5 text-sm text-fg-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title={c.ctaTitle || "Have a project in mind?"} description={c.ctaSubtitle}>
        <div className="mx-auto max-w-lg">
          <WebDevLeadForm />
        </div>
      </Section>
    </>
  );
}
