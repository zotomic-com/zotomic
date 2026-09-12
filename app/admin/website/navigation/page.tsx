import { requireAdmin } from "@/lib/admin-server";
import { PageHeader } from "@/components/app/PageHeader";
import { getAllNavLinks } from "@/lib/site-nav";
import { NavigationEditor } from "./NavigationEditor";

export const dynamic = "force-dynamic";

export default async function AdminWebsiteNavigationPage() {
  await requireAdmin();
  const [header, footer] = await Promise.all([getAllNavLinks("header"), getAllNavLinks("footer")]);

  return (
    <div className="space-y-5">
      <PageHeader title="Header & footer navigation" subtitle="The links shown in the top drawer and the footer columns, on every marketing page." />
      <NavigationEditor header={header} footer={footer} />
    </div>
  );
}
