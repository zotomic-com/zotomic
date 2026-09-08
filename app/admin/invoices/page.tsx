import { requireAdmin, adminDb } from "@/lib/admin-server";
import { listInvoices } from "@/lib/admin-invoices";
import { InvoicesClient } from "./InvoicesClient";

export const dynamic = "force-dynamic";

export default async function AdminInvoicesPage() {
  await requireAdmin();
  const db = adminDb();

  const [invoices, { data: businesses }] = await Promise.all([
    listInvoices({}),
    db.from("businesses").select("id, name").order("name"),
  ]);

  return (
    <InvoicesClient
      invoices={invoices}
      businesses={(businesses ?? []).map((b) => ({ id: b.id as string, name: b.name as string }))}
    />
  );
}
