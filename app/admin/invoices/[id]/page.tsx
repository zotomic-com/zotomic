import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { getInvoice, renderInvoiceHtml } from "@/lib/admin-invoices";
import { InvoiceDetailClient } from "./InvoiceDetailClient";

export const dynamic = "force-dynamic";

export default async function AdminInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const db = adminDb();

  const [inv, { data: businesses }] = await Promise.all([
    getInvoice(id),
    db.from("businesses").select("id, name").order("name"),
  ]);
  if (!inv) notFound();

  return (
    <div className="space-y-5">
      <Link href="/admin/invoices" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Invoices
      </Link>

      <InvoiceDetailClient
        invoice={inv}
        businesses={(businesses ?? []).map((b) => ({ id: b.id as string, name: b.name as string }))}
      />

      <div
        className="print-sheet mx-auto max-w-[680px] rounded-lg"
        dangerouslySetInnerHTML={{ __html: renderInvoiceHtml(inv) }}
      />
    </div>
  );
}
