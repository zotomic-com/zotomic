import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedCustomPage } from "@/lib/site-content";
import { RichLegal } from "@/components/site/RichLegal";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPublishedCustomPage("privacy");
  return { title: p?.seoTitle || p?.title, description: p?.seoDescription || "How Zotomic collects, uses, and protects your data." };
}

export default async function PrivacyPolicyPage() {
  const p = await getPublishedCustomPage("privacy");
  if (!p) notFound();
  return <RichLegal title={p.title} body={p.body} updated={p.updatedAt} />;
}
