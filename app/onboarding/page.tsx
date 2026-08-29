import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/PagePlaceholder";

export const metadata: Metadata = { title: "Get started" };

export default function OnboardingPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <PagePlaceholder
        title="Set up your business"
        phase="Phase 1"
        description="Business name & type → currency & timezone → connect a data source. All skippable."
      />
    </div>
  );
}
