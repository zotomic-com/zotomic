import type { Metadata } from "next";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { PLANS, formatPrice } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/site/marketing";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple, transparent plans. Free to start — no credit card required.",
};

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Start free. Upgrade when it pays for itself."
        subtitle="Plan limits are configurable — these are starting points, not commercial law."
      />

      <div className="mx-auto grid max-w-5xl gap-4 px-4 pb-6 sm:px-6 lg:grid-cols-3">
        {PLANS.map((p) => (
          <div
            key={p.id}
            className={cn(
              "flex flex-col rounded-lg border bg-surface p-6 shadow-sm",
              p.featured ? "border-primary ring-1 ring-primary" : "border-border",
            )}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-fg">{p.name}</p>
              {p.featured && (
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
                  Popular
                </span>
              )}
            </div>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-navy">
              {formatPrice(p)}
              {p.priceBDT ? <span className="text-sm font-medium text-fg-subtle">/mo</span> : null}
            </p>
            <p className="mt-1 text-sm text-fg-muted">{p.tagline}</p>

            <Button
              href={p.id === "pro" ? "/contact" : "/signup"}
              variant={p.featured ? "primary" : "outline"}
              className="mt-5 w-full"
            >
              {p.id === "pro" ? "Contact us" : "Start free"}
            </Button>

            <ul className="mt-6 space-y-2">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-fg-muted">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mx-auto max-w-5xl px-4 pb-16 text-center text-xs text-fg-subtle sm:px-6">
        Prices in BDT. Billing is confirmed manually — pay by bKash, submit your transaction ID, and
        your account unlocks as soon as we confirm it.
      </p>
    </>
  );
}
