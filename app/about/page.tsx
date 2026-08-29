import type { Metadata } from "next";
import { CtaBand, PageHero, Section } from "@/components/site/marketing";

export const metadata: Metadata = {
  title: "About",
  description:
    "Zotomic is a business-intelligence platform for small online businesses — starting with a weekly report that turns raw numbers into decisions.",
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About"
        title="Numbers you can act on"
        subtitle="Most small businesses have plenty of data and very little clarity. Zotomic closes that gap."
      />
      <Section title="What we're building">
        <p className="max-w-2xl text-sm leading-relaxed text-fg-muted">
          Zotomic is a multi-tenant business-intelligence platform for small online businesses. The
          opening product is Weekly Business Intelligence — a report that calculates your real
          performance (including profit, not just revenue), explains what changed, and hands you a
          short list of next steps. Around it sits a universal storefront and an AI assistant that
          reads your business context.
        </p>
      </Section>
      <Section title="How we work">
        <ul className="max-w-2xl space-y-2 text-sm text-fg-muted">
          <li>• Every number is calculated by code, not guessed by a model.</li>
          <li>• Your business is a hard boundary — data is never shared or pooled.</li>
          <li>• If something can&apos;t be calculated yet, we say so instead of showing a zero.</li>
          <li>• The website stays useful even when the assistant is offline.</li>
        </ul>
      </Section>
      <CtaBand />
    </>
  );
}
