import { requireUser } from "@/lib/app-actions";
import { PageHeader } from "@/components/app/PageHeader";
import { ServiceInquiryForm } from "../service-inquiries/ServiceInquiryForm";

export const dynamic = "force-dynamic";

export default async function AppAutomationPage() {
  await requireUser();
  return (
    <div className="space-y-5">
      <PageHeader title="Automation" subtitle="Automate the busywork — orders, replies, reports — coming soon." />
      <ServiceInquiryForm
        service="automation"
        title="Automation service"
        blurb="Tell us what you'd like to automate — order handling, customer replies, reporting, anything repetitive — and we'll follow up."
      />
    </div>
  );
}
