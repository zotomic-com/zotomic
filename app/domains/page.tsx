import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/site/marketing";
import { getDomainSettings } from "@/lib/platform-settings";
import { DomainsClient } from "./DomainsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Buy a domain",
  description: "Search and register a domain, paid by bKash or Nagad.",
};

export default async function DomainsPage() {
  const settings = await getDomainSettings();
  if (!settings.enabled) notFound();

  return (
    <>
      <PageHero
        eyebrow="Domains"
        title="Find your domain"
        subtitle="Search a name, add it to your cart, and pay by bKash or Nagad — no card needed."
      />
      <DomainsClient />
    </>
  );
}
