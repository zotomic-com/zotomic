import { getBusinessCategories } from "@/lib/business-categories";
import { getSiteBranding } from "@/lib/platform-settings";
import { OnboardingForm } from "./OnboardingForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const [categories, branding] = await Promise.all([getBusinessCategories(), getSiteBranding()]);
  const labels = categories.length ? categories.map((c) => c.label) : ["Other"];
  return <OnboardingForm categories={labels} logoUrl={branding.logoUrl} />;
}
