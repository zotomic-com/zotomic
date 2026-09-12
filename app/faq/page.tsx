import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedCustomPage } from "@/lib/site-content";
import { RichFaq } from "@/components/site/RichLegal";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPublishedCustomPage("faq");
  return { title: p?.seoTitle || p?.title, description: p?.seoDescription || "Common questions about Zotomic." };
}

export default async function FaqPage() {
  const p = await getPublishedCustomPage("faq");
  if (!p) notFound();
  return <RichFaq title={p.title} body={p.body} updated={p.updatedAt} />;
}
