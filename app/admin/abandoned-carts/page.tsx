import Link from "next/link";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { money } from "@/lib/money";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { getAbandonedCartSummary, getRecentCarts } from "@/lib/storefront/abandoned-cart";

export const dynamic = "force-dynamic";

const num = (n: number) => n.toLocaleString("en-US");
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};

export default async function AdminAbandonedCartsPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  await requireAdmin();
  const db = adminDb();
  const { store: focus } = await searchParams;
  const now = Date.now();

  const { data: businesses } = await db
    .from("businesses")
    .select("id, name, currency, status")
    .eq("status", "active");

  const stores = businesses ?? [];
  const summaries = await Promise.all(
    stores.map((b) =>
      getAbandonedCartSummary(b.id as string, new Date(now - 30 * 86400000), new Date(now)).then((s) => ({
        id: b.id as string,
        name: b.name as string,
        currency: (b.currency as string) ?? "BDT",
        ...s,
      })),
    ),
  );
  const active = summaries.filter((s) => s.hasData).sort((a, b) => b.abandonedCarts - a.abandonedCarts);

  const totalAbandoned = active.reduce((n, s) => n + s.abandonedCarts, 0);
  const totalValue = active.reduce((n, s) => n + s.estimatedLostValue, 0);
  const totalRegistered = active.reduce((n, s) => n + s.registeredCartSessions, 0);

  const focusStore = focus ? summaries.find((s) => s.id === focus) : null;
  const focusCarts = focusStore ? await getRecentCarts(focusStore.id, 14, 60, true) : [];

  const cols: Column<(typeof active)[number]>[] = [
    {
      key: "name",
      header: "Store",
      render: (r) => (
        <Link href={`/admin/abandoned-carts?store=${r.id}`} className="font-medium text-primary hover:underline">
          {r.name}
        </Link>
      ),
    },
    { key: "carts", header: "Cart sessions · 30d", align: "right", render: (r) => num(r.cartSessions) },
    { key: "orders", header: "Orders", align: "right", render: (r) => num(r.orders) },
    {
      key: "abandoned",
      header: "Abandoned",
      align: "right",
      render: (r) => (
        <span className={r.cartAbandonRate != null && r.cartAbandonRate >= 70 ? "font-semibold text-danger" : ""}>
          {num(r.abandonedCarts)}
          {r.cartAbandonRate != null && <span className="text-fg-subtle"> ({r.cartAbandonRate}%)</span>}
        </span>
      ),
    },
    { key: "registered", header: "Signed-in", align: "right", render: (r) => num(r.registeredCartSessions) },
    { key: "value", header: "Est. value left", align: "right", render: (r) => money(r.estimatedLostValue, r.currency) },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-fg">Abandoned carts</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Cart sessions vs orders across every store, last 30 days. Derived from storefront activity — carts aren&apos;t
          stored server-side.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Abandoned carts · 30d" value={num(totalAbandoned)} />
        <StatCard label="From signed-in shoppers" value={num(totalRegistered)} />
        <StatCard label="Est. value left · 30d" value={money(totalValue, "BDT")} />
      </div>

      {focusStore && (
        <Card>
          <CardHeader>
            <CardTitle>{focusStore.name} — recent carts</CardTitle>
            <Link href="/admin/abandoned-carts" className="text-xs font-semibold text-primary">
              ← all stores
            </Link>
          </CardHeader>
          <ul className="divide-y divide-border text-sm">
            {focusCarts.length === 0 && <li className="px-4 py-3 text-fg-subtle">No cart activity in the last 14 days.</li>}
            {focusCarts.map((c) => (
              <li key={c.session} className="flex flex-wrap items-start justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">
                  {c.shopper.type === "registered" ? (
                    <>
                      <span className="font-medium text-fg">{c.shopper.name}</span>
                      <span className="ml-2 text-xs text-fg-muted">
                        {[c.shopper.phone, c.shopper.email].filter(Boolean).join(" · ")}
                      </span>
                    </>
                  ) : (
                    <span className="font-medium text-fg">
                      Guest <span className="font-mono text-xs text-fg-subtle">#{c.session}</span>
                    </span>
                  )}
                  <span className="block text-xs text-fg-subtle">
                    {c.items} item{c.items === 1 ? "" : "s"}
                    {c.value > 0 ? ` · ${money(c.value, focusStore.currency)}` : ""} · {ago(c.lastActivity)}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  {c.reachedCheckout && <Badge tone="warning">checkout</Badge>}
                  {c.likelyAbandoned ? <Badge tone="danger">abandoned</Badge> : <Badge tone="neutral">active</Badge>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <DataTable columns={cols} rows={active} rowKey={(r) => r.id} empty={{ title: "No cart activity yet" }} />
      </Card>
    </div>
  );
}
