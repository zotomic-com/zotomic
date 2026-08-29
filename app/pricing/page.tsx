import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/PagePlaceholder";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple, transparent plans for Zotomic. Free to start.",
};

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <PagePlaceholder
        title="Pricing"
        phase="Phase 1"
        description="Configurable Free / Business / Pro plans — limits driven by config, never hard-coded."
      />
    </div>
  );
}
