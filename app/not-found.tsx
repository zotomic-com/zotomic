import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-extrabold text-navy">404</p>
      <h1 className="mt-2 text-xl font-bold text-fg">Page not found</h1>
      <p className="mt-1 text-sm text-fg-muted">This page doesn&apos;t exist.</p>
      <Button href="/" className="mt-6">
        Back home
      </Button>
      <Link href="/contact" className="mt-3 text-sm text-fg-subtle underline">
        Contact support
      </Link>
    </div>
  );
}
