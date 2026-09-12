import type { Metadata } from "next";
import Script from "next/script";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FlowDiagram } from "@/components/site/FlowDiagram";
import { getStructuralPage } from "@/lib/site-content";
import { siteIcon } from "@/lib/site-icons";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zotomic.com";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getStructuralPage("home");
  return { title: c.seoTitle, description: c.seoDescription, alternates: { canonical: SITE_URL } };
}

function splitHighlight(title: string, highlight: string) {
  if (!highlight || !title.includes(highlight)) return [{ text: title, hi: false }];
  const i = title.indexOf(highlight);
  const parts: { text: string; hi: boolean }[] = [];
  if (i > 0) parts.push({ text: title.slice(0, i), hi: false });
  parts.push({ text: highlight, hi: true });
  if (i + highlight.length < title.length) parts.push({ text: title.slice(i + highlight.length), hi: false });
  return parts;
}

export default async function HomePage() {
  const c = await getStructuralPage("home");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Zotomic",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: c.seoDescription,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: SITE_URL,
  };

  return (
    <>
      <Script
        id="ld-home"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-3xl px-4 py-12 text-center sm:px-6 sm:py-20">
        {c.badge && (
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-fg-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            {c.badge}
          </p>
        )}

        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-navy sm:text-6xl">
          {splitHighlight(c.title, c.titleHighlight).map((p, i) =>
            p.hi ? (
              <span key={i} className="text-primary">
                {p.text}
              </span>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </h1>
        {c.subtitle && (
          <p className="mx-auto mt-4 max-w-md text-pretty text-base text-fg-muted sm:text-lg">{c.subtitle}</p>
        )}

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
          {c.items.map((s, i) => {
            const Icon = siteIcon(s.icon);
            return (
              <div key={i} className="flex flex-col items-center">
                <Icon className="h-6 w-6 text-primary" />
                <p className="mt-3 text-sm font-bold tracking-wide text-navy">{s.title}</p>
                <p className="mt-1 max-w-[15rem] text-sm text-fg-muted">{s.text}</p>
              </div>
            );
          })}
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
