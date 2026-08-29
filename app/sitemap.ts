import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zotomic.com";

const ROUTES = [
  { path: "", priority: 1, changeFrequency: "weekly" as const },
  { path: "intelligence", priority: 0.9, changeFrequency: "monthly" as const },
  { path: "assistant", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "storefront", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "how-it-works", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "features", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "pricing", priority: 0.9, changeFrequency: "weekly" as const },
  { path: "about", priority: 0.6, changeFrequency: "monthly" as const },
  { path: "contact", priority: 0.6, changeFrequency: "monthly" as const },
  { path: "help", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "privacy-policy", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "terms", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "refund-policy", priority: 0.3, changeFrequency: "yearly" as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ROUTES.map((r) => ({
    url: `${BASE}${r.path ? `/${r.path}` : ""}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
