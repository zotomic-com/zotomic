import { getBusinessCategories } from "@/lib/business-categories";
import { OnboardingForm } from "./OnboardingForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const categories = await getBusinessCategories();
  const labels = categories.length ? categories.map((c) => c.label) : ["Other"];
  return <OnboardingForm categories={labels} />;
}
