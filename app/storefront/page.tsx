import type { Metadata } from "next";
import { Gauge, Globe, Heart, Palette, Search, ShoppingBag } from "lucide-react";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/site/marketing";

export const metadata: Metadata = {
  title: "Storefront",
  description:
    "One universal storefront theme — fully configurable, mobile-first, fast, and readable by search engines and AI. Cash on delivery built in.",
};

const ITEMS = [
  { icon: Palette, title: "One universal theme", text: "No template maze. Set your brand, pick your sections, publish. It always looks right." },
  { icon: Gauge, title: "Built for speed", text: "Server-rendered and image-optimized — aiming for a perfect performance score on every store." },
  { icon: ShoppingBag, title: "COD checkout", text: "Cash on delivery is always available. Connect a payment gateway later if you want one." },
  { icon: Heart, title: "Wishlist & reviews", text: "Shoppers save favourites; verified buyers leave reviews you moderate." },
  { icon: Search, title: "Found by search & AI", text: "Clean URLs, structured data, and a per-store llms.txt so crawlers and assistants understand your catalog." },
  { icon: Globe, title: "Your own address", text: "Launch on a Zotomic subdomain in minutes; connect a custom domain when you're ready." },
];

export default function StorefrontPage() {
  return (
    <>
      <PageHero
        eyebrow="Storefront"
        title="A store that sells — and reports back"
        subtitle="Every order placed on your storefront flows into the same engine that writes your weekly intelligence."
      />
      <Section>
        <FeatureGrid items={ITEMS} />
      </Section>
      <CtaBand title="Launch your storefront" subtitle="Included on every plan. Start free." />
    </>
  );
}
