import type { Metadata } from "next";
import {
  BarChart3,
  Bell,
  Boxes,
  FileText,
  MessageSquareText,
  ShieldCheck,
  ShoppingCart,
  Store,
  Users,
} from "lucide-react";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/site/marketing";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Weekly business intelligence, a dashboard that stays useful between reports, a universal storefront, and an AI assistant that reads your business.",
};

const CORE = [
  { icon: BarChart3, title: "Weekly Intelligence", text: "A report every week: what changed, why, and what to do — with the evidence behind every claim." },
  { icon: FileText, title: "Report history", text: "Every past report, searchable, with the underlying metrics and insights kept intact." },
  { icon: MessageSquareText, title: "Zotomic Assistant", text: "Ask about any number or insight. It reads your business context and never invents data." },
  { icon: Store, title: "Universal storefront", text: "One clean, fast, mobile-first store — configure, preview, publish. Cash on delivery built in." },
  { icon: Boxes, title: "Products with real costs", text: "Track buying price and marketing cost so profit — not just revenue — is always visible." },
  { icon: ShoppingCart, title: "Orders & customers", text: "Every order and customer in one place, feeding the same engine that writes your reports." },
  { icon: Bell, title: "Alerts that matter", text: "Unusual returns, stock risk, a revenue dip — surfaced the moment they happen." },
  { icon: Users, title: "Customer intelligence", text: "New vs repeat customers, spend patterns, and who's worth keeping close." },
  { icon: ShieldCheck, title: "Your data, isolated", text: "Every business is a hard boundary. Credentials are encrypted. Nothing is shared." },
];

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        eyebrow="Features"
        title="Everything you need to run on the numbers"
        subtitle="No giant feature grid to wade through — just the tools that make a weekly decision easier."
      />
      <Section>
        <FeatureGrid items={CORE} />
      </Section>
      <CtaBand />
    </>
  );
}
