import Link from "next/link";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { getPlatformSettings, PLATFORM_KEYS, PLATFORM_KEY_GROUPS } from "@/lib/platform-settings";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { AutomationForm } from "./AutomationForm";

export const dynamic = "force-dynamic";

const MASK = "••••••••";

export default async function AdminIntegrationsPage() {
  await requireAdmin();
  const db = adminDb();
  const stored = await getPlatformSettings();

  const fields = PLATFORM_KEY_GROUPS.integrations.map((key) => ({
    key,
    label: PLATFORM_KEYS[key].label,
    secret: PLATFORM_KEYS[key].secret,
    value: PLATFORM_KEYS[key].secret ? (stored[key] ? MASK : "") : (stored[key] ?? ""),
  }));

  const [{ data: businesses }, { data: integrations }, { data: channels }] = await Promise.all([
    db.from("businesses").select("id, name").order("name"),
    db.from("integrations").select("business_id, provider, category, status, mode"),
    db.from("messaging_channels").select("business_id, provider, status"),
  ]);

  const byBiz = new Map<string, string[]>();
  const add = (id: string, label: string) => {
    const list = byBiz.get(id) ?? [];
    list.push(label);
    byBiz.set(id, list);
  };
  for (const i of integrations ?? []) {
    if (i.status === "connected") add(i.business_id as string, `${i.provider}${i.mode === "live" ? " (live)" : ""}`);
  }
  for (const c of channels ?? []) {
    if (c.status === "connected") add(c.business_id as string, c.provider as string);
  }

  const rows = (businesses ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    connected: byBiz.get(b.id as string) ?? [],
  }));

  const cols: Column<(typeof rows)[number]>[] = [
    {
      key: "name",
      header: "Business",
      render: (r) => (
        <Link href={`/admin/tenants/${r.id}`} className="font-medium text-primary">
          {r.name}
        </Link>
      ),
    },
    {
      key: "connected",
      header: "Connected integrations",
      render: (r) =>
        r.connected.length ? (
          <span className="flex flex-wrap gap-1">
            {r.connected.map((c) => (
              <Badge key={c} tone="success">
                {c}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="text-fg-subtle">none</span>
        ),
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Integrations"
        subtitle="Platform-level automation credentials, and a view of what every store has connected."
      />

      <AutomationForm fields={fields} />

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-fg">Store connections</h2>
          <p className="mt-0.5 text-sm text-fg-muted">
            Each store owner connects their own payment gateway, courier, pixels and Messenger /
            WhatsApp under their dashboard&apos;s Integrations page. Read-only overview here.
          </p>
        </div>
        <Card>
          <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} empty={{ title: "No businesses yet" }} />
        </Card>
      </section>
    </div>
  );
}
