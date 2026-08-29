import type { Metadata } from "next";
import { getPlatformPage } from "@/lib/platform-pages";
import { RichLegal } from "@/components/site/RichLegal";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPlatformPage("terms");
  return { title: p.title, description: "The terms that govern your use of Zotomic." };
}

export default async function TermsPage() {
  const p = await getPlatformPage("terms");
  return <RichLegal title={p.title} body={p.body} updated={p.updatedAt} />;
}
