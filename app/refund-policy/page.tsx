import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedCustomPage } from "@/lib/site-content";
import { RichLegal } from "@/components/site/RichLegal";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPublishedCustomPage("refund");
  return { title: p?.seoTitle || p?.title, description: p?.seoDescription || "Zotomic's refund policy for subscription plans." };
}

export default async function RefundPolicyPage() {
  const p = await getPublishedCustomPage("refund");
  if (!p) notFound();
  return <RichLegal title={p.title} body={p.body} updated={p.updatedAt} />;
}
