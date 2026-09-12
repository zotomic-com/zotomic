import type { Metadata } from "next";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/site/marketing";
import { getStructuralPage } from "@/lib/site-content";
import { getPlanCards } from "@/lib/plan-cards";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getStructuralPage("pricing");
  return { title: c.seoTitle, description: c.seoDescription };
}

export default async function PricingPage() {
  const [c, cards] = await Promise.all([getStructuralPage("pricing"), getPlanCards()]);

  return (
    <>
      <PageHero eyebrow={c.badge} title={c.title} subtitle={c.subtitle} />

      <div className="mx-auto grid max-w-5xl gap-4 px-4 pb-6 sm:px-6 lg:grid-cols-3">
        {cards.map((p) => (
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
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
                  {p.badge}
                </span>
              )}
            </div>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-navy">
              {p.priceLabel}
              {p.priceBDT ? <span className="text-sm font-medium text-fg-subtle">/mo</span> : null}
            </p>
            <p className="mt-1 text-sm text-fg-muted">{p.tagline}</p>

            {p.buttonText && (
              <Button href={p.buttonHref || "/signup"} variant={p.featured ? "primary" : "outline"} className="mt-5 w-full">
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

      {c.body && <p className="mx-auto max-w-5xl px-4 pb-16 text-center text-xs text-fg-subtle sm:px-6">{c.body}</p>}
    </>
  );
}
