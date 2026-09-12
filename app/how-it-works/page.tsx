import type { Metadata } from "next";
import { CtaBand, PageHero, Steps } from "@/components/site/marketing";
import { FlowDiagram } from "@/components/site/FlowDiagram";
import { getStructuralPage } from "@/lib/site-content";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getStructuralPage("how-it-works");
  return { title: c.seoTitle, description: c.seoDescription };
}

export default async function HowItWorksPage() {
  const c = await getStructuralPage("how-it-works");

  return (
    <>
      <PageHero eyebrow={c.badge} title={c.title} subtitle={c.subtitle} />
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <Steps items={c.items} />
      </div>
      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <FlowDiagram />
      </div>
      {c.ctaEnabled && <CtaBand title={c.ctaTitle || undefined} subtitle={c.ctaSubtitle || undefined} />}
    </>
  );
}
