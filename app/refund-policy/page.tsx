import type { Metadata } from "next";
import { getPlatformPage } from "@/lib/platform-pages";
import { RichLegal } from "@/components/site/RichLegal";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPlatformPage("refund");
  return { title: p.title, description: "Zotomic's refund policy for subscription plans." };
}

export default async function RefundPolicyPage() {
  const p = await getPlatformPage("refund");
  return <RichLegal title={p.title} body={p.body} updated={p.updatedAt} />;
}
