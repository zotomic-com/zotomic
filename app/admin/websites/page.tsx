import { requireAdmin, adminDb } from "@/lib/admin-server";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const ROOT = process.env.STOREFRONT_ROOT_DOMAIN ?? "zotomic.com";

export default async function AdminWebsitesPage() {
  await requireAdmin();
  const db = adminDb();

  const { data } = await db
    .from("storefront_config")
    .select("business_id, subdomain, published_at, published_version, businesses(name)")
    .order("published_at", { ascending: false, nullsFirst: false });

  const rows = (data ?? []).map((s) => ({
    id: s.business_id as string,
    business: ((Array.isArray(s.businesses) ? s.businesses[0] : s.businesses) as { name?: string } | null)?.name ?? "—",
    url: s.subdomain ? `${s.subdomain}.${ROOT}` : "—",
    published: !!s.published_at,
    version: (s.published_version as number) ?? 0,
    at: s.published_at ? new Date(s.published_at as string).toLocaleDateString("en-US") : "—",
  }));

  const cols: Column<(typeof rows)[number]>[] = [
    { key: "business", header: "Business", render: (r) => <span className="font-medium text-fg">{r.business}</span> },
    { key: "url", header: "Address", render: (r) => <span className="font-mono text-xs">{r.url}</span> },
    {
      key: "published",
      header: "Status",
      render: (r) => <Badge tone={r.published ? "success" : "neutral"}>{r.published ? "Published" : "Draft"}</Badge>,
    },
    { key: "version", header: "Version", align: "right", render: (r) => `v${r.version}` },
    { key: "at", header: "Last publish", align: "right", render: (r) => r.at },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-fg">Websites</h1>
        <p className="mt-1 text-sm text-fg-muted">Tenant storefronts.</p>
      </div>
      <Card>
        <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} empty={{ title: "No storefronts yet" }} />
      </Card>
    </div>
  );
}
