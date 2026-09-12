import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedCustomPage } from "@/lib/site-content";
import { RichLegal } from "@/components/site/RichLegal";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPublishedCustomPage(slug);
  if (!p) return {};
  return { title: p.seoTitle || p.title, description: p.seoDescription || undefined };
}

export default async function CustomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPublishedCustomPage(slug);
  if (!p) notFound();
  return <RichLegal title={p.title} body={p.body} updated={p.updatedAt} kicker="Page" />;
}
