import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/site/marketing";

export const metadata: Metadata = {
  title: "Help",
  description: "Answers to common questions about Zotomic, and how to reach support.",
};

const FAQ = [
  {
    q: "Do I need to connect anything to get started?",
    a: "No. You can add products and orders manually, upload a CSV, or connect a Facebook Page — all optional. Zotomic will show a clearly-labelled sample report until it has your real data.",
  },
  {
    q: "How is profit calculated?",
    a: "From the buying price and marketing cost you set on each product, subtracted from revenue. That's why you can see 'sales up, profit down' as early as week one.",
  },
  {
    q: "Is the storefront included?",
    a: "Yes, on every plan. One universal theme, mobile-first, with cash-on-delivery checkout built in. Payment gateways and custom domains come on paid plans.",
  },
  {
    q: "How does billing work?",
    a: "Manually, for now. You pay by bKash, submit your transaction ID, and your account unlocks as soon as we confirm it. If a payment lapses, your storefront stays live during a grace period.",
  },
  {
    q: "Can the assistant change things in my account?",
    a: "Only a small set of low-risk actions, and only with your explicit confirmation. It has no database access and can only see your own business.",
  },
];

export default function HelpPage() {
  return (
    <>
      <PageHero eyebrow="Help" title="Questions & answers" />
      <Section>
        <div className="space-y-4">
          {FAQ.map((f) => (
            <div key={f.q} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
              <p className="text-sm font-bold text-fg">{f.q}</p>
              <p className="mt-1.5 text-sm text-fg-muted">{f.a}</p>
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
