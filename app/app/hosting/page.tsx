import { requireUser } from "@/lib/app-actions";
import { PageHeader } from "@/components/app/PageHeader";
import { ServiceInquiryForm } from "../service-inquiries/ServiceInquiryForm";

export const dynamic = "force-dynamic";

export default async function AppHostingPage() {
  await requireUser();
  return (
    <div className="space-y-5">
      <PageHeader title="Hosting" subtitle="Fast, managed hosting for your website or store — coming soon." />
      <ServiceInquiryForm
        service="hosting"
        title="Hosting plans"
        blurb="We're putting together managed hosting plans. Tell us what you need and we'll follow up when it's ready — or sooner, if we can help now."
      />
    </div>
  );
}
