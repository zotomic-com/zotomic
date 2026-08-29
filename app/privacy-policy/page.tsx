import type { Metadata } from "next";
import { getPlatformPage } from "@/lib/platform-pages";
import { RichLegal } from "@/components/site/RichLegal";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPlatformPage("privacy");
  return { title: p.title, description: "How Zotomic collects, uses, and protects your data." };
}

export default async function PrivacyPolicyPage() {
  const p = await getPlatformPage("privacy");
  return <RichLegal title={p.title} body={p.body} updated={p.updatedAt} />;
}
