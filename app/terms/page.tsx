import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedCustomPage } from "@/lib/site-content";
import { RichLegal } from "@/components/site/RichLegal";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPublishedCustomPage("terms");
  return { title: p?.seoTitle || p?.title, description: p?.seoDescription || "The terms that govern your use of Zotomic." };
}

export default async function TermsPage() {
  const p = await getPublishedCustomPage("terms");
  if (!p) notFound();
  return <RichLegal title={p.title} body={p.body} updated={p.updatedAt} />;
}
