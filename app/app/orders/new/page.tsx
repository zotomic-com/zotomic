import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { NewOrderClient } from "./NewOrderClient";

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");

  const db = getAdminSupabase();
  const { data } = await db
    .from("products")
    .select("id, name, price, sale_price")
    .eq("business_id", tenant.businessId)
    .neq("status", "archived")
    .order("name");

  const products = (data ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    price: Number(p.price),
    salePrice: p.sale_price == null ? null : Number(p.sale_price),
  }));

  return (
    <div className="space-y-5">
      <Link href="/app/orders" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Orders
      </Link>
      <PageHeader title="New order" subtitle="Record an order taken by phone, in person, or on social media." />
      {products.length === 0 ? (
        <EmptyState title="Add a product first" description="You need at least one product to create an order." action={{ label: "Add product", href: "/app/products" }} />
      ) : (
        <NewOrderClient products={products} currency={tenant.business.currency ?? "BDT"} />
      )}
    </div>
  );
}
