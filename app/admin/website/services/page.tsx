import { requireAdmin } from "@/lib/admin-server";
import { PageHeader } from "@/components/app/PageHeader";
import { getAllServiceCards } from "@/lib/service-cards";
import { ServiceCardsEditor } from "./ServiceCardsEditor";

export const dynamic = "force-dynamic";

export default async function AdminWebsiteServicesPage() {
  await requireAdmin();
  const cards = await getAllServiceCards();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Services catalog"
        subtitle="The service cards shown on the public /services page — mark each live (with a link) or coming soon."
      />
      <ServiceCardsEditor cards={cards} />
    </div>
  );
}
