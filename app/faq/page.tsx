import type { Metadata } from "next";
import { getPlatformPage } from "@/lib/platform-pages";
import { RichFaq } from "@/components/site/RichLegal";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPlatformPage("faq");
  return { title: p.title, description: "Common questions about Zotomic." };
}

export default async function FaqPage() {
  const p = await getPlatformPage("faq");
  return <RichFaq title={p.title} body={p.body} updated={p.updatedAt} />;
}
