"use client";

import { usePathname } from "next/navigation";
import { MarketingShell } from "./site/MarketingShell";
import { GA4, MetaPixel } from "./tracking/Pixel";

/** Routes that render their own chrome (no marketing shell). */
const BARE_PREFIXES = [
  "/app",
  "/admin",
  "/onboarding",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/storefront-preview",
  "/s",
];

/**
 * First path segments the marketing site actually owns. Anything else with a
 * single slug-like segment is a storefront served from zotomic.com/<slug> and
 * must NOT get the marketing chrome. Keep in sync with middleware RESERVED_PATHS
 * and the app/* route folders.
 */
const MARKETING_SEGMENTS = new Set([
  "about",
  "contact",
  "help",
  "faq",
  "pricing",
  "features",
  "how-it-works",
  "intelligence",
  "assistant",
  "storefront",
  "privacy-policy",
  "terms",
  "refund-policy",
  "data-deletion",
  "legal",
]);

export default function ConditionalLayout({
  children,
  tracking,
}: {
  children: React.ReactNode;
  tracking?: { metaPixelId: string; ga4Id: string };
}) {
  const pathname = usePathname();
  const seg = pathname.split("/")[1] ?? "";

  const bareByPrefix = BARE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  // a non-root, non-marketing single segment → storefront path (zotomic.com/<slug>)
  const isStorefrontPath = seg !== "" && !MARKETING_SEGMENTS.has(seg) && !bareByPrefix;

  if (bareByPrefix || isStorefrontPath) return <>{children}</>;

  return (
    <>
      {tracking?.metaPixelId ? <MetaPixel id={tracking.metaPixelId} /> : null}
      {tracking?.ga4Id ? <GA4 id={tracking.ga4Id} /> : null}
      <MarketingShell>{children}</MarketingShell>
    </>
  );
}
