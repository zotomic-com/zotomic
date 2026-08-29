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
    products: number | "unlimited";
    assistantMessagesPerDay: number;
    seats: number;
  };
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
      "Up to 30 products",
      "Assistant: limited",
    ],
    limits: { reportsPerMonth: 4, products: 30, assistantMessagesPerDay: 10, seats: 1 },
  },
  {
    id: "business",
    name: "Business",
    priceBDT: 1500,
    tagline: "For stores running on the numbers.",
    featured: true,
    features: [
      "Everything in Free",
      "Unlimited products & report history",
      "Richer intelligence & alerts",
      "Full assistant access",
      "Courier integration",
      "Custom domain",
    ],
    limits: { reportsPerMonth: "unlimited", products: "unlimited", assistantMessagesPerDay: 100, seats: 3 },
  },
  {
    id: "pro",
    name: "Pro",
    priceBDT: null,
    tagline: "For teams that need more.",
    features: [
      "Everything in Business",
      "Server-side tracking + Search Console",
      "Priority support",
      "Higher assistant & automation limits",
      "More seats",
    ],
    limits: { reportsPerMonth: "unlimited", products: "unlimited", assistantMessagesPerDay: 500, seats: 10 },
  },
];

export function formatPrice(p: Plan): string {
  if (p.priceBDT === null) return "Custom";
  if (p.priceBDT === 0) return "৳0";
  return `৳${p.priceBDT.toLocaleString("en-US")}`;
}
