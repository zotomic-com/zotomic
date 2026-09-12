import Link from "next/link";
import { FileText, Palette, ListTree, Search, Tags, Settings2, ArrowRight } from "lucide-react";
import { requireAdmin } from "@/lib/admin-server";
import { PageHeader } from "@/components/app/PageHeader";
import { getAllStructuralPages, getAllCustomPages } from "@/lib/site-content";
import { getAllBusinessCategories } from "@/lib/business-categories";
import { getPlatformSettings } from "@/lib/platform-settings";

export const dynamic = "force-dynamic";

const SECTIONS = [
  {
    href: "/admin/website/pages",
    icon: FileText,
    title: "Pages",
    text: "Every page on zotomic.com — edit the fixed pages, add/edit/delete custom pages, publish or unpublish.",
  },
  {
    href: "/admin/website/branding",
    icon: Palette,
    title: "Logo, favicon & footer",
    text: "The site logo, browser favicon, footer tagline, trust strip and copyright line.",
  },
  {
    href: "/admin/website/navigation",
    icon: ListTree,
    title: "Header & footer navigation",
    text: "The links shown in the top drawer and the footer columns — add, edit, delete, reorder, hide.",
  },
  {
    href: "/admin/website/seo",
    icon: Search,
    title: "SEO & Search Console",
    text: "Paste your Google Search Console verification code, plus Meta Pixel and GA4 tracking.",
  },
  {
    href: "/admin/website/categories",
    icon: Tags,
    title: "Store categories",
    text: "The business-type options shown when a new store owner registers.",
  },
  {
    href: "/admin/website/settings",
    icon: Settings2,
    title: "General settings",
    text: "Telegram bot, payment numbers for manual billing, and the invoice sender address.",
  },
];

export default async function AdminWebsitePage() {
  await requireAdmin();
  const [pages, customPages, categories, settings] = await Promise.all([
    getAllStructuralPages(),
    getAllCustomPages(),
    getAllBusinessCategories(),
    getPlatformSettings(),
  ]);

  const publishedCustom = customPages.filter((p) => p.status === "published").length;
  const gscConnected = !!settings.google_site_verification;

  return (
    <div className="space-y-5">
      <PageHeader title="Website" subtitle="Everything on zotomic.com — content, branding, navigation, SEO and store setup — in one place." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group flex flex-col rounded-lg border border-border bg-surface p-5 shadow-sm transition-colors hover:border-primary"
          >
            <s.icon className="h-5 w-5 text-primary" />
            <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-fg">
              {s.title}
              <ArrowRight className="h-3.5 w-3.5 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
            </p>
            <p className="mt-1 text-sm text-fg-muted">{s.text}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Pages</p>
          <p className="mt-1 text-2xl font-extrabold text-navy">
            {pages.length + customPages.length}
          </p>
          <p className="text-xs text-fg-subtle">{pages.length} fixed · {customPages.length} custom ({publishedCustom} published)</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Store categories</p>
          <p className="mt-1 text-2xl font-extrabold text-navy">{categories.filter((c) => c.enabled).length}</p>
          <p className="text-xs text-fg-subtle">{categories.length} total, {categories.length - categories.filter((c) => c.enabled).length} hidden</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Search Console</p>
          <p className="mt-1 text-2xl font-extrabold text-navy">{gscConnected ? "Verified" : "Not set up"}</p>
          <p className="text-xs text-fg-subtle">{gscConnected ? "Verification code is live" : "Paste a code under SEO"}</p>
        </div>
      </div>
    </div>
  );
}
