import { requireAdmin } from "@/lib/admin-server";
import { getAllPlatformPages, PLATFORM_PAGE_SLUGS, PLATFORM_PAGE_META } from "@/lib/platform-pages";
import { PageHeader } from "@/components/app/PageHeader";
import { PagesEditor, type EditablePage } from "./PagesEditor";

export const dynamic = "force-dynamic";

export default async function AdminContentPage() {
  await requireAdmin();
  const all = await getAllPlatformPages();

  const pages: EditablePage[] = PLATFORM_PAGE_SLUGS.map((slug) => ({
    slug,
    label: PLATFORM_PAGE_META[slug].label,
    route: PLATFORM_PAGE_META[slug].route,
    title: all[slug].title,
    body: all[slug].body,
    updatedAt: all[slug].updatedAt,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pages & Legal"
        subtitle="The Privacy, Terms, Refund and FAQ pages on zotomic.com. Store owners edit their own storefront pages separately."
      />
      <PagesEditor pages={pages} />
    </div>
  );
}
