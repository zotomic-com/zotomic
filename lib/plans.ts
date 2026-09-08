/**
 * Plan catalogue. Commercial assumptions live here and in the DB `subscriptions`
 * table — never hard-coded into business logic. Prices are placeholders until
 * set from measured usage; treat `null` as "contact us".
 */
export type PlanId = "free" | "business" | "pro";

export interface Plan {
  id: PlanId;
  name: string;
  priceBDT: number | null;
  tagline: string;
  featured?: boolean;
  features: string[];
  limits: {
    reportsPerMonth: number | "unlimited";
    /** hard cap on active/draft products a store may hold */
    products: number;
    /** images per product (enforced client + server) */
    productImages: number;
    /** hero-banner images (1 = single static hero; >1 = slideshow) */
    heroImages: number;
    /** legacy per-day assistant message cap — superseded by the credit system (Phase 9C) */
    assistantMessagesPerDay: number;
    seats: number;
  };
  /** weekly assistant-credit allowance (Phase 9C). Resets every Friday. */
  weeklyCredits: number;
  /** hard daily ceiling on web-search / grounded tool calls (Phase 9C) */
  webSearchPerDay: number;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceBDT: 0,
    tagline: "See your business clearly, at no cost.",
    features: [
      "Weekly Intelligence report",
      "Dashboard with period comparison",
      "Universal storefront + COD checkout",
      "Up to 10 products, 3 images each",
      "1 hero banner image",
      "Assistant: 15 credits / week",
    ],
    limits: {
      reportsPerMonth: 4,
      products: 10,
      productImages: 3,
      heroImages: 1,
      assistantMessagesPerDay: 10,
      seats: 1,
    },
    weeklyCredits: 15,
    webSearchPerDay: 5,
  },
  {
    id: "business",
    name: "Business",
    priceBDT: 1500,
    tagline: "For stores running on the numbers.",
    featured: true,
    features: [
      "Everything in Free",
      "Up to 100 products, 5 images each",
      "3 hero banner images",
      "Unlimited report history",
      "Richer intelligence & alerts",
      "Assistant: 250 credits / week",
      "Courier integration",
      "Custom domain",
    ],
    limits: {
      reportsPerMonth: "unlimited",
      products: 100,
      productImages: 5,
      heroImages: 3,
      assistantMessagesPerDay: 100,
      seats: 3,
    },
    weeklyCredits: 250,
    webSearchPerDay: 30,
  },
  {
    id: "pro",
    name: "Pro",
    priceBDT: null,
    tagline: "For teams that need more.",
    features: [
      "Everything in Business",
      "Up to 100 products, 5 images each",
      "Server-side tracking + Search Console",
      "Priority support",
      "Assistant: 1,200 credits / week",
      "More seats",
    ],
    limits: {
      reportsPerMonth: "unlimited",
      products: 100,
      productImages: 5,
      heroImages: 3,
      assistantMessagesPerDay: 500,
      seats: 10,
    },
    weeklyCredits: 1200,
    webSearchPerDay: 100,
  },
];

export function formatPrice(p: Plan): string {
  if (p.priceBDT === null) return "Custom";
  if (p.priceBDT === 0) return "৳0";
  return `৳${p.priceBDT.toLocaleString("en-US")}`;
}
