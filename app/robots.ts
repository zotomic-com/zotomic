import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zotomic.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/app/", "/admin/", "/onboarding/"] },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
