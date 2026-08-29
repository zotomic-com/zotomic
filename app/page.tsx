import type { Metadata } from "next";
import Script from "next/script";
import { ArrowRight, Eye, Lightbulb, ShieldCheck, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FlowDiagram } from "@/components/site/FlowDiagram";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zotomic.com";

export const metadata: Metadata = {
  title: "See. Understand. Act.",
  description:
    "Zotomic turns your business data into clarity — and clarity into action. Weekly intelligence, a universal storefront, and an AI assistant for small businesses.",
  alternates: { canonical: SITE_URL },
};

const STEPS = [
  { icon: Eye, title: "SEE", text: "what's happening across your business." },
  { icon: Lightbulb, title: "UNDERSTAND", text: "why it matters with clear insights and context." },
  { icon: Target, title: "ACT", text: "on what matters and grow with confidence." },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Zotomic",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Weekly business intelligence, a universal storefront, and an AI assistant for small businesses.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  url: SITE_URL,
};

export default function HomePage() {
  return (
    <>
      <Script
        id="ld-home"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-3xl px-4 py-12 text-center sm:px-6 sm:py-20">
        <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-fg-muted">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Business intelligence, without the complexity.
        </p>

        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-navy sm:text-6xl">
          See. <span className="text-primary">Understand.</span> Act.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-pretty text-base text-fg-muted sm:text-lg">
          Turn your business data into clarity — and clarity into action.
        </p>

        <div className="mt-8 flex flex-col items-center gap-2">
          <Button href="/signup" size="lg">
            Start free <ArrowRight className="h-4 w-4" />
          </Button>
          <p className="text-xs text-fg-subtle">No credit card required · Start in minutes</p>
        </div>

        <div className="mt-14">
          <FlowDiagram />
        </div>

        <div className="mt-14 grid gap-8 border-t border-border pt-12 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.title} className="flex flex-col items-center">
              <s.icon className="h-6 w-6 text-primary" />
              <p className="mt-3 text-sm font-bold tracking-wide text-navy">{s.title}</p>
              <p className="mt-1 max-w-[15rem] text-sm text-fg-muted">{s.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center gap-2">
          <Button href="/signup" size="lg">
            Start free <ArrowRight className="h-4 w-4" />
          </Button>
          <p className="text-xs text-fg-subtle">No credit card required · Start in minutes</p>
        </div>
      </div>
    </>
  );
}
