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
  "/storefront-preview",
  "/s",
];

export default function ConditionalLayout({
  children,
  tracking,
}: {
  children: React.ReactNode;
  tracking?: { metaPixelId: string; ga4Id: string };
}) {
  const pathname = usePathname();
  const bare = BARE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (bare) return <>{children}</>;

  return (
    <>
      {tracking?.metaPixelId ? <MetaPixel id={tracking.metaPixelId} /> : null}
      {tracking?.ga4Id ? <GA4 id={tracking.ga4Id} /> : null}
      <MarketingShell>{children}</MarketingShell>
    </>
  );
}
