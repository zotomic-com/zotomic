import { notFound, redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getInvoiceData, renderInvoiceHtml } from "@/lib/invoice";
import { InvoiceActions } from "./InvoiceActions";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId) redirect("/onboarding");

  const data = await getInvoiceData(tenant.businessId, id);
  if (!data) notFound();

  return (
    <div className="space-y-4">
      <InvoiceActions invoiceId={id} defaultEmail={data.business.email ?? tenant.user.email} />
      <div
        className="print-sheet mx-auto max-w-[680px] rounded-lg"
        dangerouslySetInnerHTML={{ __html: renderInvoiceHtml(data) }}
      />
    </div>
  );
}
