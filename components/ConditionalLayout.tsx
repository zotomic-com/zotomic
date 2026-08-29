"use client";

import { usePathname } from "next/navigation";
import { MarketingShell } from "./site/MarketingShell";

/** Routes that render their own chrome (no marketing shell). */
const BARE_PREFIXES = ["/app", "/admin", "/onboarding", "/login", "/signup", "/forgot-password"];

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (bare) return <>{children}</>;

  return <MarketingShell>{children}</MarketingShell>;
}
