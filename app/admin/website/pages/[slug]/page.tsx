import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-server";
import { PageHeader } from "@/components/app/PageHeader";
import { STRUCTURAL_SLUGS, STRUCTURAL_META, getStructuralPage, getCustomPageForAdmin, type StructuralSlug } from "@/lib/site-content";
import { getAllPlanCards } from "@/lib/plan-cards";
import { getAllContactTopics } from "@/lib/contact-topics";
import { StructuralPageEditor } from "./StructuralPageEditor";
import { CustomPageEditor } from "./CustomPageEditor";
import { PricingCardsEditor } from "./PricingCardsEditor";
import { ContactTopicsEditor } from "./ContactTopicsEditor";

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
