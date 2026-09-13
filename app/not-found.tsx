"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Root not-found boundary — the only one in the app, so it catches notFound()
 * calls from anywhere, including deep inside /admin/* or /app/*. "Back" must
 * go to whichever dashboard the URL was under, not the public marketing home.
 */
export default function NotFound() {
  const pathname = usePathname();
  const inAdmin = pathname.startsWith("/admin");
  const inApp = pathname.startsWith("/app");
  const home = inAdmin ? "/admin" : inApp ? "/app" : "/";

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-extrabold text-navy">404</p>
      <h1 className="mt-2 text-xl font-bold text-fg">Page not found</h1>
      <p className="mt-1 text-sm text-fg-muted">This page doesn&apos;t exist.</p>
      <Button href={home} className="mt-6">
        {inAdmin || inApp ? "Back to dashboard" : "Back home"}
      </Button>
      <Link href="/contact" className="mt-3 text-sm text-fg-subtle underline">
        Contact support
      </Link>
    </div>
  );
}
