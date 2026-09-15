import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-server";
import { PageHeader } from "@/components/app/PageHeader";
import { STRUCTURAL_SLUGS, STRUCTURAL_META, getStructuralPage, getCustomPageForAdmin, type StructuralSlug } from "@/lib/site-content";
import { getAllPlanCards } from "@/lib/plan-cards";
import { getAllContactTopics } from "@/lib/contact-topics";
import { getAllPortfolioItems } from "@/lib/portfolio";
import { getAllWebDevPricingPackages } from "@/lib/webdev-pricing";
import { StructuralPageEditor } from "./StructuralPageEditor";
import { CustomPageEditor } from "./CustomPageEditor";
import { PricingCardsEditor } from "./PricingCardsEditor";
import { ContactTopicsEditor } from "./ContactTopicsEditor";
import { PortfolioEditor } from "./PortfolioEditor";
import { WebDevPricingEditor } from "./WebDevPricingEditor";

export const dynamic = "force-dynamic";

function isStructural(slug: string): slug is StructuralSlug {
  return (STRUCTURAL_SLUGS as readonly string[]).includes(slug);
}

export default async function EditPagePage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const { slug } = await params;

  if (isStructural(slug)) {
    const content = await getStructuralPage(slug);
    const planCards = slug === "pricing" ? await getAllPlanCards() : null;
    const contactTopics = slug === "contact" ? await getAllContactTopics() : null;
    const portfolioItems = slug === "web-development" ? await getAllPortfolioItems() : null;
    const webDevPricing = slug === "web-development" ? await getAllWebDevPricingPackages() : null;
    return (
      <div className="space-y-5">
        <PageHeader title={STRUCTURAL_META[slug].label} subtitle={`Fixed page at ${STRUCTURAL_META[slug].route}`} />
        <StructuralPageEditor slug={slug} initial={content} />
        {planCards && (
          <>
            <PageHeader title="Pricing cards" subtitle="The plan cards shown on this page." />
            <PricingCardsEditor cards={planCards} />
          </>
        )}
        {contactTopics && <ContactTopicsEditor topics={contactTopics} />}
        {portfolioItems && (
          <>
            <PageHeader title="Client portfolio" subtitle="Past work shown in the carousel on this page." />
            <PortfolioEditor items={portfolioItems} />
          </>
        )}
        {webDevPricing && (
          <>
            <PageHeader title="Pricing packages" subtitle="The pricing cards shown on this page." />
            <WebDevPricingEditor packages={webDevPricing} />
          </>
        )}
      </div>
    );
  }

  const page = await getCustomPageForAdmin(slug);
  if (!page) notFound();
  return (
    <div className="space-y-5">
      <PageHeader title={page.title} subtitle={`${page.locked ? "Legal page" : "Custom page"} at ${page.route}`} />
      <CustomPageEditor page={page} />
    </div>
  );
}
