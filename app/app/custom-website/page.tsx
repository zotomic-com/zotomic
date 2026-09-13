import { requireUser } from "@/lib/app-actions";
import { PageHeader } from "@/components/app/PageHeader";
import { ServiceInquiryForm } from "../service-inquiries/ServiceInquiryForm";

export const dynamic = "force-dynamic";

export default async function AppCustomWebsitePage() {
  await requireUser();
  return (
    <div className="space-y-5">
      <PageHeader title="Custom Website" subtitle="A professionally designed site, built for you — coming soon." />
      <ServiceInquiryForm
        service="custom_website"
        title="Custom website design & development"
        blurb="Want a custom-built site beyond your storefront? Describe what you have in mind and we'll get back to you."
      />
    </div>
  );
}
