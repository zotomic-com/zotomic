import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { PageHeader } from "@/components/app/PageHeader";
import { ReviewsClient, type ReviewRow } from "./ReviewsClient";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId) redirect("/onboarding");

  const db = getAdminSupabase();
  const { data } = await db
    .from("product_reviews")
    .select("id, rating, title, body, reviewer_name, status, created_at, products(name)")
    .eq("business_id", tenant.businessId)
    .order("created_at", { ascending: false })
    .limit(200);

  const reviews = (data ?? []).map((r) => ({
    id: r.id as string,
    rating: Number(r.rating),
    title: (r.title as string) ?? null,
    body: (r.body as string) ?? null,
    reviewer_name: (r.reviewer_name as string) ?? null,
    status: r.status as ReviewRow["status"],
    created_at: r.created_at as string,
    product:
      ((Array.isArray(r.products) ? r.products[0] : r.products) as { name?: string } | null)?.name ??
      "Product",
  }));

  return (
    <div className="space-y-5">
      <PageHeader title="Reviews" subtitle="Verified-buyer reviews. Approve to show them on your storefront." />
      <ReviewsClient reviews={reviews} />
    </div>
  );
}
