import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminSupabase } from "@/lib/supabase";
import { getStoreBySlug } from "@/lib/storefront/store";
import { ReviewForm } from "./ReviewForm";

export const metadata: Metadata = { title: "Write a review", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const db = getAdminSupabase();
  const { data: tok } = await db
    .from("review_tokens")
    .select("token, used_at, products(name), business_id")
    .eq("token", token)
    .eq("business_id", store.businessId)
    .maybeSingle();

  if (!tok) notFound();
  const product = (Array.isArray(tok.products) ? tok.products[0] : tok.products) as { name?: string } | null;

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Write a review</h1>
      {tok.used_at ? (
        <p className="mt-4 text-sm text-[var(--sf-muted)]">This review link has already been used.</p>
      ) : (
        <div className="mt-6">
          <ReviewForm token={token} productName={product?.name ?? "purchase"} />
        </div>
      )}
    </div>
  );
}
